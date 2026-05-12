require('dotenv').config();

const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const path = require('path');

const db = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*" } });

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| MAKE SOCKET AVAILABLE
|--------------------------------------------------------------------------
*/
app.set('io', io);

/*
|--------------------------------------------------------------------------
| STATIC FILES — must come before routes that serve HTML
|--------------------------------------------------------------------------
*/
app.use(express.static(path.join(__dirname, 'public')));

/*
|--------------------------------------------------------------------------
| REGISTRATION PAGE
|--------------------------------------------------------------------------
*/
app.get('/register/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
*/
const eventRoutes        = require('./routes/events');
const attendeeRoutes     = require('./routes/attendees');
const budgetRoutes       = require('./routes/budget');
const feedbackRoutes     = require('./routes/feedback');
const analyticsRoutes    = require('./routes/analyticsRoutes');
const registrationRoutes = require('./routes/registration');
const scanRoutes         = require('./routes/scan');

app.use('/api/events',       eventRoutes);
app.use('/api/attendees',    attendeeRoutes);
app.use('/api/budget',       budgetRoutes);
app.use('/api/feedback',     feedbackRoutes);
app.use('/api/analytics',    analyticsRoutes);
app.use('/api/register',     registrationRoutes);
app.use('/api/scan',         scanRoutes);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({
      success: true,
      message: 'Server is running',
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }
});

/*
|--------------------------------------------------------------------------
| SOCKET.IO
|--------------------------------------------------------------------------
*/
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

/*
|--------------------------------------------------------------------------
| API 404 — catch unknown API routes before frontend fallback
|--------------------------------------------------------------------------
*/
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found'
  });
});

/*
|--------------------------------------------------------------------------
| FRONTEND FALLBACK — serve index.html for all non-API routes
|--------------------------------------------------------------------------
*/
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
==================================
 EVENTFLOW SERVER RUNNING
 PORT     : ${PORT}
 Dashboard: http://localhost:${PORT}
 Health   : http://localhost:${PORT}/health
==================================
  `);
});

/*
|--------------------------------------------------------------------------
| PROCESS ERROR HANDLERS
|--------------------------------------------------------------------------
*/
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});