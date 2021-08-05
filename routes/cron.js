const express = require('express');
const router = express.Router();
const controller = require('../controllers/cronController');


router.route('/markRenewableUsers').get(controller.markRenewableUsers);
router.route('/markRenewableUserForcefully').get(controller.markRenewableUserForcefully);
router.route('/renewSubscriptions').get(controller.renewSubscriptions);

module.exports = router;
