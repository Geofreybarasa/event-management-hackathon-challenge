const express = require('express');
const router = express.Router();

// import middleware
const { validateAttendee } = require('../middleware/validate');
const { checkEventExists, checkAttendeeExists } = require('../middleware/checkExists');

// import controllers
const {
  registerAttendee,
  getEventAttendees,
  checkInAttendee
} = require('../controllers/attendeeController');

// POST - validate input first, check event exists, then register
router.post('/', validateAttendee, checkEventExists, registerAttendee);

// GET - check event exists first, then get attendees
router.get('/event/:eventId', checkEventExists, getEventAttendees);

// PATCH - check attendee exists first, then check in
router.patch('/:id/checkin', checkAttendeeExists, checkInAttendee);

module.exports = router;