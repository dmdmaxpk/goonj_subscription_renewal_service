const config = require('../config');
const RabbitMq = require('../rabbit/RabbitMq');
const rabbitMq = new RabbitMq().getInstance();

class Helper {
    static sendToQueue(queueName, messageObj) {
        rabbitMq.addInQueue(queueName, messageObj);
        return true;
    }
}

module.exports = Helper;