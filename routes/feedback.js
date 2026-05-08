const express = require('express');
const router = express.Router();

// imports
const { validateFeedback } = require('../middleware/validate');
const { checkEventExists } = require('../middleware/checkExists');
const { submitFeedback, getEventFeedback } = require('../controllers/feedbackController');

// POST - validate, check event exists, then submit
router.post('/', validateFeedback, checkEventExists, submitFeedback);

// GET - check event exists, then get all feedback for that event
router.get('/event/:eventId', checkEventExists, getEventFeedback);

module.exports = router;