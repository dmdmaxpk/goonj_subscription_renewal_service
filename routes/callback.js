const express = require('express');
const router = express.Router();
const controller = require('../controllers/callbackController');

router.route('/charging-callback').post(controller.callback);

module.exports = router;
