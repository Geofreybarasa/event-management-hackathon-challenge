const db = require('../config/db');
const crypto = require('crypto');

// Create a new event
// validation already handled by validateEvent middleware
const createEvent = async (req, res) => {
  try {
    const { name, type, date, location, planned_budget } = req.body;

    // generate unique token for self registration link
    const registration_token = crypto.randomUUID();

    const [result] = await db.query(
      'INSERT INTO events (name, type, date, location, planned_budget, registration_token) VALUES (?, ?, ?, ?, ?, ?)',
      [name, type, date, location, planned_budget, registration_token]
    );

    const [newEvent] = await db.query(
      'SELECT * FROM events WHERE id = ?',
      [result.insertId]
    );

    const io = req.app.get('io');
    io.emit('eventCreated', newEvent[0]);

    res.status(201).json({
      message: '✅ Event created successfully!',
      event: newEvent[0]
    });

  } catch (error) {
    console.log('Error creating event:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all events
const getAllEvents = async (req, res) => {
  try {
    const { search, type } = req.query;

    // build query dynamically based on filters
    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    // search by name
    if (search) {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    // filter by type
    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const [events] = await db.query(query, params);

    res.status(200).json({
      count: events.length,
      events: events
    });

  } catch (error) {
    console.log('Error fetching events:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single event by ID
// existence check already handled by checkEventExists middleware
const getEventById = async (req, res) => {
  // req.event already attached by middleware
  res.status(200).json({ event: req.event });
};

// Delete an event
// existence check already handled by checkEventExists middleware
const deleteEvent = async (req, res) => {
  try {
    // 1. Delete all attendees linked to this event first
    await db.query(
      'DELETE FROM attendees WHERE event_id = ?',
      [req.event.id]
    );

    // 2. Delete all budgets linked to this event
    await db.query(
      'DELETE FROM budgets WHERE event_id = ?',
      [req.event.id]
    );

    // 3. Now safe to delete the event
    await db.query(
      'DELETE FROM events WHERE id = ?',
      [req.event.id]
    );

    res.status(200).json({
      message: '✅ Event deleted successfully!'
    });

  } catch (error) {
    console.log('Error deleting event:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateEvent = async (req, res) => {
  try {
    // STEP 1: Get the new values from request body
    // These are the fields the user wants to change
    const { name, type, date, location, planned_budget } = req.body;

    // STEP 2: Update the event in database
    // SET tells MySQL which columns to update
    // The ? marks are placeholders for our values (prevents SQL injection)
    // Last ? is the event id - tells MySQL WHICH event to update
    // req.event.id comes from checkEventExists middleware
    await db.query(
      'UPDATE events SET name = ?, type = ?, date = ?, location = ?, planned_budget = ? WHERE id = ?',
      [name, type, date, location, planned_budget, req.event.id]
    );

    // STEP 3: Fetch the updated event from database
    // We do this because we want to send back the NEW values
    // not the old ones that were in req.event
    const [updated] = await db.query(
      'SELECT * FROM events WHERE id = ?',
      [req.event.id]
    );

    // STEP 4: Emit real-time update to all connected clients
    // This means if another user has the dashboard open
    // their screen will update automatically without refreshing
    const io = req.app.get('io');
    io.emit('eventUpdated', updated[0]);

    // STEP 5: Send success response with updated event data
    // updated is an array, updated[0] is the first (and only) result
    res.status(200).json({
      message: '✅ Event updated successfully!',
      event: updated[0]
    });

  } catch (error) {
    console.log('Error updating event:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createEvent, getAllEvents, getEventById, deleteEvent, updateEvent };