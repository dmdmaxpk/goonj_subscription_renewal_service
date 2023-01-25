const mongoose = require('mongoose');
const User = mongoose.model('User');

class UserRepository {

    constructor() {}
    async getUserByMsisdn (msisdn) {
        return await User.findOne({msisdn: msisdn});
    }
}

module.exports = new UserRepository();