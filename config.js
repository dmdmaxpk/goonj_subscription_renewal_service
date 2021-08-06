const env = process.env.NODE_ENV || 'production';

const codes = {
    code_error: -1,
    code_success: 0,
    code_record_added: 1,
    code_record_updated: 2,
    code_record_deleted: 3,

    code_invalid_data_provided: 4,
    code_record_already_added: 5,
    code_data_not_found: 6,

    code_otp_validated: 7,
    code_otp_not_validated: 8,
    code_already_subscribed: 9,
    code_in_billing_queue: 10,
    code_trial_activated: 11,
    code_user_gralisted: 12,
    code_user_blacklisted: 13,
    code_auth_failed: 14,
    code_auth_token_not_supplied: 15,
    code_already_in_queue: 16,
    code_otp_not_found: 17
}

const tp_billing_cycle_hours = [1,4,7,10,13,16,19,22];
const ep_billing_cycle_hours = [9,15,21];


const servicesUrls = {
    user_service: 'http://localhost:3007',
    tp_ep_core_service: 'http://localhost:3001',
    billing_history_service: 'http://localhost:3008',
    core_service: 'http://localhost:3000',
    message_service: 'http://localhost:3003'
}

const max_amount_billed_today_for_daily = 5;
const max_amount_billed_today_for_weekly = 15;

const rabbitMqConnectionString = 'amqp://127.0.0.1';
const db_name = 'goonjpaywall';

const queueNames = {
    subscriptionDispatcher: 'subscriptionDispatcher',
    billingHistoryDispather: 'billingHistoryDispather',
    emailDispatcher: 'emailDispatcher',
}

let config = {
    development: {
        port: 3005,
        mongo_connection_url: `mongodb://localhost:27017/${db_name}`,
        queueNames: queueNames,
        codes: codes,
        servicesUrls: servicesUrls,
        rabbitMqConnectionString: rabbitMqConnectionString,
        tp_billing_cycle_hours: tp_billing_cycle_hours,
        ep_billing_cycle_hours: ep_billing_cycle_hours,
        max_amount_billed_today_for_daily: max_amount_billed_today_for_daily,
        max_amount_billed_today_for_weekly: max_amount_billed_today_for_weekly
    },
    staging: {
        port: 3005,
        mongo_connection_url: `mongodb://localhost:27017/${db_name}`,
        queueNames: queueNames,
        codes: codes,
        servicesUrls: servicesUrls,
        rabbitMqConnectionString: rabbitMqConnectionString,
        tp_billing_cycle_hours: tp_billing_cycle_hours,
        ep_billing_cycle_hours: ep_billing_cycle_hours,
        max_amount_billed_today_for_daily: max_amount_billed_today_for_daily,
        max_amount_billed_today_for_weekly: max_amount_billed_today_for_weekly
    },
    production: {
        port: 3005,
        mongo_connection_url: `mongodb://localhost:27017/${db_name}`,
        queueNames: queueNames,
        codes: codes,
        servicesUrls: servicesUrls,
        rabbitMqConnectionString: rabbitMqConnectionString,
        tp_billing_cycle_hours: tp_billing_cycle_hours,
        ep_billing_cycle_hours: ep_billing_cycle_hours,
        max_amount_billed_today_for_daily: max_amount_billed_today_for_daily,
        max_amount_billed_today_for_weekly: max_amount_billed_today_for_weekly
    }
};

console.log("---", env);

if (env === 'development') config = config.development;
if (env === 'staging') config = config.staging;
if (env === 'production') config = config.production;

module.exports = config;
