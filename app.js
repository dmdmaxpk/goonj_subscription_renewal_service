const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const config = require('./config');
const axios = require('axios');
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

const BillingHistoryRabbitMq = require('./rabbit/BillingHistoryRabbitMq');
const billingHistoryRabbitMq = new BillingHistoryRabbitMq().getInstance();

const SubscriptionConsumer = require('./rabbit/consumers/SubscriptionConsumer');
const subscriptionConsumer = new SubscriptionConsumer();

let { port } = config;

// at every 3 minutes local cron to trigger billing
var CronJob = require('cron').CronJob;
var billingJob = new CronJob('*/3 * * * *', function() {
    axios.get(`http://localhost:${port}/cron/renewSubscriptions`).then(res => {
        console.log(res.data);
    }).catch(err =>{
        console.log('error while running billing cron:', err);
    });
}, null, true, 'Asia/Karachi');
billingJob.start();

// at every hour local cron to mark user who are supposed to be charged
var markRenewalsJob = new CronJob('0 * * * *', function() {
    axios.get(`http://localhost:${port}/cron/renewSubscriptions`).then(res => {
        console.log(res.data);
    }).catch(err =>{
        console.log('error while running mark renewal cron:', err);
    });
}, null, true, 'Asia/Karachi');
markRenewalsJob.start();

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