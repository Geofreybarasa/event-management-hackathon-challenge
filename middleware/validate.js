const validateEvent = (req, res, next) => {
  const { name, date } = req.body;

  if (!name) {
    return res.status(400).json({ 
      message: 'Event name is required' 
    });
  }

  if (!date) {
    return res.status(400).json({ 
      message: 'Event date is required' 
    });
  }

  // Everything is fine, move forward
  next();
};

const validateAttendee = (req, res, next) => {
  const { event_id, name, email } = req.body;

  if (!event_id || !name || !email) {
    return res.status(400).json({
      message: 'event_id, name and email are required'
    });
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      message: 'Please provide a valid email'
    });
  }

  next();
};

// should check that category and planned_amount exist in req.body
const validateBudget = (req, res, next) => {
  const { category, planned_amount } = req.body;

  if (!category) {
    return res.status(400).json({ message: 'Category is required' });
  }

  if (!planned_amount) {
    return res.status(400).json({ message: 'Planned amount is required' });
  }

  // ✅ prevent negative values
  if (parseFloat(planned_amount) <= 0) {
    return res.status(400).json({ message: 'Planned amount must be greater than 0' });
  }

  next();
};

const validateFeedback = (req, res, next) => {
  const { event_id, attendee_name, body, rating } = req.body;
if (!event_id) {
    return res.status(400).json({ message: 'Event ID is required' });
  }

  if (!attendee_name) {
    return res.status(400).json({ message: 'Attendee name is required' });
  }

  if (!body) {
    return res.status(400).json({ message: 'Feedback body is required' });
  }

  if (!rating) {
    return res.status(400).json({ message: 'Rating is required' });
  }

  if (parseFloat(rating) < 1 || parseFloat(rating) > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  next();

};



module.exports = { validateEvent, validateAttendee, validateBudget, validateFeedback };