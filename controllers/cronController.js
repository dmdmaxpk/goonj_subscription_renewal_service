const renewalService = require('../services/SubscriptionRenewalService');
const config = require('../config');

exports.markRenewableUsers = async (req, res) =>  {
    console.log("Marking renewable users")
    renewalService.markRenewableUser();
    res.send({status: config.codes.code_success, message: 'MarkRenewableUsers Executed'});
}

exports.markRenewableUserForcefully = async (req, res) =>  {
    console.log("Marking renewable users forcefully");
    renewalService.markRenewableUserForcefully();
    res.send({status: config.codes.code_success, message: 'MarkRenewableUserForcefully Executed'});
}

exports.renewSubscriptions = async (req, res) =>  {
    console.log("Renewing Subscriptions")
    renewalService.subscriptionRenewal();
    res.send({status: config.codes.code_success, message: 'RenewSubscriptions Executed'});
}