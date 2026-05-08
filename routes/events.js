const express = require('express');
const router = express.Router();
const { validateEvent } = require('../middleware/validate');
const { checkEventExists } = require('../middleware/checkExists');
const { createEvent, getAllEvents, getEventById, deleteEvent, updateEvent } = require('../controllers/eventController');


// POST - validate first, then create
router.post('/', validateEvent, createEvent);

// GET all - no middleware needed
router.get('/', getAllEvents);

// GET one - check exists first, then get
router.get('/:id', checkEventExists, getEventById);

//delete
router.delete('/:id', checkEventExists, deleteEvent);

// checkEventExists runs first → confirms event exists → attaches req.event
// updateEvent runs second → uses req.event.id to update
router.patch('/:id', checkEventExists, updateEvent);

module.exports = router;