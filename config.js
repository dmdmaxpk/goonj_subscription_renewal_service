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

//const tp_billing_cycle_hours = [1,5,8,11,14,17,20,22];
const tp_billing_cycle_hours = [1,5,8];
const ep_billing_cycle_hours = [4,10,16];


const servicesUrls = {
    core_service: 'http://127.0.0.1:3000',
    user_service: 'http://127.0.0.1:3007/user/get_user_by_id?id=',
    message_service: 'http://127.0.0.1:3003',
    billing_history_service: 'http://10.0.1.88:3008'
}

const max_amount_billed_today_for_daily = 5;
const max_amount_billed_today_for_weekly = 15;
const time_between_billing_attempts_hours = 8;

const billingHistoryRabbitMqConnectionString = 'amqp://10.0.1.88';
const rabbitMqConnectionString = 'amqp://127.0.0.1';

const db_name = 'goonjpaywall';

const queueNames = {
    subscriptionResponseDispatcher: 'subscriptionResponseDispatcher',
    subscriptionDispatcher: 'subscriptionDispatcher',
    billingHistoryDispatcher: 'billingHistoryDispatcher',
    syncCollectionDispatcher: 'syncCollectionDispatcher',
    emailDispatcher: 'emailDispatcher',
}

const ideationUrls = {
    ideation_call_back_url: 'http://bpd.o18.click/',
    ideation_call_back_url_2: 'http://210.56.13.190/goonj_callback.php/',
    ideation_call_back_url_3: `https://postback.level23.nl/?currency=USD&handler=10821&hash=c4e51373f0d516d0d4fdbd7f0e544c61&tracker=`
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
        max_amount_billed_today_for_weekly: max_amount_billed_today_for_weekly,
        ideationUrls: ideationUrls,
        time_between_billing_attempts_hours: time_between_billing_attempts_hours,
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString
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
        max_amount_billed_today_for_weekly: max_amount_billed_today_for_weekly,
        ideationUrls: ideationUrls,
        time_between_billing_attempts_hours: time_between_billing_attempts_hours,
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString
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
        max_amount_billed_today_for_weekly: max_amount_billed_today_for_weekly,
        ideationUrls: ideationUrls,
        time_between_billing_attempts_hours: time_between_billing_attempts_hours,
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString
    }
};

console.log("---", env);

if (env === 'development') config = config.development;
if (env === 'staging') config = config.staging;
if (env === 'production') config = config.production;

module.exports = config;
