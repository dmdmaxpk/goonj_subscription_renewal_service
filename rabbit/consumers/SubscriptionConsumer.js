const config = require('../../config');
const moment = require('moment');
const helper = require('../../helper/helper');
const  _ = require('lodash');

const axios = require('axios');

const constants = require('../../configurations/constants')

const SubscriptionRepository = require('../../repos/SubscriptionRepository');
const subscriptionRepository = new SubscriptionRepository();

const BillingHistoryRabbitMq = require('../BillingHistoryRabbitMq');
const rabbitMq = new BillingHistoryRabbitMq().getInstance();

const LocalRabbitMq = require('../RabbitMq');
const localRabbitMq = new LocalRabbitMq().getInstance();

var ObjectID = require('mongodb').ObjectID;

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
                subscriptionObj.queued = false;

                subscriptionObj.is_allowed_to_stream = true;
                subscriptionObj.last_billing_timestamp = localDate;
                subscriptionObj.next_billing_timestamp = nextBilling;
                subscriptionObj.amount_billed_today = subscription.amount_billed_today + amount;
                subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
                subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
                subscriptionObj.priority = 0;

                // fields for micro charging
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;

                // send walee subscription hook - only first time / difference of joining and charging is less than 7 days
                // diff should be of 7 days which is 168 hours
                
                let today = moment().utc();
                today.add(5, 'h');

                let joiningDate = moment(subscription.added_dtm);
                console.log('Walee - ', today, ' - ', joiningDate);

                // diff should be of 7 days which is 168 hours.
                let diff = joiningDate.diff(today, 'hours');

                // send WALEE subscription success callback if last subscription status was 'trial' and its less than 7 days.
                if(subscription.affiliate_mid === 'walee' && subscription.subscription_status === 'trial' && diff < 168){
                    console.log('Walee - Triggered Subscription API within 168 hours')
                    await this.waleeSuccessSubscription({
                        subscription_id: subscription._id,
                        utm_source: user.source,
                        userPhone: user.msisdn,
                        totalPrice: amount
                    });
                }
                
                await subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
            
                if(micro_charge === true && amount > 0){
                    this.sendMicroChargeMessage(user.msisdn, mPackage.display_price_point, amount, mPackage.package_name)
                    this.assembleAndSendBillingHistory(user, subscription, mPackage, api_response.full_api_response, api_response.message, response_time, transaction_id, true, amount);
                }else{
                    this.sendRenewalMessage(subscription, user.msisdn, mPackage._id, user._id)
                    this.assembleAndSendBillingHistory(user, subscription, mPackage, api_response.full_api_response, api_response.message, response_time, transaction_id, false, amount);
                }
            }else{
                let expiry_source = undefined;
                let historyStatus = undefined;

                let subscriptionObj = {};
                subscriptionObj.queued = false;
                subscriptionObj.is_billable_in_this_cycle = false;
                subscriptionObj.consecutive_successive_bill_counts = 0;

                if((subscription.subscription_status === 'billed' || subscription.subscription_status === 'trial') && subscription.auto_renewal === true){
                    // The subscriber is eligible for grace hours, depends on the current subscribed package
                    historyStatus = 'graced';

                    let nextBillingDate = new Date();
                    nextBillingDate.setHours(nextBillingDate.getHours() + config.time_between_billing_attempts_hours);
                    
                    subscriptionObj.subscription_status = 'graced';
                    subscriptionObj.is_allowed_to_stream = false;
                    subscriptionObj.next_billing_timestamp = nextBillingDate;
                    subscriptionObj.date_on_which_user_entered_grace_period = new Date();
                    subscriptionObj.try_micro_charge_in_next_cycle = false;
                    subscriptionObj.micro_price_point = 0;
                    subscriptionObj.priority = 0;
        
                }else if(subscription.subscription_status === 'graced' && subscription.auto_renewal === true){
                    // Already in grace, check if given time has been passed in grace, stop streaming
            
                    let nowDate = moment();
                    let timeInGrace = moment.duration(nowDate.diff(subscription.date_on_which_user_entered_grace_period));
                    let hoursSpentInGracePeriod = helper.float2Int(timeInGrace.asHours());
                    //console.log(`${subscription._id} spent ${hoursSpentInGracePeriod} hours in grace period`);
            
                    if (hoursSpentInGracePeriod > mPackage.grace_hours){
                        historyStatus = 'expired';
                        subscriptionObj.subscription_status = 'expired';
                        subscriptionObj.consecutive_successive_bill_counts = 0;
                        subscriptionObj.auto_renewal = false;
                        subscriptionObj.is_allowed_to_stream = false;
                        subscriptionObj.try_micro_charge_in_next_cycle = false;
                        subscriptionObj.micro_price_point = 0;
                        subscriptionObj.amount_billed_today = 0;
                        subscriptionObj.priority = 0;
                        expiry_source = "system-after-grace-end";
        
                        //Send acknowledgement to user
                        let link = 'https://www.goonj.pk/goonjplus/subscribe';
                        let message = 'You package to Goonj TV has expired, click below link to subscribe again.\n'+link;
                        this.sendMessage(user.msisdn, message);
                    }else if(mPackage.is_micro_charge_allowed === true && hoursSpentInGracePeriod > 8 && hoursSpentInGracePeriod <= 24){
                        subscriptionObj.subscription_status = 'graced';
                        historyStatus = "graced";
        
                        subscriptionObj = this.activateMicroCharging(subscription, mPackage, subscriptionObj);
                    }else{
                        let nextBillingDate = new Date();
                        nextBillingDate.setHours(nextBillingDate.getHours() + config.time_between_billing_attempts_hours);
                        
                        subscriptionObj.subscription_status = 'graced';
                        subscriptionObj.next_billing_timestamp = nextBillingDate;
                        historyStatus = "graced";
            
                        //TODO set is_allowed_to_stream to false if 24 hours have passed in grace period
                        let last_billing_timestamp = moment(subscription.last_billing_timestamp);
                        var hours;
            
                        if (subscription.last_billing_timestamp) {
                            let now = moment()
                            let difference = moment.duration(now.diff(last_billing_timestamp));
                            hours = difference.asHours();
                        } else {
                            hours = hoursSpentInGracePeriod;
                        }
                        
                        if(hours > 24){
                            subscriptionObj.is_allowed_to_stream = false;
                        }

                        subscriptionObj.try_micro_charge_in_next_cycle = false;
                        subscriptionObj.micro_price_point = 0;
                        subscriptionObj.priority = 0;
                    }
                }else{
                    historyStatus = "payment request tried, failed due to insufficient balance.";
                    subscriptionObj.auto_renewal = false;
                    subscriptionObj.is_allowed_to_stream = false;
                    subscriptionObj.consecutive_successive_bill_counts = 0;
                    subscriptionObj.try_micro_charge_in_next_cycle = false;
                    subscriptionObj.micro_price_point = 0;
                    subscriptionObj.priority = 0;

                    //Send acknowledgement to user
                    let message = 'You have insufficient balance for Goonj TV, please try again after recharge. Thanks';
                    this.sendMessage(user.msisdn, message);
                }
                
                await subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
                this.assembleAndSendBillingHistory(user, subscription, mPackage, api_response.full_api_response, historyStatus, response_time, transaction_id, micro_charge, amount, expiry_source)
            }
            return 'Done';
        }else{
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
                tempSubObj.priority = 2;
            }else if(index === -1){
                tempSubObj.try_micro_charge_in_next_cycle = true;
                tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
                tempSubObj.priority = 2;
            }else{
                tempSubObj.try_micro_charge_in_next_cycle = false;
                tempSubObj.micro_price_point = 0;
                tempSubObj.is_billable_in_this_cycle = false;
                tempSubObj.priority = 0;
            }
        }else{
            // It means micro tying first micro charge attempt
            tempSubObj.try_micro_charge_in_next_cycle = true;
            tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
            tempSubObj.priority = 2;
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
        let percentage = ((price / fullPrice)*100);
        percentage = (100 - percentage);
    
        //Send acknowldement to user
        let message = "You've got "+parseInt(percentage)+"% discount on "+packageName+" on Goonj.";
        this.sendMessage(msisdn, message);
    }

    assembleAndSendBillingHistory(user, subscription, packageObj, api_response, billing_status, response_time, transaction_id, micro_charge, price, expiry_source = undefined) {

        // billing local dtm
        let serverDate = new Date();
        let localDate = helper.setDateWithTimezone(serverDate);

        let history = {};
        history.user_id = user._id;
        history.msisdn = user.msisdn;
        history.subscription_id = subscription._id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = subscription.subscribed_package_id;
        history.transaction_id = transaction_id;
        history.operator_response = api_response;
        history.billing_status = billing_status === 'success' ? 'Success' : billing_status;
        history.response_time = response_time;
        history.source = expiry_source === undefined? subscription.source : expiry_source;
        history.operator = subscription.payment_source ? subscription.payment_source : 'telenor';
        history.price = price;
        history.micro_charge = micro_charge;
        history.billing_dtm = localDate;

        var objectId = new ObjectID();
        history._id = objectId;

        this.sendHistory(history);
    }

    sendHistory(history){
        console.log('$$:',JSON.stringify(history),':$$');
        rabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
        localRabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
    }

    sendMessage(msisdn, message){
        axios.post(`${config.servicesUrls.message_service}/message/send-to-queue`, {message, msisdn})
        .then(res =>{ 
            // console.log(res.data);
        }).catch(err =>{
            console.log(err);
        })
    }
    waleeSuccessSubscription = async(body) => {
        axios.post(`${config.servicesUrls.subscription_service}/walee/subscription-success`, body)
        .then(res => {
            const result = res.data;
            console.log('Walee - SUCCESSFUL SUBSCRIPTION callback sent for MSISDN: ', body.userPhone, result);
        })
        .catch(err => {
            console.log('Walee - SUBSCRIPTION CALLBACK err:', err);
        })
    }
}

module.exports = SubscriptionConsumer;