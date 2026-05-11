const express = require('express');
const router = express.Router();
const { getEventByToken, selfRegister } = require('../controllers/registrationController');

// GET - fetch event details for registration page
router.get('/:token', getEventByToken);

// POST - submit self registration
router.post('/:token', selfRegister);

module.exports = router;