const awilix = require('awilix');
const container = awilix.createContainer({
    injectionMode: awilix.InjectionMode.PROXY
});

// Repositories
const SubscriptionRepository = require('../repos/SubscriptionRepository');

container.register({
    // Here we are telling Awilix how to resolve a
    // userController: by instantiating a class.

    // Repositories
    subscriptionRepository: awilix.asClass(SubscriptionRepository).singleton(),
});

module.exports = container;  