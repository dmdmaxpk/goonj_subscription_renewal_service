const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;


const callbackSchema = new Schema({
    
    //Generating shortIds instead of uuid also neglecting special symbols
    _id: { type: ShortId, len: 24, retries: 12 },
    msisdn: {type: String, required: true, index: true},
    serviceId: {type: String, index: true},
    status: {type: String, index: true},
    subscriptionTime: {type: Date, index: true},
    renewalTime: {type: Date, index: true},
    rawResponse: {type: String}
}, { strict: true });

module.exports = mongoose.model('Callback', callbackSchema);