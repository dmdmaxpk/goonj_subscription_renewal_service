let userRepo = require('../repos/UserRepo');

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

/**
 * '{"msisdn":"3468590478","serviceId":25,"status":"ACTIVE","channel":"SMS","subscriptionTime":"2022-04-22T13:23:40.297Z","renewalTime":"2022-04-28T19:00:00.000Z"}'
 */
exports.callback = async (req, res) =>  {
    let {msisdn, status, channel, gw_transaction_id} = req.body;
    if(msisdn, status, channel) {
        let user = await userRepo.getUserByMsisdn(`0${msisdn}`);
        if(!user) {
            res.status(404).send(`Provided msisdn '${msisdn}' is not found`);
            return;
        }

        let subscription = await subscriptionRepo.getSubscriptionBySubscriberId(user._id);
        let package = await packageRepo.getPackage({_id: subscription.subscribed_package_id});

        // its a renewal callback
        if(channel === 'SYSTEM') {
            await updateSubscription(user, package, subscription, status, req.body, channel);
        }else{
            await updateSubscription(user, package, subscription, status, req.body, channel);
            sendMessage(`0${msisdn}`, 'You have been subscribed to Goonj successfully. Thank you');
        }
        res.status(200).send({status: 'OK', gw_transaction_id: gw_transaction_id}); 
    }else{
        res.status(400).send(`Bad request, please send all the required parameters i.e 'msisdn', 'status', 'channel'`); 
    }
}

updateSubscription = async(user, package, subscription, status, fullApiResponse, channel) => {
    
    // update subscription
    let subscriptionObj = {};
    
    subscriptionObj.auto_renewal = true;
    subscriptionObj.is_billable_in_this_cycle = false;
    subscriptionObj.queued = false;
    subscriptionObj.last_billing_timestamp = DateTime.now().setZone('Asia/Karachi').toISO();
    subscriptionObj.next_billing_timestamp = DateTime.now().setZone('Asia/Karachi').plus({hour:package.package_duration}).toISO();
    subscriptionObj.amount_billed_today = subscription.amount_billed_today + package.price_point_pkr;
    subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
    subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
    subscriptionObj.priority = 0;

    // fields for micro charging
    subscriptionObj.try_micro_charge_in_next_cycle = false;
    subscriptionObj.micro_price_point = 0;
    
    if(status === 'ACTIVE'){ 
        subscriptionObj.subscription_status = 'billed';
        subscriptionObj.is_allowed_to_stream = true;

        if(channel === 'SYSTEM') sendRenewalMessage(subscription, user.msisdn, package._id, user._id)
    }else if(status === 'GRACE') {
        subscriptionObj.is_allowed_to_stream = false;
        subscriptionObj.subscription_status = 'graced';
    }else if(status === 'INACTIVE') {
        subscriptionObj.is_allowed_to_stream = false;
        subscriptionObj.subscription_status = 'expired';
    }else{ 
        // PRE_ACTIVE
        console.log(`********${status} STATUS RECEIVED************`);
    }

    await subscriptionRepo.updateSubscription(subscription._id, subscriptionObj);
    assembleAndSendBillingHistory(user, subscription, package, fullApiResponse, status, package.price_point_pkr);
    return;
}

assembleAndSendBillingHistory = (user, subscription, packageObj, api_response, billing_status, price) => {

    let history = {};
    history.user_id = user._id;
    history.msisdn = user.msisdn;
    history.subscription_id = subscription._id;
    history.paywall_id = packageObj.paywall_id;
    history.package_id = subscription.subscribed_package_id;
    history.operator_response = api_response;
    history.billing_status = billing_status === 'ACTIVE' ? 'Success' : billing_status;
    history.source = 'SYSTEM';
    history.operator = 'telenor';
    history.price = price;
    history.billing_dtm = DateTime.now().setZone('Asia/Karachi').toISO();

    var objectId = new ObjectID();
    history._id = objectId;

    //sendHistory(history);
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
    console.log('$$:',JSON.stringify(history),':$$');
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