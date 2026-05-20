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
global.io = io;

/*
|--------------------------------------------------------------------------
| API ROUTES — must be registered BEFORE static files
|--------------------------------------------------------------------------
*/
const eventRoutes        = require('./routes/events');
const attendeeRoutes     = require('./routes/attendees');
const budgetRoutes       = require('./routes/budget');
const feedbackRoutes     = require('./routes/feedback');
const analyticsRoutes    = require('./routes/analyticsRoutes');
const registrationRoutes = require('./routes/registration');
const scanRoutes         = require('./routes/scan');
const ticketRoutes       = require('./routes/tickets');
const mpesaRoutes        = require('./routes/mpesa');

app.use('/api/events',       eventRoutes);
app.use('/api/attendees',    attendeeRoutes);
app.use('/api/budget',       budgetRoutes);
app.use('/api/feedback',     feedbackRoutes);
app.use('/api/analytics',    analyticsRoutes);
app.use('/api/register',     registrationRoutes);
app.use('/api/scan',         scanRoutes);
app.use('/api/tickets',      ticketRoutes);
app.use('/api/mpesa',        mpesaRoutes);

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
| TEST MPESA — remove after testing
|--------------------------------------------------------------------------
*/
app.get('/test-mpesa', async (req, res) => {
  try {
    const mpesa = require('./config/mpesa');
    const token = await mpesa.getAccessToken();
    res.json({
      success: true,
      exports: Object.keys(mpesa),
      token: token.substring(0, 20) + '...'
    });
  } catch(error) {
    res.json({ success: false, error: error.message });
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
| API 404
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
| REGISTRATION PAGE — comes after API routes
|--------------------------------------------------------------------------
*/
app.get('/register/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

/*
|--------------------------------------------------------------------------
| STATIC FILES — must come AFTER API routes
|--------------------------------------------------------------------------
*/
app.use(express.static(path.join(__dirname, 'public')));

/*
|--------------------------------------------------------------------------
| FRONTEND FALLBACK
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