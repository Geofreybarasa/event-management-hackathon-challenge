const express = require('express');
const router = express.Router();
const {
  initiatePayment,
  mpesaCallback,
  checkPaymentStatus
} = require('../controllers/mpesaController');

router.post('/initiate', initiatePayment);
router.post('/callback', mpesaCallback);
router.get('/status/:paymentId', checkPaymentStatus);

module.exports = router;