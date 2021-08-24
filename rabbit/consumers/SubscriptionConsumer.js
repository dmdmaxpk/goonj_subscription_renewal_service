const config = require('../../config');
const moment = require('moment');
const helper = require('../../helper/helper');
const  _ = require('lodash');

const axios = require('axios');

const constants = require('../../configurations/constants')

const SubscriptionRepository = require('../../repos/SubscriptionRepository');
const subscriptionRepository = new SubscriptionRepository();

const RabbitMq = require('../RabbitMq');
const rabbitMq = new RabbitMq(config.billingHistoryRabbitMqConnectionString).getInstance();

class SubscriptionConsumer {

    async consume(messageObject) {
        
        let user = messageObject.user;
        let mPackage = messageObject.package;

        let subscription = await subscriptionRepository.getSubscription(messageObject.subscription_id);
        let micro_charge = messageObject.micro_charge;
        let amount = messageObject.amount;
        let transaction_id = messageObject.transaction_id;
        let api_response = messageObject.api_response;
        
        let response_time = 0;
        if (messageObject.hasOwnProperty('api_response_time')){
            response_time = messageObject.api_response_time;
        }

        if(api_response){
            if(api_response.code === config.codes.code_success && api_response.message === 'success'){ 
                
                // success billing
                let serverDate = new Date();
                let localDate = helper.setDateWithTimezone(serverDate);
                
                let nextBilling = _.clone(localDate);
                nextBilling = nextBilling.setHours(nextBilling.getHours() + mPackage.package_duration);

                // update subscription
                let subscriptionObj = {};
                subscriptionObj.subscription_status = 'billed';
                subscriptionObj.auto_renewal = true;
                subscriptionObj.is_billable_in_this_cycle = false;
                subscriptionObj.is_allowed_to_stream = true;
                subscriptionObj.last_billing_timestamp = localDate;
                subscriptionObj.next_billing_timestamp = nextBilling;
                subscriptionObj.amount_billed_today = subscription.amount_billed_today + amount;
                subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
                subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
                subscriptionObj.queued = false;
                
                // fields for micro charging
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;
                
                await subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
            
                // Check for the affiliation callback
                if(subscription.affiliate_unique_transaction_id && subscription.affiliate_mid &&
                    subscription.is_affiliation_callback_executed === false &&
                    subscription.should_affiliation_callback_sent === true){
                    if((subscription.source === "HE" || subscription.source === "affiliate_web") && subscription.affiliate_mid != "1") {
                        this.sendAffiliationCallback(subscription.affiliate_unique_transaction_id, subscription.affiliate_mid, user._id, subscription._id, mPackage._id, mPackage.paywall_id);
                    }
                }

                if(micro_charge === true && amount > 0){
                    console.log('micro charge success');
                    this.sendMicroChargeMessage(user.msisdn, mPackage.display_price_point, amount, mPackage.package_name)
                    this.assembleAndSendBillingHistory(user, subscription, mPackage, api_response.full_api_response, api_response.message, response_time, transaction_id, true, amount);
                }else{
                    console.log('full charge success');
                    this.sendRenewalMessage(subscription, user.msisdn, mPackage._id, user._id)
                    this.assembleAndSendBillingHistory(user, subscription, mPackage, api_response.full_api_response, api_response.message, response_time, transaction_id, false, amount);
                }
            }else{
                let expiry_source = undefined;
                let historyStatus = undefined;

                let subscriptionObj = {};
                subscriptionObj.queued = false;

                if((subscription.subscription_status === 'billed' || subscription.subscription_status === 'trial') && subscription.auto_renewal === true){
                    // The subscriber is eligible for grace hours, depends on the current subscribed package
        
                    let nextBillingDate = new Date();
                    nextBillingDate.setHours(nextBillingDate.getHours() + config.time_between_billing_attempts_hours);
                    
                    subscriptionObj.subscription_status = 'graced';
                    subscriptionObj.is_allowed_to_stream = false;
                    subscriptionObj.next_billing_timestamp = nextBillingDate;
                    subscriptionObj.date_on_which_user_entered_grace_period = new Date();
                    subscriptionObj.is_billable_in_this_cycle = false;
                    subscriptionObj.try_micro_charge_in_next_cycle = false;
                    subscriptionObj.micro_price_point = 0;
                    
        
                }else if(subscription.subscription_status === 'graced' && subscription.auto_renewal === true){
                    // Already in grace, check if given time has been passed in grace, stop streaming
            
                    let nowDate = moment();
                    let timeInGrace = moment.duration(nowDate.diff(subscription.date_on_which_user_entered_grace_period));
                    let hoursSpentInGracePeriod = helper.float2Int(timeInGrace.asHours());
                    console.log(`${subscription._id} spent ${hoursSpentInGracePeriod} hours in grace period`);
            
                    if (hoursSpentInGracePeriod > mPackage.grace_hours){
                        subscriptionObj.subscription_status = 'expired';
                        subscriptionObj.consecutive_successive_bill_counts = 0;
                        subscriptionObj.auto_renewal = false;
                        subscriptionObj.is_allowed_to_stream = false;
                        subscriptionObj.is_billable_in_this_cycle = false;
                        subscriptionObj.try_micro_charge_in_next_cycle = false;
                        subscriptionObj.micro_price_point = 0;
                        subscriptionObj.amount_billed_today = 0;
        
                        expiry_source = "system-after-grace-end";
        
                        //Send acknowledgement to user
                        let link = 'https://www.goonj.pk/goonjplus/subscribe';
                        let message = 'You package to Goonj TV has expired, click below link to subscribe again.\n'+link;
                        this.sendMessage(user.msisdn, message);
                        historyStatus = "expired";
                    }else if(mPackage.is_micro_charge_allowed === true){
                        subscriptionObj = this.activateMicroCharging(subscription, mPackage, subscriptionObj);

                        console.log("micro charging activated for subsription id: ", subscription._id);
                        subscriptionObj.subscription_status = 'graced';
                    }
                }else{
                    historyStatus = "payment request tried, failed due to insufficient balance.";
                    subscriptionObj.auto_renewal = false;
                    subscriptionObj.is_allowed_to_stream = false;
                    subscriptionObj.consecutive_successive_bill_counts = 0;
                    subscriptionObj.try_micro_charge_in_next_cycle = false;
                    subscriptionObj.is_billable_in_this_cycle = false;
                    subscriptionObj.micro_price_point = 0;
                    
                    //Send acknowledgement to user
                    let message = 'You have insufficient balance for Goonj TV, please try again after recharge. Thanks';
                    this.sendMessage(user.msisdn, message);
                }
                await subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
                historyStatus = historyStatus === undefined ? subscriptionObj.status : historyStatus;

                this.assembleAndSendBillingHistory(user, subscription, mPackage, api_response.full_api_response, historyStatus, response_time, transaction_id, micro_charge, amount, expiry_source)
            }
            return 'Done';
        }else{
            console.log('Return object not found!');
            return 'Error';
        }
    }

    // Activate micro charging
    activateMicroCharging(subscription, packageObj, subscriptionObj){

        let micro_price_points = packageObj.micro_price_points;
        let current_micro_price_point = subscription.micro_price_point;
        let tempSubObj  = JSON.parse(JSON.stringify(subscriptionObj));

        if(subscription.try_micro_charge_in_next_cycle === true && current_micro_price_point > 0){
            // It means micro charging attempt had already been tried and was unsuccessful, lets hit on lower price
            let index = micro_price_points.indexOf(current_micro_price_point);
            if(index > 0){
                tempSubObj.try_micro_charge_in_next_cycle = true;
                tempSubObj.micro_price_point = micro_price_points[--index];
            }else if(index === -1){
                tempSubObj.try_micro_charge_in_next_cycle = true;
                tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
            }else{
                tempSubObj.try_micro_charge_in_next_cycle = false;
                tempSubObj.micro_price_point = 0;
                tempSubObj.is_billable_in_this_cycle = false;
            }
        }else{
            // It means micro tying first micro charge attempt
            tempSubObj.try_micro_charge_in_next_cycle = true;
            tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
        }

        return tempSubObj;
    }
    
    sendRenewalMessage(subscription, msisdn, package_id, user_id) {
        if(subscription.consecutive_successive_bill_counts === 1){
            // For the first time or every week of consecutive billing
    
            //Send acknowldement to user
            let message = constants.message_after_first_successful_charge[package_id];
            message = message.replace("%user_id%", user_id)
            message = message.replace("%pkg_id%", package_id)
            this.sendMessage(msisdn, message);
        }else if((subscription.consecutive_successive_bill_counts + 1) % 7 === 0 || (package_id === 'QDfG')){          
            let message = constants.message_after_repeated_succes_charge[package_id];
            message = message.replace("%user_id%", user_id)
            message = message.replace("%pkg_id%", package_id)
            this.sendMessage(msisdn, message);
        }
    }
    
    sendMicroChargeMessage (msisdn, fullPrice, price, packageName)  {
        console.log("Sending %age discount message to "+msisdn);
        let percentage = ((price / fullPrice)*100);
        percentage = (100 - percentage);
    
        //Send acknowldement to user
        let message = "You've got "+percentage+"% discount on "+packageName+".  Numainday se baat k liye 727200 milayein.";
        this.sendMessage(msisdn, message);
    }

    async sendAffiliationCallback(tid, mid, user_id, subscription_id, package_id, paywall_id) {
        let combinedId = tid + "*" +mid;

        let history = {};
        history.user_id = user_id;
        history.paywall_id = paywall_id;
        history.subscription_id = subscription_id;
        history.package_id = package_id;
        history.transaction_id = combinedId;
        history.operator = 'telenor';

        console.log(`sending affiliate marketing callback having TID - ${tid} - MID ${mid}`);
        this.sendCallBackToIdeation(mid, tid).then(async (fulfilled) => {
            console.log(`Successfully sent affiliate marketing callback having TID - ${tid} - MID ${mid} - ideation response - ${fulfilled}`);
            await subscriptionRepository.updateSubscription(subscription_id, {is_affiliation_callback_executed: true});
            history.operator_response = fulfilled;
            history.billing_status = "Affiliate callback sent";
            this.sendHistory(history);
        }).catch(async  (error) => {
            console.log(`Affiliate - Marketing - Callback - Error - Having TID - ${tid} - MID ${mid}`, error);
            history.operator_response = error.response.data;
            history.billing_status = "Affiliate callback error";
            this.sendHistory(history);
        });
    }

    async sendCallBackToIdeation(mid, tid)  {
        var url = undefined; 
        if (mid === "1569") {
            url = config.ideationUrls.ideation_call_back_url + `p?mid=${mid}&tid=${tid}`;
        } else if (mid === "goonj"){
            url = config.ideationUrls.ideation_call_back_url_2 + `?txid=${tid}`;
        } else if (mid === "aff3" || mid === "aff3a"){
            url = config.ideationUrls.ideation_call_back_url_3 + `${tid}`;
        }

        if(url){
            console.log("ideation callback url:", url)
            return new Promise(function(resolve, reject) {
                axios({
                    method: 'post',
                    url: url,
                    headers: {'Content-Type': 'application/x-www-form-urlencoded' }
                }).then(function(response){
                    resolve(response.data);
                }).catch(function(err){
                    reject(err);
                });
            });
        }else{
            console.warn('Invalid mid found');
        }
    }

    assembleAndSendBillingHistory(user, subscription, packageObj, api_response, billing_status, response_time, transaction_id, micro_charge, price, expiry_source = undefined) {
        
        let history = {};
        history.user_id = user._id;
        history.subscription_id = subscription._id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = subscription.subscribed_package_id;
        history.transaction_id = transaction_id;
        history.operator_response = api_response;
        history.billing_status = billing_status === 'success' ? 'Success' : 'Failed';
        history.response_time = response_time;
        history.source = expiry_source === undefined? subscription.source : expiry_source;
        history.operator = subscription.payment_source ? subscription.payment_source : 'telenor';
        history.price = price;
        history.micro_charge = micro_charge;
        this.sendHistory(history);
    }

    sendHistory(history){
        console.log(rabbitMq);
        rabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
        console.log('History sent to queue:', history.operator_response);
    }

    sendMessage(msisdn, message){
        axios.post(`${config.servicesUrls.message_service}/message/send-to-queue`, {message, msisdn})
        .then(res =>{ 
            console.log(res.data);
        }).catch(err =>{
            console.log(err);
        })
    }
}

module.exports = SubscriptionConsumer;