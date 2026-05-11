const db = require('../config/db');
const QRCode = require('qrcode');
const transporter = require('../config/mailer');
const crypto = require('crypto');

// GET /register/:token - get event details for registration page
const getEventByToken = async (req, res) => {
  try {
    const { token } = req.params;

    const [event] = await db.query(
      'SELECT id, name, type, date, location FROM events WHERE registration_token = ?',
      [token]
    );

    if (event.length === 0) {
      return res.status(404).json({ message: 'Registration link is invalid or expired' });
    }

    res.status(200).json({ event: event[0] });

  } catch (error) {
    console.log('Error fetching event:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /register/:token - attendee submits registration form
const selfRegister = async (req, res) => {
  try {
    const { token } = req.params;
    const { name, email } = req.body;

    // validate input
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    // validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }

    // find event by token
    const [event] = await db.query(
      'SELECT * FROM events WHERE registration_token = ?',
      [token]
    );

    if (event.length === 0) {
      return res.status(404).json({ message: 'Registration link is invalid' });
    }

    const eventData = event[0];

    // check duplicate registration
    const [existing] = await db.query(
      'SELECT * FROM attendees WHERE event_id = ? AND email = ?',
      [eventData.id, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: 'This email is already registered for this event'
      });
    }

    // generate unique QR token
    const qrToken = crypto.randomUUID();

    // save attendee
    const [result] = await db.query(
      'INSERT INTO attendees (event_id, name, email, qr_code) VALUES (?, ?, ?, ?)',
      [eventData.id, name, email, qrToken]
    );

    const [newAttendee] = await db.query(
      'SELECT * FROM attendees WHERE id = ?',
      [result.insertId]
    );

    // generate QR code image
    const qrCodeImage = await QRCode.toDataURL(qrToken, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });

    const qrBuffer = Buffer.from(
      qrCodeImage.replace('data:image/png;base64,', ''),
      'base64'
    );

    // send confirmation email with QR code
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `✅ You're registered for ${eventData.name}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          
          <div style="background: #6c63ff; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">EventFlow</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Registration Confirmed</p>
          </div>

          <div style="background: #f9f9f9; padding: 32px; border-radius: 0 0 12px 12px;">
            
            <h2 style="color: #333; margin-top: 0;">Hello ${name}! 👋</h2>
            <p style="color: #666; line-height: 1.6;">
              You have successfully registered for 
              <strong>${eventData.name}</strong>. We are excited to have you!
            </p>

            <div style="background: white; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #6c63ff;">
              <h3 style="margin: 0 0 12px; color: #333;">Event Details</h3>
              <p style="margin: 4px 0; color: #666;">
                📅 <strong>Date:</strong> 
                ${new Date(eventData.date).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p style="margin: 4px 0; color: #666;">
                📍 <strong>Location:</strong> ${eventData.location || 'To be announced'}
              </p>
              <p style="margin: 4px 0; color: #666;">
                🎫 <strong>Type:</strong> ${eventData.type}
              </p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <h3 style="color: #333;">Your Entry QR Code</h3>
              <p style="color: #666; margin-bottom: 16px;">
                Present this QR code at the entrance for check-in.
                Show it from your phone or print it out.
              </p>
              <img src="cid:qrcode" alt="QR Code" 
                style="width:200px; height:200px; border: 4px solid #6c63ff; border-radius: 12px;"/>
            </div>

            <div style="background: #fff3cd; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <h4 style="margin: 0 0 8px; color: #856404;">📋 Instructions</h4>
              <ol style="color: #856404; margin: 0; padding-left: 20px; line-height: 1.8;">
                <li>Save this email or screenshot your QR code</li>
                <li>Arrive at the venue on time</li>
                <li>Present your QR code at the entrance</li>
                <li>Wait for confirmation from the scanner</li>
              </ol>
            </div>

            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">
              This is an automated email from EventFlow. Please do not reply.
            </p>

          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'qrcode.png',
          content: qrBuffer,
          cid: 'qrcode'
        }
      ]
    });

    // emit real-time update to dashboard
    const io = req.app.get('io');
    io.emit('attendeeRegistered', {
      attendee: newAttendee[0],
    });

    res.status(201).json({
      message: '✅ Registration successful! Check your email for your QR code.',
      attendee: {
        name: newAttendee[0].name,
        email: newAttendee[0].email,
        event: eventData.name
      }
    });

  } catch (error) {
    console.log('Error in self registration:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getEventByToken, selfRegister };