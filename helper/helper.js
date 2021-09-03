let axios = require('axios');
let config = require('../config');
class Helper {

    static setDateWithTimezone(date){
        let newDate = date.toLocaleString("en-US", {timeZone: "Asia/Karachi"});
        newDate = new Date(newDate);
        return newDate;
    }

    static float2Int(float) {
        return float | 0;
    }

    static billingCycleFailedToExecute(){
        let emails = ['farhan.ali@dmdmax.com', 'nauman@dmdmax.com', 'usama.shamim@dmdmax.com', 'taha@dmdmax.com', 'muhammad.azam@dmdmax.com'];
        let cellNumbers = ['03476733767', '03335456507', '03468586076', '03336106083', '03485049911', '03455932384', '03087650052', '03461524521', '03468567087', '03215517524'];
        cellNumbers.forEach(async(msisdn) => {
            console.log('Sending message to', msisdn);
            this.sendMessage(msisdn).then(res => {
                console.log(res);
            });
        });

        axios.post(`${config.servicesUrls.message_service}/message/email`, {
            subject: 'Billing Cycle Failed To Execute', 
            text: `The billign cycle has been failed to execute, please check on priority. Thanks.`,
            to: emails
        }).then(res => {
            console.log('email sent with response: ', res.data);
        }).catch(err => {
            console.log('email service throws error:', err)
        });
    }

    static sendMessage(msisdn) {
        return new Promise(async(resolve, reject) => {
            let response = await axios.post(`${config.servicesUrls.message_service}/message/send-directly`, {message: 'Billing cycle failed to execue, please check on priority. Thanks', msisdn})
            .then(res =>{ 
                return res.data;
            }).catch(err =>{
                return 'failed to send message';
            });

            resolve(response);
        });
    }
}

module.exports = Helper;