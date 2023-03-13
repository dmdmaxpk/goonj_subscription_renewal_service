const mongoose = require('mongoose');
const Package = mongoose.model('Package');

class PackageRepository {
    constructor(){
       
    }

    async createPackage (postData) {
        let package1 = new Package(postData);
        let result = await package1.save();
        return result;
    }
    
    async getPackage(query) {
        query.active = true;
        let result = await Package.find(query);
        if(result && result.length == 1){
            return result[0];
        }
        return undefined;
    }

    async getPackageByServiceId(serviceId) {
        return await Package.findOne({pid: serviceId});
    }
    
    async getAllPackages(query) {
        query.active = true;
        let result = await Package.find(query);
        return result;
    }
    
    async updatePackage(id, postData) {
        const query = { _id: id };
        postBody.last_modified = new Date();
        
        const result = await Package.updateOne(query, postData);
        if (result.nModified === 0) {
            return undefined;
        }else{
            let package1 = await getPackage({_id: id});
            return package1;
        }
    }
    
    async deletePackage  (id)  {
        const result = await Package.deleteOne({_id: id});
        return result;
    }
}


module.exports = PackageRepository;