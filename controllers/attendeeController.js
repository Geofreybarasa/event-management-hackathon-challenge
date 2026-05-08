const db = require('../config/db');
const QRCode = require('qrcode');
const transporter = require('../config/mailer');
const crypto = require('crypto'); // built into Node, no install needed

const registerAttendee = async (req, res) => {
  try {
    const { event_id, name, email } = req.body;

    // Check duplicate email
    const [existing] = await db.query(
      'SELECT * FROM attendees WHERE event_id = ? AND email = ?',
      [event_id, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: 'This email is already registered for this event'
      });
    }

    // Generate unique QR code token
    // crypto.randomUUID() creates a unique string like:
    // "550e8400-e29b-41d4-a716-446655440000"
    const qrToken = crypto.randomUUID();

    // Save attendee with QR token
    const [result] = await db.query(
      'INSERT INTO attendees (event_id, name, email, qr_code) VALUES (?, ?, ?, ?)',
      [event_id, name, email, qrToken]
    );

    // Get the newly registered attendee
    const [newAttendee] = await db.query(
      'SELECT * FROM attendees WHERE id = ?',
      [result.insertId]
    );

    // Get event details for the email
    const [event] = await db.query(
      'SELECT * FROM events WHERE id = ?',
      [event_id]
    );

    // Get total attendee count
    const [count] = await db.query(
      'SELECT COUNT(*) as total FROM attendees WHERE event_id = ?',
      [event_id]
    );

    // Generate QR code as base64 image
    // This creates the actual QR image from the token
    const qrCodeImage = await QRCode.toDataURL(qrToken, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    // Convert base64 to buffer for email attachment
    const qrBuffer = Buffer.from(
      qrCodeImage.replace('data:image/png;base64,', ''),
      'base64'
    );

    // Send email with QR code
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `✅ You're registered for ${event[0].name}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          
          <!-- Header -->
          <div style="background: #6c63ff; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">EventFlow</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Registration Confirmed</p>
          </div>

          <!-- Body -->
          <div style="background: #f9f9f9; padding: 32px; border-radius: 0 0 12px 12px;">
            
            <!-- Greeting -->
            <h2 style="color: #333; margin-top: 0;">Hello ${name}! 👋</h2>
            <p style="color: #666; line-height: 1.6;">
              You have been successfully registered for <strong>${event[0].name}</strong>. 
              We are excited to have you join us!
            </p>

            <!-- Event Details -->
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #6c63ff;">
              <h3 style="margin: 0 0 12px; color: #333;">Event Details</h3>
              <p style="margin: 4px 0; color: #666;">📅 <strong>Date:</strong> ${new Date(event[0].date).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style="margin: 4px 0; color: #666;">📍 <strong>Location:</strong> ${event[0].location || 'To be announced'}</p>
              <p style="margin: 4px 0; color: #666;">🎫 <strong>Type:</strong> ${event[0].type}</p>
            </div>

            <!-- QR Code Instructions -->
            <div style="text-align: center; margin: 24px 0;">
              <h3 style="color: #333;">Your Entry QR Code</h3>
              <p style="color: #666; margin-bottom: 16px;">
                Please present this QR code at the event entrance for check-in. 
                You can show it directly from your phone or print it out.
              </p>
              <img src="cid:qrcode" alt="Your QR Code" style="width: 200px; height: 200px; border: 4px solid #6c63ff; border-radius: 12px;"/>
              <p style="color: #999; font-size: 12px; margin-top: 8px;">
                QR Code ID: ${qrToken.substring(0, 8)}...
              </p>
            </div>

            <!-- Instructions -->
            <div style="background: #fff3cd; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <h4 style="margin: 0 0 8px; color: #856404;">📋 Instructions</h4>
              <ol style="color: #856404; margin: 0; padding-left: 20px; line-height: 1.8;">
                <li>Save this email or screenshot your QR code</li>
                <li>Arrive at the event venue on time</li>
                <li>Present your QR code at the entrance</li>
                <li>Wait for the scanner to confirm your check-in</li>
              </ol>
            </div>

            <!-- Footer -->
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
          cid: 'qrcode' // referenced in html as src="cid:qrcode"
        }
      ]
    });

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('attendeeRegistered', {
      attendee: newAttendee[0],
      totalAttendees: count[0].total
    });

    res.status(201).json({
      message: '✅ Attendee registered! QR code sent to email.',
      attendee: newAttendee[0],
      totalAttendees: count[0].total
    });

  } catch (error) {
    console.log('Error registering attendee:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Register attendee for an event
// middleware handles: validation, event existence check
// const registerAttendee = async (req, res) => {
//   try {
//     // get data from request body
//     // no need to validate - validateAttendee middleware already did this
//     // no need to check event exists - checkEventExists middleware already did this
//     const { event_id, name, email } = req.body;

//     // Check if attendee already registered - this is business logic, stays here
//     const [existing] = await db.query(
//       'SELECT * FROM attendees WHERE event_id = ? AND email = ?',
//       [event_id, email]
//     );

//     if (existing.length > 0) {
//       return res.status(400).json({
//         message: 'This email is already registered for this event'
//       });
//     }

//     // Save attendee to database
//     const [result] = await db.query(
//       'INSERT INTO attendees (event_id, name, email) VALUES (?, ?, ?)',
//       [event_id, name, email]
//     );

//     // Get the newly registered attendee
//     const [newAttendee] = await db.query(
//       'SELECT * FROM attendees WHERE id = ?',
//       [result.insertId]
//     );

//     // Get total attendee count for this event
//     const [count] = await db.query(
//       'SELECT COUNT(*) as total FROM attendees WHERE event_id = ?',
//       [event_id]
//     );

//     // Emit real-time update to all connected clients
//     const io = req.app.get('io');
//     io.emit('attendeeRegistered', {
//       attendee: newAttendee[0],
//       totalAttendees: count[0].total
//     });

//     res.status(201).json({
//       message: '✅ Attendee registered successfully!',
//       attendee: newAttendee[0],
//       totalAttendees: count[0].total
//     });

//   } catch (error) {
//     console.log('Error registering attendee:', error.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// };

// Get all attendees for a specific event
// middleware handles: event existence check
const getEventAttendees = async (req, res) => {
  try {
    const { eventId } = req.params;

    // no need to check event exists - checkEventExists middleware already did this
    // req.event is already attached by middleware

    // Get all attendees for this event
    const [attendees] = await db.query(
      'SELECT * FROM attendees WHERE event_id = ?',
      [eventId]
    );

    // Get checked in count
    const [checkedIn] = await db.query(
      'SELECT COUNT(*) as total FROM attendees WHERE event_id = ? AND checked_in = true',
      [eventId]
    );

    res.status(200).json({
      // use req.event.name instead of querying again - middleware already fetched it
      event: req.event.name,
      totalRegistered: attendees.length,
      totalCheckedIn: checkedIn[0].total,
      attendees: attendees
    });

  } catch (error) {
    console.log('Error fetching attendees:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check in an attendee
// middleware handles: attendee existence check
const checkInAttendee = async (req, res) => {
  try {
    // no need to get attendee from db - checkAttendeeExists middleware already did this
    // req.attendee is already attached by middleware

    // Check if already checked in - business logic, stays here
    if (req.attendee.checked_in) {
      return res.status(400).json({
        message: 'Attendee already checked in'
      });
    }

    // Update checked_in to true in database
    await db.query(
      'UPDATE attendees SET checked_in = true WHERE id = ?',
      [req.attendee.id]
    );

    // Get updated attendee after the update
    const [updatedAttendee] = await db.query(
      'SELECT * FROM attendees WHERE id = ?',
      [req.attendee.id]
    );

    // Get total checked in count for this event
    const [count] = await db.query(
      'SELECT COUNT(*) as total FROM attendees WHERE event_id = ? AND checked_in = true',
      [req.attendee.event_id]
    );

    // Emit real-time update to all connected clients
    const io = req.app.get('io');
    io.emit('attendeeCheckedIn', {
      attendee: updatedAttendee[0],
      totalCheckedIn: count[0].total
    });

    res.status(200).json({
      message: '✅ Attendee checked in successfully!',
      attendee: updatedAttendee[0],
      totalCheckedIn: count[0].total
    });

  } catch (error) {
    console.log('Error checking in attendee:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { registerAttendee, getEventAttendees, checkInAttendee };