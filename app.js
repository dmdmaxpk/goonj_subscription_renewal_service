const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const config = require('./config');
const axios = require('axios');
const app = express();
const helper = require('./helper/helper');

// Connection to Database
mongoose.connect(config.mongo_connection_url, {useUnifiedTopology: true, useCreateIndex: true, useNewUrlParser: true, useFindAndModify: false});
mongoose.connection.on('error', err => console.error(`Error: ${err.message}`));

// Import database models
require('./models/Subscription');
require('./models/User');
require('./models/Package');
require('./models/Callback');

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

const callbackController = require('./controllers/callbackController');

let { port } = config;

// Start Server
app.listen(port, () => {
    console.log(`Subscription Renewal Service Running On Port ${port}`);
    rabbitMq.initServer((error, response) => {
        if(error){
            console.log(error)
        }else{
            console.log('Local RabbitMq status', response);

            // create queues
            rabbitMq.createQueue(config.queueNames.callbackDispatcher);
            //rabbitMq.createQueue(config.queueNames.subscriptionResponseDispatcher);
            //rabbitMq.createQueue(config.queueNames.subscriptionDispatcher);


            // connecting billing history rabbit
            billingHistoryRabbitMq.initServer((error, response) => {
                if(error){
                    console.log('Billing Hisotry RabbitMq error: ', error);
                }else{
                    console.log('Billing History RabbitMq status', response);
        
                    try{
                        // consuming queue.
                        rabbitMq.consumeQueue(config.queueNames.callbackDispatcher, async(message) => {
                            await callbackController.processCallback(JSON.parse(message.content));
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