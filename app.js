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

const BillingHistoryRabbitMq = require('./rabbit/BillingHistoryRabbitMq');
const billingHistoryRabbitMq = new BillingHistoryRabbitMq().getInstance();

const SubscriptionConsumer = require('./rabbit/consumers/SubscriptionConsumer');
const subscriptionConsumer = new SubscriptionConsumer();

// Start Server
let { port } = config;
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