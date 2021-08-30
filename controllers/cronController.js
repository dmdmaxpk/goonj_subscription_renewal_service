const renewalService = require('../services/SubscriptionRenewalService');
const config = require('../config');
const axios = require('axios');

exports.markRenewableUsers = async (req, res) =>  {
    await renewalService.markRenewableUser();
    res.send({status: config.codes.code_success, message: 'MarkRenewableUsers Executed'});
}

exports.markRenewableUserForcefully = async (req, res) =>  {
    console.log("Marking renewable users forcefully");
    renewalService.markRenewableUserForcefully();
    res.send({status: config.codes.code_success, message: 'MarkRenewableUserForcefully Executed'});
}

exports.renewSubscriptions = async (req, res) =>  {
    let packages = await axios({method: 'get', url: `${config.service.core_service}/package/all?slug=live`, headers: {'Content-Type': 'application/json' }
    }).then(function(response){
        return response.data;
    }).catch(function(err){
        console.log(err);
        return undefined;
    });

    if(packages){
        renewalService.subscriptionRenewal(packages);
        res.send({status: config.codes.code_success, message: 'RenewSubscriptions Executed'});
    }else{
        console.log('Packages not available');
        res.send({status: config.codes.code_error, message: 'Packages not available'});
    }
}