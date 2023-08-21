const mongoose = require('mongoose');
const Campaign = mongoose.model('Campaign');

class CampaignRepository {
    constructor(){
       
    }

    async getCampaign (msisdn) {
        return await Campaign.findOne({msisdn: msisdn});
    }
    
    async deleteRecord(msisdn)  {
        if(msisdn) {
            return await Campaign.deleteOne({msisdn: msisdn});
        }
        return undefined;
    }
}


module.exports = CampaignRepository;