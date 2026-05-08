const db = require('../config/db');

// GET /api/scan/:qrCode - scan QR and check in attendee
const scanQRCode = async (req, res) => {
  try {
    const { qrCode } = req.params;

    // Find attendee by QR token
    const [attendee] = await db.query(
      `SELECT a.*, e.name as event_name 
       FROM attendees a 
       JOIN events e ON e.id = a.event_id
       WHERE a.qr_code = ?`,
      [qrCode]
    );

    if (attendee.length === 0) {
      return res.status(404).json({
        success: false,
        message: '❌ Invalid QR code'
      });
    }

    // Check if already checked in
    if (attendee[0].checked_in) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Already checked in',
        attendee: attendee[0]
      });
    }

    // Check them in
    await db.query(
      'UPDATE attendees SET checked_in = true WHERE qr_code = ?',
      [qrCode]
    );

    // Get updated attendee
    const [updated] = await db.query(
      'SELECT * FROM attendees WHERE qr_code = ?',
      [qrCode]
    );

    // Get updated count
    const [count] = await db.query(
      'SELECT COUNT(*) as total FROM attendees WHERE event_id = ? AND checked_in = true',
      [updated[0].event_id]
    );

    // Emit real-time update to dashboard
    const io = req.app.get('io');
    io.emit('attendeeCheckedIn', {
      attendee: updated[0],
      totalCheckedIn: count[0].total
    });

    res.status(200).json({
      success: true,
      message: '✅ Check-in successful!',
      attendee: {
        name: updated[0].name,
        email: updated[0].email,
        event: attendee[0].event_name
      },
      totalCheckedIn: count[0].total
    });

  } catch (error) {
    console.log('Scan error:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

module.exports = { scanQRCode };