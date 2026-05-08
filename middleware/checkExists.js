const db = require('../config/db');

const checkEventExists = async (req, res, next) => {
  try {
    // check all possible param names
    const id = req.params.id || req.params.eventId || req.body.event_id;

    if (!id) {
      return res.status(400).json({ message: 'Event ID is required' });
    }

    const [event] = await db.query(
      'SELECT * FROM events WHERE id = ?',
      [id]
    );

    if (event.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    req.event = event[0];
    next();

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const checkAttendeeExists = async (req, res, next) => {
  try {
    const id = req.params.id; // ← only need this

    if (!id) {
      return res.status(400).json({ message: 'Attendee ID is required' });
    }

    const [attendee] = await db.query(
      'SELECT * FROM attendees WHERE id = ?',
      [id]
    );

    if (attendee.length === 0) {
      return res.status(404).json({ message: 'Attendee not found' });
    }

    req.attendee = attendee[0];
    next();

  } catch (error) {
    // if database fails, catch it here instead of crashing
    res.status(500).json({ message: 'Server error' });
  }
};

// should check budgets table where id = req.params.id
// attach to req.budget
const checkBudgetExists = async (req, res, next) => {
  try{
    const id = req.params.id;
    if(!id){
      return res.status(404).json({message: 'attendee id is requires'});
    }

    const [budget] = await db.query(
      'SELECT * FROM budgets WHERE id = ?',  [id]
    );

    if(budget.length === 0){
      return res.status(404).json({message: 'budget item not found'});
    }
    req.budget = budget[0];
    next();

  } catch (error){
    //if database fails, catch it here instead of crashing
    res.status(500).json({message: 'server error'});
  }
};

module.exports = { checkAttendeeExists, checkEventExists, checkBudgetExists };