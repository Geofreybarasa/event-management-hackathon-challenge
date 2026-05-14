const db = require('../config/db');

// GET /api/tickets/event/:eventId - get all ticket types for event
const getEventTickets = async (req, res) => {
  try {
    const { eventId } = req.params;

    const [tickets] = await db.query(
      `SELECT *, (capacity - sold) as remaining
       FROM ticket_types
       WHERE event_id = ?
       ORDER BY price DESC`,
      [eventId]
    );

    res.status(200).json({ tickets });

  } catch (error) {
    console.log('Error fetching tickets:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/tickets - create ticket type
const createTicketType = async (req, res) => {
  try {
    const { event_id, name, price, capacity, description, color } = req.body;

    if (!event_id || !name || !price || !capacity) {
      return res.status(400).json({
        message: 'event_id, name, price and capacity are required'
      });
    }

    if (parseFloat(price) < 0) {
      return res.status(400).json({
        message: 'Price cannot be negative'
      });
    }

    // check event exists
    const [event] = await db.query(
      'SELECT * FROM events WHERE id = ?',
      [event_id]
    );

    if (event.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // check ticket name not duplicate for same event
    const [existing] = await db.query(
      'SELECT * FROM ticket_types WHERE event_id = ? AND name = ?',
      [event_id, name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: `Ticket type "${name}" already exists for this event`
      });
    }

    const [result] = await db.query(
      'INSERT INTO ticket_types (event_id, name, price, capacity, description, color) VALUES (?, ?, ?, ?, ?, ?)',
      [event_id, name, price, capacity, description || null, color || '#6c63ff']
    );

    const [newTicket] = await db.query(
      'SELECT *, (capacity - sold) as remaining FROM ticket_types WHERE id = ?',
      [result.insertId]
    );

    // emit real-time update
    const io = req.app.get('io');
    io.emit('ticketCreated', newTicket[0]);

    res.status(201).json({
      message: '✅ Ticket type created!',
      ticket: newTicket[0]
    });

  } catch (error) {
    console.log('Error creating ticket:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/tickets/:id - update ticket type
const updateTicketType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, capacity, description, color } = req.body;

    const [ticket] = await db.query(
      'SELECT * FROM ticket_types WHERE id = ?',
      [id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ message: 'Ticket type not found' });
    }

    await db.query(
      'UPDATE ticket_types SET name = ?, price = ?, capacity = ?, description = ?, color = ? WHERE id = ?',
      [
        name || ticket[0].name,
        price || ticket[0].price,
        capacity || ticket[0].capacity,
        description || ticket[0].description,
        color || ticket[0].color,
        id
      ]
    );

    const [updated] = await db.query(
      'SELECT *, (capacity - sold) as remaining FROM ticket_types WHERE id = ?',
      [id]
    );

    res.status(200).json({
      message: '✅ Ticket type updated!',
      ticket: updated[0]
    });

  } catch (error) {
    console.log('Error updating ticket:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/tickets/:id - delete ticket type
const deleteTicketType = async (req, res) => {
  try {
    const { id } = req.params;

    const [ticket] = await db.query(
      'SELECT * FROM ticket_types WHERE id = ?',
      [id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ message: 'Ticket type not found' });
    }

    // prevent deletion if tickets already sold
    if (ticket[0].sold > 0) {
      return res.status(400).json({
        message: `Cannot delete — ${ticket[0].sold} tickets already sold`
      });
    }

    await db.query('DELETE FROM ticket_types WHERE id = ?', [id]);

    res.status(200).json({ message: '✅ Ticket type deleted!' });

  } catch (error) {
    console.log('Error deleting ticket:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getEventTickets,
  createTicketType,
  updateTicketType,
  deleteTicketType
};