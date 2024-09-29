let userRepo = require('../repos/UserRepo');

let CampaignRepository = require('../repos/CampaignRepo');
let campaignRepo = new CampaignRepository();

let SubscriptionRepository = require('../repos/SubscriptionRepository');
let subscriptionRepo = new SubscriptionRepository();

let PackageRepository = require('../repos/PackageRepo');
let packageRepo = new PackageRepository()

const constants = require('../configurations/constants')
const config = require('../config');
const axios = require('axios');
var ObjectID = require('mongodb').ObjectID;

const BillingHistoryRabbitMq = require('../rabbit/BillingHistoryRabbitMq');
const rabbitMq = new BillingHistoryRabbitMq().getInstance();

const LocalRabbitMq = require('../rabbit/RabbitMq');
const localRabbitMq = new LocalRabbitMq().getInstance();

const {DateTime} = require('luxon');

const mongoose = require('mongoose');
const Callback = mongoose.model('Callback');
const helper = require('../helper/helper');

exports.callback = async (req, res) =>  {
    if(req.body.channel === 'SYSTEM') {
        // renewal callback
        localRabbitMq.addInQueue(config.queueNames.callbackDispatcher, req.body);
        res.status(200).send({status: 'OK', gw_transaction_id: req.body.gw_transaction_id}); 
        return;
    }else{
        processSubscription(req.body);
        res.status(200).send({status: 'OK', gw_transaction_id: req.body.gw_transaction_id}); 
        return;
    }
}

addCallbackRecord = async (body) => {
    let {msisdn, serviceId, status, subscriptionTime, renewalTime} = body;
    await new Callback({
        msisdn: `0${msisdn}`,
        serviceId: serviceId,
        status: status,
        subscriptionTime: subscriptionTime,
        renewalTime: renewalTime,
        rawResponse: JSON.stringify(body)
    }).save();
}

processSubscription = async(body) => {
    
    let {msisdn, serviceId, status, subscriptionTime, renewalTime} = body;
    await new Callback({
        msisdn: `0${msisdn}`,
        serviceId: serviceId,
        status: status,
        subscriptionTime: subscriptionTime,
        renewalTime: renewalTime,
        rawResponse: JSON.stringify(body)
    }).save();

    console.log(`*** ${status} - ${msisdn} ***`);
    let user = await userRepo.getUserByMsisdn(`0${msisdn}`);
    if(!user) {
        user = await userRepo.createUser(`0${msisdn}`,'dpdp');
        console.log('new user created', user);
    }

    let campaign = await campaignRepo.getCampaign(`0${msisdn}`);

    let subscription = await subscriptionRepo.getSubscriptionBySubscriberId(user._id);
    if(!subscription) {
        console.log('Service Id: ' + serviceId);
        let internalPackage = await packageRepo.getPackageByServiceId(serviceId);
        let postSubscription = {
            user_id: user._id,
            paywall_id: internalPackage.paywall_id,
            subscribed_package_id: internalPackage._id,
            subscription_status: status === 'ACTIVE' ? 'billed' : (status === 'PRE_ACTIVE' ? 'trial' : 'expired'),
            source: 'dpdp',
            is_allowed_to_stream: true,
            payment_source: 'telenor',
            next_billing_timestamp: new Date(renewalTime)
        }

        if(campaign) {
            console.log('######CAMPAIGN FOUND########')
            postSubscription.marketing_source = campaign.marketing_source;
            postSubscription.affiliate_unique_transaction_id = campaign.affiliate_tid;
            postSubscription.affiliate_mid = campaign.affiliate_mid;
            postSubscription.should_affiliation_callback_sent = (status === 'ACTIVE' ? true : false);
        }

        const isExist = await subscriptionRepo.isExist(postSubscription.user_id, postSubscription.paywall_id);
        if(isExist) {
            subscription = await subscriptionRepo.updateSubscription(isExist._id, postSubscription);
            console.log('existing subscription updated', subscription);
            
            assembleAndSendBillingHistory(user, subscription, internalPackage, body, status, internalPackage.price_point_pkr);
        }else {
            subscription = await subscriptionRepo.createSubscription(postSubscription);
            console.log('new subscription created', subscription);
            
            assembleAndSendBillingHistory(user, subscription, internalPackage, body, status, internalPackage.price_point_pkr);
            
            if(subscription.should_affiliation_callback_sent === true) {
                console.log('######SENDING CALLBACKS IF REQUIRED########')
                // execute callback
                let url = 'http://localhost:3004/subscription/send-callback';
                await axios.post(url, {
                    tid: campaign.affiliate_tid,
                    mid: campaign.affiliate_mid, 
                    msisdn: user.msisdn,
                    user_id: user._id,
                    subscription_id: subscription._id,
                    package_id: subscription.subscribed_package_id
                });
            }    
        }
        
        return;
    }

    let internalPackage = await packageRepo.getPackageByServiceId(serviceId);
    await updateSubscriptionRecord(user, internalPackage, subscription, status, body);
    return;
}

/**
 * '{"msisdn":"3476733767","serviceId":99146,"status":"ACTIVE","channel":"API","subscriptionTime":"2023-02-27T11:29:50.696Z","renewalTime":"2023-03-05T19:00:00.000Z","gw_transaction_id":"gw_logger-33olcjlemqmv1j-2023-02-27,11:29"}'
 */
exports.processCallback = async (body) => {
    
    let {msisdn, serviceId, status, subscriptionTime, renewalTime} = body;
    await new Callback({
        msisdn: `0${msisdn}`,
        serviceId: serviceId,
        status: status,
        subscriptionTime: subscriptionTime,
        renewalTime: renewalTime,
        rawResponse: JSON.stringify(body)
    }).save();

    if(msisdn, status) {
        let user = await userRepo.getUserByMsisdn(`0${msisdn}`);
        if(!user) {
            user = await userRepo.createUser(`0${msisdn}`,'dpdp');
        }

        let subscription = await subscriptionRepo.getSubscriptionBySubscriberId(user._id);
        if(!subscription) {
            console.log('Subscription does not exist: ' + user.msisdn);
            return;
        }

        let package = await packageRepo.getPackage({_id: subscription.subscribed_package_id});
        await updateSubscriptionRecord(user, package, subscription, status, body);
        return; 
    }else{
        console.log(`Bad request, please send all the required parameters i.e 'msisdn', 'status'`);
        return; 
    }
}

updateSubscriptionRecord = async(user, package, subscription, status, fullApiResponse) => {
    
    // update subscription
    let subscriptionObj = {};
    
    subscriptionObj.auto_renewal = true;
    subscriptionObj.is_billable_in_this_cycle = false;
    subscriptionObj.queued = false;
    subscriptionObj.priority = 0;
    subscriptionObj.subscribed_package_id = package._id;

    // fields for micro charging
    subscriptionObj.try_micro_charge_in_next_cycle = false;
    subscriptionObj.micro_price_point = 0;

    if(status === 'ACTIVE'){ 
        subscriptionObj.last_billing_timestamp = DateTime.now().setZone('Asia/Karachi').toISO();
        subscriptionObj.next_billing_timestamp = DateTime.now().setZone('Asia/Karachi').plus({hour:package.package_duration}).toISO();    
        subscriptionObj.amount_billed_today = subscription.amount_billed_today + package.price_point_pkr;
        subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
        subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
        subscriptionObj.priority = 0;
        
        subscriptionObj.subscription_status = 'billed';
        subscriptionObj.is_allowed_to_stream = true;
    }else if(status === 'GRACE') {
        subscriptionObj.consecutive_successive_bill_counts = 0;
        subscriptionObj.is_allowed_to_stream = false;
        subscriptionObj.subscription_status = 'graced';
    }else if(status === 'INACTIVE') {
        subscriptionObj.consecutive_successive_bill_counts = 0;
        subscriptionObj.is_allowed_to_stream = false;
        subscriptionObj.subscription_status = 'expired';
    }else{ 
        // PRE_ACTIVE
        subscriptionObj.next_billing_timestamp = DateTime.now().setZone('Asia/Karachi').plus({hour:package.package_duration}).toISO();    
        subscriptionObj.consecutive_successive_bill_counts = 0;
        subscriptionObj.is_allowed_to_stream = true;
        subscriptionObj.subscription_status = 'trial';
    }

    await subscriptionRepo.updateSubscription(subscription._id, subscriptionObj);
    subscription = await subscriptionRepo.getSubscriptionBySubscriberId(user._id);

    assembleAndSendBillingHistory(user, subscription, package, fullApiResponse, status, package.price_point_pkr);
    return;
}

assembleAndSendBillingHistory = (user, subscription, packageObj, api_response, billing_status, price) => {
    
    let serverDate = new Date();
    let localDate = helper.setDateWithTimezone(serverDate);

    let history = {};
    history.user_id = user._id;
    history.msisdn = user.msisdn;
    history.subscription_id = subscription._id;
    history.paywall_id = packageObj.paywall_id;
    history.package_id = packageObj._id;
    history.operator_response = api_response;
    history.billing_status = billing_status === 'ACTIVE' ? 'Success' : subscription.subscription_status;
    history.source = 'SYSTEM';
    history.operator = 'telenor';
    history.price = price;
    history.billing_dtm = localDate;

    var objectId = new ObjectID();
    history._id = objectId;

    sendHistory(history);
}

sendRenewalMessage = (subscription, msisdn, package_id, user_id) => {
    if(subscription.consecutive_successive_bill_counts === 1){
        // For the first time or every week of consecutive billing

        //Send acknowldement to user
        let message = constants.message_after_first_successful_charge[package_id];
        message = message.replace("%user_id%", user_id)
        message = message.replace("%pkg_id%", package_id)
        sendMessage(msisdn, message);
    }else if((subscription.consecutive_successive_bill_counts + 1) % 7 === 0 || (package_id === 'QDfG')){
        let message = constants.message_after_repeated_succes_charge[package_id];
        message = message.replace("%user_id%", user_id)
        message = message.replace("%pkg_id%", package_id)
        sendMessage(msisdn, message);
    }
}

sendHistory = (history) => {
    //console.log('$$:',JSON.stringify(history),':$$');
    rabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
    localRabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
}

sendMessage = (msisdn, message) => {
    axios.post(`${config.servicesUrls.message_service}/message/send-to-queue`, {message, msisdn})
    .then(res =>{ 
        // console.log(res.data);
    }).catch(err =>{
        console.log(err);
    })
}

//TODO: Stop renewal crosn. revent mongo connection string in config from 10.0.1.76 to localhost.
// TODO: Run npm install