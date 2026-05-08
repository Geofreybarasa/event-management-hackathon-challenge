const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter
// Think of this like opening a connection to Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Test the connection when server starts
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email setup failed:', error.message);
  } else {
    console.log('✅ Email server ready!');
  }
});

module.exports = transporter;