const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const config = require('./config');
const axios = require('axios');
const app = express();
const moment = require("moment-timezone");
const helper = require('./helper/helper');

// Connection to Database
mongoose.connect(config.mongo_connection_url, {useUnifiedTopology: true, useCreateIndex: true, useNewUrlParser: true, useFindAndModify: false});
mongoose.connection.on('error', err => console.error(`Error: ${err.message}`));

// Import database models
require('./models/Subscription');
require('./models/User');
require('./models/Package');
require('./models/Callback');

const Callback = mongoose.model('Callback');


trigger = async() => {
    console.log('Triggered');
    let response = {"msisdn":"3476733767","serviceId":99146,"status":"ACTIVE","channel":"API","subscriptionTime":"2023-02-27T11:29:50.696Z","renewalTime":"2023-03-05T19:00:00.000Z","gw_transaction_id":"gw_logger-33olcjlemqmv1j-2023-02-27,11:29"};
        await new Callback({
            msisdn: response.msisdn,
            serviceId: response.serviceId,
            status: response.status,
            subscriptionTime: response.subscriptionTime,
            renewalTime: response.renewalTime,
            rawResponse: JSON.stringify(response)
        }).save()
        console.log('Record added');
}

trigger();

// Middlewares
app.use(bodyParser.json({limit: '5120kb'}));  //5MB
app.use(bodyParser.urlencoded({ extended: false }));
app.use(logger('combined'));

// Import routes
app.use('/', require('./routes/index'));

const RabbitMq = require('./rabbit/RabbitMq');
const rabbitMq = new RabbitMq().getInstance();

const BillingHistoryRabbitMq = require('./rabbit/BillingHistoryRabbitMq');
const billingHistoryRabbitMq = new BillingHistoryRabbitMq().getInstance();

const SubscriptionConsumer = require('./rabbit/consumers/SubscriptionConsumer');
const subscriptionConsumer = new SubscriptionConsumer();

let { port } = config;

// at every 3 minutes local cron to trigger billing
var CronJob = require('cron').CronJob;
var billingJob = new CronJob('*/3 * * * *', function() {
    axios.get(`http://localhost:${port}/cron/renewSubscriptions`).then(res => {
    }).catch(err =>{
        console.log('error while running billing cron:', err);
    });
}, null, true, 'Asia/Karachi');
//billingJob.start();

// at every hour local cron to mark user who are supposed to be charged
var markRenewalsJob = new CronJob('0 * * * *', function() {
    try{
        axios.get(`http://localhost:${port}/cron/markRenewableUsers`).then(res => {
        }).catch(err =>{
            helper.billingCycleFailedToExecute();
            console.log('error while running mark renewal cron:', err);
        });
    }catch(e){
        helper.billingCycleFailedToExecute();
    }
}, null, true, 'Asia/Karachi');
//markRenewalsJob.start();

// Start Server
app.listen(port, () => {
    console.log(`Subscription Renewal Service Running On Port ${port}`);
    rabbitMq.initServer((error, response) => {
        if(error){
            console.log(error)
        }else{
            console.log('Local RabbitMq status', response);
            
            // create queues
            rabbitMq.createQueue(config.queueNames.subscriptionResponseDispatcher);
            rabbitMq.createQueue(config.queueNames.subscriptionDispatcher);


            // connecting billing history rabbit
            billingHistoryRabbitMq.initServer((error, response) => {
                if(error){
                    console.log('Billing Hisotry RabbitMq error: ', error);
                }else{
                    console.log('Billing History RabbitMq status', response);
        
                    try{
                        // consuming queue.
                        rabbitMq.consumeQueue(config.queueNames.subscriptionResponseDispatcher, async(message) => {
                            await subscriptionConsumer.consume(JSON.parse(message.content))
                            rabbitMq.acknowledge(message);
                        });
                    }catch(error){
                        console.error(error.message);
                    }
                }
            });
        }
    });
});