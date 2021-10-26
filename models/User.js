const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;
const MongooseTrigger = require('mongoose-trigger');
const config = require('../config');

const BillingHistoryRabbitMq = require('../rabbit/BillingHistoryRabbitMq');
const rabbitMq = new BillingHistoryRabbitMq().getInstance();

const userSchema = new Schema({
    
    //FOR PRODUCTION
    _id: { type: ShortId, len: 12, retries: 4 },
    msisdn: { type: String, index: true },

     // operator of the user (telenor/zong/ufone etc)
    operator: {type: String, index: true},
    
    // app / web  etc
    source: {type: String, default: "app", index: true},

    active: { type: Boolean, default: true, index: true },

    // fields for user device identification
    fcm_token: String,
    device_id: String,


    // These fields can be used later in future.
    username: String,
    fullname: String,
    email: String,
    description: String,
    avatar: String,
    dateOfBirth: String,
    gender: String,
    profilePicture: String,
    

    //fields for FnF flow
    is_gray_listed: { type: Boolean, default: false },
    is_black_listed: { type: Boolean, default: false },

   
    added_dtm: { type: Date, default: Date.now, index: true },
    last_modified: Date
}, { strict: true });


if(config.is_triggeres_enabled){
    const UserEvents = MongooseTrigger(userSchema, {
        events: {
          create: true,
          update: true,
          remove: true,
        },
        debug: false
    });
    
    UserEvents.on('create', data => {
        triggerEvent('create', data);
    });
    
    UserEvents.on('update', data => {
      triggerEvent('update', data);
    });
    
    UserEvents.on('remove', data => {
        triggerEvent('remove', data);
    });
    
    triggerEvent = (method, data) => {
        let form = {collection: 'users', method, data};
    
        rabbitMq.addInQueue(config.queueNames.syncCollectionDispatcher, form);
        console.log('Sync data sent to queue', form.collection);
    }
}else{
    console.log("TRIGGERES ARE DISABLED");
}

module.exports = mongoose.model('User', userSchema);