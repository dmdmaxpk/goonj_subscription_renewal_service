const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;


const packageSchema = new Schema({
    
    //Generating shortIds instead of uuid also neglecting special symbols
    _id: { type: ShortId, len: 4, retries: 4 },
    package_name: {type: String, required: true},
    package_desc: {type: String, required: true},
    package_duration: {type: Number, required: true}, // Hours of package 
    price_point_pkr: {type: Number, required: true},
    display_price_point_numeric: {type: Number},
    display_price_point: {type: String},
    partner_id: String,

    is_grace_allowed: {type: Boolean, default: true },
    streamable_grace_hours: {type: Number, default: 24 },
    grace_hours: {type: Number, default: 1440 },

    is_trial_allowed: {type: Boolean, default: true },
    trial_hours: {type: Number, default: 24 },

    is_micro_charge_allowed: {type: Boolean, default: false },
    micro_price_points: {type: Array, default: []},
    
    added_dtm: { type: Date, default: Date.now },
    last_modified: Date,
    default: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    
    paywall_id: {type: ShortId, required: true},
    subscription_message_text: {type: String},

    new_partner_id: {type: Array},
}, { strict: true });

module.exports = mongoose.model('Package', packageSchema);