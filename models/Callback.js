const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;


const callbackSchema = new Schema({
    
    //Generating shortIds instead of uuid also neglecting special symbols
    _id: { type: ShortId, len: 4, retries: 4 },
    response: {type: String, required: true}
}, { strict: true });

module.exports = mongoose.model('Callback', callbackSchema);