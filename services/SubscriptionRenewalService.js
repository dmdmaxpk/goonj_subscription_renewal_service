const container = require("../configurations/container");
const subscriptionRepo = container.resolve("subscriptionRepository");

const config = require('../config');
const moment = require('moment-timezone');
const { nanoid } = require('nanoid');
const axios = require('axios');

const RabbitMq = require('../rabbit/RabbitMq');
const rabbitMq = new RabbitMq().getInstance();

const BillingHistoryRabbitMq = require('../rabbit/BillingHistoryRabbitMq');
const billingHistoryRabbitMq = new BillingHistoryRabbitMq().getInstance();

let count = 0;

subscriptionRenewal = async(packages) => {
    try {
        ackCronitor('renew-subscriptions', 'run');
        let subscriptions = await subscriptionRepo.getRenewableSubscriptions();
        console.log('Subscription fetched from database to bill', subscriptions.length);

        let subscriptionToRenew = [];
        let subscriptionNotToRenew = [];

        for(let i = 0; i < subscriptions.length; i++){
            if(subscriptions[i].auto_renewal === false){
                subscriptionNotToRenew = [...subscriptionNotToRenew, subscriptions[i]];
            }else {
                let packageObj = null;
                packages.forEach(function(singlePackage){
                    if(singlePackage._id === subscriptions[i].subscribed_package_id){
                        packageObj = singlePackage;
                    }
                });

                let new_amount_billed_today_will_be = (subscriptions[i].amount_billed_today + packageObj.price_point_pkr)
                if((subscriptions[i].subscribed_package_id === 'QDfC' && new_amount_billed_today_will_be > config.max_amount_billed_today_for_daily) || (subscriptions[i].subscribed_package_id === 'QDfG' && new_amount_billed_today_will_be > config.max_amount_billed_today_for_weekly)){
                    // initiate excessive billing email and do the necessary actions

                    let user_id = subscriptions[i].user_id;
                    logExcessiveBilling(packageObj, user_id, subscriptions[i]);
                }else{
                    subscriptionToRenew = [...subscriptionToRenew, subscriptions[i]];
                }
            }
        }
        
        console.warn('Subscription to expire', subscriptionNotToRenew.length);
        console.warn('Subscription to renew', subscriptionToRenew.length);

        for(let i = 0; i < subscriptionNotToRenew.length; i++) {
            let subs = subscriptionNotToRenew[i];
            await expire(subs);
        }

        for(let i = 0; i < subscriptionToRenew.length; i++){
            renewSubscription(subscriptionToRenew[i], packages);
        }

        console.log('Total queued count: ', count);
        ackCronitor('renew-subscriptions', 'complete');
        count = 0;
    } catch(err){
        console.log(err);
        ackCronitor('renew-subscriptions', 'fail');
    }
}

logExcessiveBilling = async (packageObj, user_id, subscription) => {

    // Update subscription
    await subscriptionRepo.updateSubscription(subscription._id, {active: false, queued: false, is_billable_in_this_cycle: false});

    // create billing history history
    let history = {};
    history.user_id = user_id;
    history.package_id = packageObj._id;
    history.paywall_id = packageObj.paywall_id;
    history.subscription_id = subscription._id;
    history.operator_response = {"message": `Subscription ${subscription._id} has exceeded their billing limit.`};
    history.billing_status = "billing_exceeded";
    console.log('$$:',JSON.stringify(history),':$$');
    billingHistoryRabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);

    // Shoot an email
    let messageObj = {};
    // messageObj.to = ["paywall@dmdmax.com.pk"];
    messageObj.to = ["muhammad.azam@dmdmax.com", "farhan.ali@dmdmax.com", "taha@dmdmax.com", "usama.shamim@dmdmax.com"]; // for testing
    messageObj.subject = 'Excessive Charge Email';
    messageObj.text = `Subscription id ${subscription._id} is trying to charge on a price greater than package price.`;
    rabbitMq.addInQueue(config.queueNames.emailDispatcher, messageObj);
}

expire = async(subscription) => {
    await subscriptionRepo.updateSubscription(subscription._id, {
        subscription_status: 'expired', 
        is_allowed_to_stream:false, 
        is_billable_in_this_cycle:false, 
        consecutive_successive_bill_counts: 0,
        try_micro_charge_in_next_cycle: false,
        micro_price_point: 0,
        amount_billed_today: 0,
        priority: 0,
        queued: false
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
    history.operator = subscription.payment_source;

    await billingHistoryRepo.createBillingHistory(history);
}

renewSubscription = async(subscription, packages) => {
    let messageObj = {};
    subscription.subscribed_package_id = subscription.subscribed_package_id ? subscription.subscribed_package_id : 'QDfC'

    let subscribedPackage = undefined;

    subscribedPackage = packages.filter((package) => {
        return package._id === subscription.subscribed_package_id
    })[0];

    if(subscription.try_micro_charge_in_next_cycle === true && subscription.micro_price_point > 0){
        if(subscription.payment_source === 'easypaisa'){
            messageObj.transaction_id = `epmicro_${nanoid(10)}`;
        }else{
            messageObj.transaction_id = `tpmicro_${subscription._id}_${nanoid(10)}`;
        }
        messageObj.micro_charge = true;
        messageObj.amount = subscription.micro_price_point;
    }else{
        if(subscription.payment_source === 'easypaisa'){
            messageObj.transaction_id = `epfull_${nanoid(10)}`;
        }else{
            messageObj.transaction_id = `tpfull_${subscription._id}_${nanoid(10)}`;
        }

        messageObj.micro_charge = false;
        messageObj.amount = subscribedPackage.price_point_pkr
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
        messageObj.package = subscribedPackage
        messageObj.user = user;
        messageObj.subscription_id = subscription._id;
        messageObj.payment_source = subscription.payment_source;
        messageObj.ep_token = subscription.ep_token;

        rabbitMq.addInQueue(config.queueNames.subscriptionDispatcher, messageObj);
        await subscriptionRepo.updateSubscription(subscription._id, {queued: true});
        count += 1;
        
        console.log(subscription._id, ' added in queue');
    }else{
        console.log(`Either user ${subscription.user_id} does not exist or the subscription ${subscription._id} is not active or the subscription ${subscription._id} is already queued`);
    }
}

markRenewableUser = async() => {
    try {
        ackCronitor('mark-subscriptions-to-renew', 'run');
        let now = moment().tz("Asia/Karachi");
        let hour = now.hours();
        if (config.tp_billing_cycle_hours.includes(hour)) {
            console.log(`Billing cycle for telenor at ${hour} O'Clock`);
            mark('telenor');
        }else if(config.ep_billing_cycle_hours.includes(hour)){
            console.log(`Billing cycle for easypaisa at ${hour} O'Clock`);
            mark('easypaisa');
        } else {
            console.log(`No billing cycle for telenor/easypaisa at ${hour} O'Clock`);
        }
        return 'done';
    } catch(err) {
        ackCronitor('mark-subscriptions-to-renew', 'fail');
        console.log(`Billing cycle error`, err);
        throw err;
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

    if(reminders > 0){
        //Reminders
        await getMarkUsersPromise(reminders, lastId, operator);
    }

    if(operator === 'telenor'){
        validateResults();
    }
    
    ackCronitor('mark-subscriptions-to-renew', 'complete');
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

validateResults = async() => {
    console.log("Validating...");

    let countThreshold = 350000;
    let totalCount = await subscriptionRepo.getBillableInCycleCount();
    console.log("Total billable in cycle count is " + totalCount);

    if(totalCount < countThreshold){
        axios.post(`${config.servicesUrls.message_service}/message/email`, {
            subject: 'Billing Cycle Count Lower Than Expected', 
            text: `Total billable cycle count is ${totalCount}, which is lower than threshold ${countThreshold}. Please check asap!`,
            to: ['paywall@dmdmax.com.pk', 'usama.shamim@dmdmax.com', 'taha@dmdmdax.com', 'nauman@dmdmax.com', 'muhammad.azam@dmdmax.com']
        }).then(res => {
            console.log('email sent with response: ', res.data);
        }).catch(err => {
            console.log('email service throws error:', err)
        });
    }else {
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

//mark-subscriptions-to-renew
ackCronitor = async(job_name, state) => {
    axios.get(`https://cronitor.link/p/0b25c0a561ad46468f0e66907d9983d0/${job_name}?state=${state}`)
    .then(res => {
        console.log(new Date(), `${job_name} - cronitor acknowledgement for state ${state}`);
    }).catch(err => {
        console.log(new Date(), `${job_name} - cronitor acknowledgement for state ${state} err:`, err);
    });
}

module.exports = {
    subscriptionRenewal: subscriptionRenewal,
    markRenewableUser: markRenewableUser,
    markRenewableUserForcefully: markRenewableUserForcefully
}
