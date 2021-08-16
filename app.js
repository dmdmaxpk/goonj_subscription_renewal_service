const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const config = require('./config');

const app = express();

// Import database models
require('./models/Subscription');

// Connection to Database
mongoose.connect(config.mongo_connection_url, {useUnifiedTopology: true, useCreateIndex: true, useNewUrlParser: true});
mongoose.connection.on('error', err => console.error(`Error: ${err.message}`));

// Middlewares
app.use(bodyParser.json({limit: '5120kb'}));  //5MB
app.use(bodyParser.urlencoded({ extended: false }));

// Import routes
app.use('/', require('./routes/index'));

const RabbitMq = require('./rabbit/RabbitMq');
const rabbitMq = new RabbitMq().getInstance();

const SubscriptionConsumer = require('./rabbit/consumers/SubscriptionConsumer');
const subscriptionConsumer = new SubscriptionConsumer();

// Start Server
let { port } = config;
app.listen(port, () => {
    console.log(`Subscription Renewal Service Running On Port ${port}`);
    rabbitMq.initServer((error, response) => {
        if(error){
            console.error(error)
        }else{
            console.log('RabbitMq status', response);
            try{
                // create queues
                rabbitMq.createQueue(config.queueNames.subscriptionResponseDispatcher);
                rabbitMq.createQueue(config.queueNames.subscriptionDispatcher);



                // TESTING
                subscriptionConsumer.consume(
                    { msisdn: '03476733767',
                    micro_charge: false,
                    amount: 5,
                    subscription_id: 'fL_Td9n9Fg1m',
                    transaction_id: 'tpfull_fL_Td9n9Fg1m_lH2iGj9I5b',
                    payment_source: 'telenor',
                    api_response_time: '1300',
                    api_response:
                    { code: -1,
                    message: 'failed',
                    full_api_response: { requestId: '97558-24031517-1',
                        errorCode: '500.007.05',
                        errorMessage: 'Authentication failed.' } },
                    user:
                    { preferences: [],
                    source: 'app',
                    is_gray_listed: false,
                    is_black_listed: false,
                    active: true,
                    _id: 'NCBv-ZR9-fB6',
                    msisdn: '03476733767',
                    operator: 'telenor',
                    added_dtm: '2021-08-10T07:18:55.617Z',
                    __v: 0 },
                    package:
                    { is_grace_allowed: true,
                    streamable_grace_hours: 24,
                    grace_hours: 1080,
                    is_trial_allowed: false,
                    trial_hours: 24,
                    is_micro_charge_allowed: true,
                    micro_price_points: [ 2, 4 ],
                    default: false,
                    active: true,
                    _id: 'QDfC',
                    logos:
                        [ 'https://content-dmd.s3.eu-central-1.amazonaws.com/TP-Content/static-content/others/tv.png' ],
                    package_name: 'Live TV Daily',
                    package_desc: 'RS. 5 + TAX/DAY',
                    package_duration: 24,
                    price_point_pkr: 5,
                    display_price_point: '5',
                    partner_id: 'TP-GoonjDailySub',
                    added_dtm: '2020-06-19T01:10:37.816Z',
                    last_modified: '2020-06-19T01:10:37.816Z',
                    paywall_id: 'ghRtjhT7',
                    slug: 'live',
                    display_price_point_numeric: 5 } 
                })



                rabbitMq.consumeQueue(config.queueNames.subscriptionResponseDispatcher, async(message) => {
                    await subscriptionConsumer.consume(JSON.parse(message.content))
                    rabbitMq.acknowledge(message);
                });
            }catch(error){
                console.error(error.message);
            }
        }
    });
});