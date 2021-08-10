const container = require("../configurations/container");
const subscriptionRepo = container.resolve("subscriptionRepository");

const config = require('../config');
const helper = require('../helper/helper');
const moment = require('moment-timezone');
const lodash = require('lodash');

subscriptionRenewal = async(packages) => {
    try {
        let subscriptions = await subscriptionRepo.getRenewableSubscriptions();
        let subscriptionToRenew = [];
        let subscriptionNotToRenew = [];

        for(let i = 0; i < subscriptions.length; i++){
            if(subscriptions[i].auto_renewal === false){
                subscriptionNotToRenew = [...subscriptionNotToRenew, subscriptions[i]];
            }else {
                if((subscriptionToRenew[i].subscribed_package_id === 'QDfC' && subscriptionToRenew[i].amount_billed_today > config.max_amount_billed_today_for_daily) || (subscriptionToRenew[i].subscribed_package_id === 'QDfG' && subscriptionToRenew[i].amount_billed_today > config.max_amount_billed_today_for_weekly)){
                    // initiate excessive billing email and do the necessary actions

                    let user_id = subscriptionToRenew[i].user_id;
                    let packageObj = null;
                    packages.forEach(function(package){
                        if(package._id === subscriptionToRenew[i].subscribed_package_id) packageObj = package;
                    });

                    if (packageObj) await logExcessiveBilling(packageObj, user_id, subscriptionToRenew[i]);

                }else{
                    subscriptionToRenew = [...subscriptionToRenew, subscriptions[i]];
                }
            }
        }
        
        for(let i = 0; i < subscriptionNotToRenew.length; i++) {
            let subs = subscriptionNotToRenew[i];
            await expire(subs);
        }

        let promises = [];
        console.log("Subscribers to renew in this chunk are ", subscriptionToRenew.length);

        for(let i = 0; i < subscriptionToRenew.length; i++){
            promises = [...promises, await renewSubscription(subscriptionToRenew[i], packages)];
        }

        await Promise.all(promises);
    } catch(err){
        console.log(err);
    }
}

logExcessiveBilling = async (packageObj, user_id, subscription) => {

    // Update subscription
    await subscriptionRepo.updateSubscription(subscription._id, {active:false, queued:false, is_billable_in_this_cycle: false});

    // create billing history history
    let history = {};
    history.user_id = user_id;
    history.package_id = packageObj._id;
    history.paywall_id = packageObj.paywall_id;
    history.subscription_id = subscription._id;
    history.subscriber_id = subscription.subscriber_id;
    history.transaction_id = subscription.transaction_id;
    history.operator_response = {"message": `Subscription ${subscription._id} has exceeded their billing limit. Email sent.`};
    history.billing_status = "billing_exceeded";
    helper.sendToQueue(config.queueNames.billingHistoryDispatcher, history);

    // Shoot an email
    let messageObj = {};
    // messageObj.to = ["paywall@dmdmax.com.pk"];
    messageObj.to = ["muhammad.azam@dmdmax.com", "farhan.ali@dmdmax.com"]; // for testing
    messageObj.subject = 'Excessive Charge Email';
    messageObj.text = `Subscription id ${subscription._id} is trying to charge on a price greater than package price.`;
    helper.sendToQueue(config.queueNames.emailDispatcher, messageObj);
}

expire = async(subscription) => {
    await subscriptionRepo.updateSubscription(subscription._id, {
        subscription_status: 'expired', 
        is_allowed_to_stream:false, 
        is_billable_in_this_cycle:false, 
        consecutive_successive_bill_counts: 0,
        try_micro_charge_in_next_cycle: false,
        micro_price_point: 0,
        amount_billed_today: 0
    });

    let packageObj = await packageRepo.getPackage({_id: subscription.subscribed_package_id});
    let user = await userRepo.getUserBySubscriptionId(subscription._id);

    let history = {};
    history.user_id = user._id;
    history.subscriber_id = subscription.subscriber_id;
    history.subscription_id = subscription._id;
    history.package_id = subscription.subscribed_package_id;
    history.paywall_id = packageObj.paywall_id;
    history.transaction_id = undefined;
    history.operator_response = undefined;
    history.billing_status = 'expired';
    history.source = 'system';
    history.operator = 'telenor';

    await billingHistoryRepo.createBillingHistory(history);
}

renewSubscription = async(subscription, packages) => {
    let transactionId;
    let mcDetails = {};

    if(subscription.try_micro_charge_in_next_cycle === true && subscription.micro_price_point > 0){
        if(subscription.payment_source === 'easypaisa'){
            transactionId = `epmicro_${subscription._id}_${shortId.generate()}`;
        }else{
            transactionId = `tpmicro_${subscription._id}_${shortId.generate()}`;
        }
        mcDetails.micro_charge = true;
        mcDetails.micro_price = subscription.micro_price_point;
    }else{
        mcDetails.micro_charge = false;
        if(subscription.payment_source === 'easypaisa'){
            transactionId = `ep_${subscription._id}_${shortId.generate()}`;
        }else{
            transactionId = `tp_${subscription._id}_${shortId.generate()}`;
        }
    }

    // Add object in queueing server
    let user = await axios({method: 'get', url: config.servicesUrls.user_service + subscription.user_id, headers: {'Content-Type': 'application/json' }
    }).then(function(response){
        return response.data;
    }).catch(function(err){
        console.log(err);
        return undefined;
    });

    if(user && subscription.queued === false && subscription.active){
        let subscribedPackage = lodash.filter(packages, package => package._id === subscription.subscribed_package_id);
        subscriptionRepo.updateSubscription(subscription._id, {queued: true});

        let messageObj = {};
        messageObj.subscription_id = subscription._id;
        messageObj.payment_source = subscription.payment_source;
        messageObj.ep_token = subscription.ep_token;
        messageObj.mc_details = mcDetails;
        messageObj.transaction_id = transactionId;
        messageObj.price_point = subscribedPackage.price_point_pkr
        messageObj.partner_id = subscribedPackage.partner_id;
        messageObj.user_id = user._id;
        messageObj.msisdn = user.msisdn;

        rabbitMq.addInQueue(config.queueNames.subscriptionDispatcher, messageObj);
        console.log(subscription._id + 'added in queue');
    }else{
        console.log(`Either user ${subscription.user_id} does not exist or the subscription ${subscription._id} is not active or the subscription ${subscription._id} is already queued`);
    }
}

markRenewableUser = async() => {
    try {
        let now = moment().tz("Asia/Karachi");
        let hour = now.hours();
        if (config.tp_billing_cycle_hours.includes(hour)) {
            console.log(`Billing cycle for telenor at ${hour} O'Clock`);
            await mark('telenor');
            validate();
        }else if(config.ep_billing_cycle_hours.includes(hour)){
            console.log(`Billing cycle for easypaisa at ${hour} O'Clock`);
            await mark('easypaisa');
        } else {
            console.log(`No billing cycle for telenor/easypaisa at ${hour} O'Clock`);
        }
    } catch(err) {
        console.log(`Billing cycle error`, err);
    }
}

mark = async(operator) => {
    let totalCount = await subscriptionRepo.getCountOfSubscriptionToMark(operator);
    console.log(`Subscription to renew count for ${operator} are ${totalCount}`);

    let chunkSize = 10000;
    let totalChunks = float2Int(totalCount / chunkSize);
    let reminders = totalCount % chunkSize;
    console.log("Total chunks = "+totalChunks+" & total reminders = "+reminders);

    let lastId = undefined;
    for(let i = 0; i < totalChunks; i++){
        try{
            let response = await getMarkUsersPromise(chunkSize, lastId, operator);
            lastId = response;
            console.log("Chunk ",i,' - ', response);
        }catch(e){
            console.log("Chunk ",i,' error - ', e);
        }
    }

    //Reminders
    let response = await getMarkUsersPromise(reminders, lastId, operator);
    console.log("Reminder - ", response);
    console.log("Subscription marking for current billing cycle completed");
}

float2Int = (float) => {
    return float | 0;
}

markRenewableUserForcefully = async() => {
    try {
        mark('telenor');
    } catch(err) {
        console.error(err);
    }
}

validate = async() => {
    console.log("Validating...");

    let countThreshold = 350000;
    let totalCount = await subscriptionRepo.getBillableInCycleCount();
    console.log("Total billable in cycle count is " + totalCount);

    if(totalCount < countThreshold){
        //Todo: send email to email service
        let subject = 'Billing Cycle Count Lower Than Expected';
        let text = `Total billable cycle count is ${totalCount}, which is lower than threshold ${countThreshold}. Please check as soon as possible!`
        let email= ['paywall@dmdmax.com.pk', 'mikaeel@dmdmax.com', 'usama.shamim@dmdmax.com'];
        emailService.sendEmail(subject, text, email);
        console.log('==> Email alert Sent!');
    }
    else{
        console.log('Total billable cycle count seems alright!');
    }
}

getMarkUsersPromise = (limit, lastId, operator) =>{
    return new Promise(async(resolve, reject) => {
        let subscription_ids  = await subscriptionRepo.getSubscriptionsToMarkWithLimitAndOffset(limit, lastId, operator);
        if(subscription_ids && subscription_ids.length > 0){
            await subscriptionRepo.setAsBillableInNextCycle(subscription_ids);
            resolve(subscription_ids[subscription_ids.length-1]);
        }else{
            console.log("Failed to mark, length is "+subscription_ids.length);
            resolve(undefined);
        }
    });
}

module.exports = {
    subscriptionRenewal: subscriptionRenewal,
    markRenewableUser: markRenewableUser,
    markRenewableUserForcefully: markRenewableUserForcefully
}
