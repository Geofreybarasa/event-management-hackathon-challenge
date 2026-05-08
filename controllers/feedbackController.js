const db = require('../config/db');

// POST - submit feedback for an event
// validation handled by validateFeedback middleware
// event existence handled by checkEventExists middleware
const submitFeedback = async (req, res) => {
  try {
    // get data from request body
    const { event_id, attendee_name, title, body, rating } = req.body;

    // validate rating is between 1 and 5
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: 'Rating must be between 1 and 5'
      });
    }

    // save to database
    const [result] = await db.query(
      'INSERT INTO feedbacks (event_id, attendee_name, title, body, rating) VALUES (?, ?, ?, ?, ?)',
      [event_id, attendee_name, title, body, rating]
    );

    // get newly created feedback using insertId
    const [newFeedback] = await db.query(
      'SELECT * FROM feedbacks WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: '✅ Feedback submitted!',
      feedback: newFeedback[0]
    });

  } catch (error) {
    console.log('Error submitting feedback:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET - get all feedback for an event
// event existence handled by checkEventExists middleware
const getEventFeedback = async (req, res) => {
  try {
    // eventId comes from URL params not body
    const { eventId } = req.params;

    // get all feedback for this event ordered by newest first
    const [feedbacks] = await db.query(
      'SELECT * FROM feedbacks WHERE event_id = ? ORDER BY created_at DESC',
      [eventId]
    );

    // calculate average rating - only if there is feedback
    const avgRating = feedbacks.length > 0
      ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
      : 0;

    res.status(200).json({
      // req.event attached by checkEventExists middleware
      event: req.event.name,
      totalFeedback: feedbacks.length,
      averageRating: avgRating,
      feedbacks
    });

  } catch (error) {
    console.log('Error fetching feedback:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { submitFeedback, getEventFeedback };