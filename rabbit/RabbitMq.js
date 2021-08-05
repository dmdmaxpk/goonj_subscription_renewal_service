const config = require('../config');
const amqp = require('amqplib/callback_api');

class RabbitMq {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    initServer(callback) {
        this.createConnection((err, connection) => {
            if (err) {
                callback(err);
            } else {
                this.connection = connection;
                this.createChannel(connection, (error, channel) => {
                    if (error) {
                        callback(error);
                    } else {
                        this.channel = channel;
                        callback(null, 'connected');
                    }
                });
            }
        });
    }

    createConnection(callback){
        amqp.connect(config.rabbitMqConnectionString, (error, connection) => {
            if (error) {
                callback(error);
            }else{
                callback(null, connection);
                this.connection = connection;
            }
          });
    }

    createChannel(connection, callback){
        connection.createChannel(function(error, channel) {
            if (error) {
              callback(error);
            }
            callback(null, channel);
        });
    }

    createQueue(name, durable = true){
        this.channel.assertQueue(name, {durable: durable});
    }

    consumeQueue(queue, callback){
        this.channel.consume(queue, async (msg) =>  {
            callback(msg);
          }, {
            //It's time to turn manual acnkowledgments on using the {noAck: false} option and send a 
            // proper acknowledgment from the worker, once we're done with a task.
            noAck: false
        });
    }

    acknowledge(message){
        this.channel.ack(message);
    }

    noAcknowledge(message){
        this.channel.nack(message);
    }

    addInQueue(queue, message){
        let buffer = Buffer.from(JSON.stringify(message));
        this.channel.sendToQueue(queue, buffer, {persistent:true});
    }
}  

class Singleton {
    constructor() {
        if (!Singleton.instance) {
            Singleton.instance = new RabbitMq();
        }
    }
  
    getInstance() {
        return Singleton.instance;
    }
  }

module.exports = Singleton;
