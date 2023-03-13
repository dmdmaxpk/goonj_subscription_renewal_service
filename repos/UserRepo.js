const mongoose = require('mongoose');
const User = mongoose.model('User');

class UserRepository {

    constructor() {}
    async getUserByMsisdn (msisdn) {
        return await User.findOne({msisdn: msisdn});
    }

    async createUser (msisdn, source) {
        return await new User({msisdn: msisdn, operator: 'telenor', source: source}).save();
    }
}

module.exports = new UserRepository();