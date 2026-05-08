//Here is what is done in this file...it is an entry point
//  1. Creates the express app
// 2. Connects socket.io
// 3. Registers middleware globally (cors, express.json)
// 4. Registers all routes
// 5. Starts the server on a port
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: "*" }
});

// Middleware
app.use(cors());
app.use(express.json()); // lets us read JSON from requests

// Routes
const eventRoutes = require('./routes/events');
const attendeeRoutes = require('./routes/attendees');
const budgetRoutes = require('./routes/budget');
const feedbackRoutes = require('./routes/feedback');
const analyticsRoutes = require('./routes/analyticsRoutes');

app.use('/api/events', eventRoutes);
app.use('/api/attendees', attendeeRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);

// Socket.io - real time connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible everywhere in the app
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// For any non‑API request, send index.html (for client‑side routing if you add it later)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});