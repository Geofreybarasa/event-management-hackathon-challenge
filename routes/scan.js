const express = require('express');
const router = express.Router();
const { scanQRCode } = require('../controllers/scanController');

// GET - scan QR code and check in attendee
router.get('/:qrCode', scanQRCode);

module.exports = router;