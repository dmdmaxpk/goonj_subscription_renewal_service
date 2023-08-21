const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;

const campaignSchema = new Schema({
    _id: { type: ShortId, len: 12, retries: 4},
    msisdn: {type: String, index: true},
    service_id: {type: String},
    package_id: {type: String, index: true},
    source: {type: String},
    marketing_source: { type: String, default: 'none' },
    affiliate_tid: {type:String},
    affiliate_mid: {type:String, index: true},
    payment_source: { type: String, default: "telenor" },
    added_dtm: { type: Date, default: Date.now, index: true }
}, { strict: true });

module.exports = mongoose.model('Campaign', campaignSchema);