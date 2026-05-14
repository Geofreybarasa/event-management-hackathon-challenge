const express = require('express');
const router = express.Router();
const {
  getEventTickets,
  createTicketType,
  updateTicketType,
  deleteTicketType
} = require('../controllers/ticketController');

router.get('/event/:eventId', getEventTickets);
router.post('/', createTicketType);
router.patch('/:id', updateTicketType);
router.delete('/:id', deleteTicketType);

module.exports = router;