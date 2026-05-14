const db = require('../config/db');
const axios = require('axios');
const QRCode = require('qrcode');
const transporter = require('../config/mailer');
const crypto = require('crypto');
const {
  getAccessToken,
  formatPhone,
  getTimestamp,
  getPassword,
  BASE_URL
} = require('../config/mpesa');

// POST /api/mpesa/initiate - trigger STK push
const initiatePayment = async (req, res) => {
  try {
    const { phone, ticket_type_id, name, email, event_id } = req.body;

    if (!phone || !ticket_type_id || !name || !email || !event_id) {
      return res.status(400).json({
        message: 'phone, ticket_type_id, name, email and event_id are required'
      });
    }

    // get ticket type
    const [ticket] = await db.query(
      'SELECT * FROM ticket_types WHERE id = ?',
      [ticket_type_id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ message: 'Ticket type not found' });
    }

    // check availability
    if (ticket[0].sold >= ticket[0].capacity) {
      return res.status(400).json({
        message: `Sorry — ${ticket[0].name} tickets are sold out!`
      });
    }

    // check duplicate registration
    const [existing] = await db.query(
      'SELECT * FROM attendees WHERE event_id = ? AND email = ?',
      [event_id, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: 'This email is already registered for this event'
      });
    }

    // format phone number
    const formattedPhone = formatPhone(phone);

    // get M-Pesa access token
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(timestamp);

    // call Safaricom STK Push API
    const stkResponse = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerBuyGoodsOnline',
        Amount: Math.ceil(ticket[0].price),
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: `EVF-${event_id}`,
        TransactionDesc: `${ticket[0].name} ticket - EventFlow`
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const checkoutRequestId = stkResponse.data.CheckoutRequestID;

    // save pending payment
    const [paymentResult] = await db.query(
      `INSERT INTO payments
       (ticket_type_id, event_id, phone, amount, checkout_request_id, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [ticket_type_id, event_id, formattedPhone, ticket[0].price, checkoutRequestId]
    );

    // save pending registration data temporarily
    // store in payments table as JSON for callback to use
    await db.query(
      'UPDATE payments SET mpesa_code = ? WHERE id = ?',
      [JSON.stringify({ name, email, ticket_type_id, event_id }), paymentResult.insertId]
    );

    res.status(200).json({
      message: '✅ Payment prompt sent to your phone!',
      checkoutRequestId,
      paymentId: paymentResult.insertId,
      amount: ticket[0].price,
      ticketType: ticket[0].name
    });

 } catch (error) {
  // show full error details
  console.log('STK Push error full:', JSON.stringify(error.response?.data, null, 2));
  console.log('STK Push error message:', error.message);
  console.log('STK Push error status:', error.response?.status);
  
  res.status(500).json({
    message: 'Payment initiation failed. Please try again.',
    debug: error.response?.data || error.message // shows error in Postman
  });
}
};

// POST /api/mpesa/callback - Safaricom sends payment result here
const mpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body.Body?.stkCallback;

    if (!callbackData) {
      return res.status(400).json({ message: 'Invalid callback' });
    }

    const checkoutRequestId = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;

    // find the payment record
    const [payment] = await db.query(
      'SELECT * FROM payments WHERE checkout_request_id = ?',
      [checkoutRequestId]
    );

    if (payment.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const paymentRecord = payment[0];

    if (resultCode === 0) {
      // ✅ PAYMENT SUCCESSFUL

      // get M-Pesa transaction code
      const items = callbackData.CallbackMetadata?.Item || [];
      const mpesaCode = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || '';

      // get registration data from mpesa_code field
      const regData = JSON.parse(paymentRecord.mpesa_code || '{}');
      const { name, email, ticket_type_id, event_id } = regData;

      // generate QR token
      const qrToken = crypto.randomUUID();

      // get ticket type name
      const [ticket] = await db.query(
        'SELECT * FROM ticket_types WHERE id = ?',
        [ticket_type_id]
      );

      // create attendee
      const [attendeeResult] = await db.query(
        `INSERT INTO attendees
         (event_id, name, email, qr_code, ticket_type_id, ticket_type_name, payment_status, phone)
         VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)`,
        [
          event_id, name, email, qrToken,
          ticket_type_id, ticket[0].name,
          paymentRecord.phone
        ]
      );

      // update payment record
      await db.query(
        `UPDATE payments SET
         status = 'completed',
         mpesa_code = ?,
         attendee_id = ?
         WHERE checkout_request_id = ?`,
        [mpesaCode, attendeeResult.insertId, checkoutRequestId]
      );

      // update tickets sold count
      await db.query(
        'UPDATE ticket_types SET sold = sold + 1 WHERE id = ?',
        [ticket_type_id]
      );

      // get event details for email
      const [event] = await db.query(
        'SELECT * FROM events WHERE id = ?',
        [event_id]
      );

      // generate QR code image
      const qrCodeImage = await QRCode.toDataURL(qrToken, {
        width: 300, margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });

      const qrBuffer = Buffer.from(
        qrCodeImage.replace('data:image/png;base64,', ''),
        'base64'
      );

      // ticket color for email
      const ticketColor = ticket[0].color || '#6c63ff';

      // send confirmation email
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `🎫 Ticket Confirmed — ${event[0].name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">

            <div style="background:${ticketColor};padding:32px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="color:white;margin:0;font-size:28px;">EventFlow</h1>
              <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Payment Confirmed ✅</p>
            </div>

            <div style="background:#f9f9f9;padding:32px;border-radius:0 0 12px 12px;">

              <h2 style="color:#333;margin-top:0;">Hello ${name}! 🎉</h2>
              <p style="color:#666;line-height:1.6;">
                Your payment was successful and your ticket is confirmed for
                <strong>${event[0].name}</strong>.
              </p>

              <!-- TICKET BADGE -->
              <div style="text-align:center;margin:24px 0;">
                <div style="
                  display:inline-block;
                  background:${ticketColor};
                  color:white;
                  padding:8px 24px;
                  border-radius:20px;
                  font-size:18px;
                  font-weight:bold;
                  letter-spacing:1px;
                ">
                  ${ticket[0].name} TICKET
                </div>
              </div>

              <!-- EVENT DETAILS -->
              <div style="background:white;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid ${ticketColor};">
                <h3 style="margin:0 0 12px;color:#333;">Event Details</h3>
                <p style="margin:4px 0;color:#666;">
                  📅 <strong>Date:</strong>
                  ${new Date(event[0].date).toLocaleDateString('en-KE', {
                    weekday: 'long', year: 'numeric',
                    month: 'long', day: 'numeric'
                  })}
                </p>
                <p style="margin:4px 0;color:#666;">
                  📍 <strong>Location:</strong> ${event[0].location || 'To be announced'}
                </p>
                <p style="margin:4px 0;color:#666;">
                  💰 <strong>Amount Paid:</strong> KES ${paymentRecord.amount}
                </p>
                <p style="margin:4px 0;color:#666;">
                  🧾 <strong>M-Pesa Code:</strong> ${mpesaCode}
                </p>
              </div>

              <!-- QR CODE -->
              <div style="text-align:center;margin:24px 0;">
                <h3 style="color:#333;">Your Entry QR Code</h3>
                <p style="color:#666;margin-bottom:16px;">
                  Present this at the entrance for check-in.
                </p>
                <img src="cid:qrcode" alt="QR Code"
                  style="width:200px;height:200px;border:4px solid ${ticketColor};border-radius:12px;"/>
              </div>

              <!-- INSTRUCTIONS -->
              <div style="background:#fff3cd;border-radius:8px;padding:16px;margin:24px 0;">
                <h4 style="margin:0 0 8px;color:#856404;">📋 Instructions</h4>
                <ol style="color:#856404;margin:0;padding-left:20px;line-height:1.8;">
                  <li>Save this email or screenshot your QR code</li>
                  <li>Arrive at the venue on time</li>
                  <li>Present your QR code at the entrance</li>
                  <li>Enjoy the event!</li>
                </ol>
              </div>

              <p style="color:#999;font-size:12px;text-align:center;">
                This is an automated email from EventFlow. Please do not reply.
              </p>
            </div>
          </div>
        `,
        attachments: [{
          filename: 'ticket-qr.png',
          content: qrBuffer,
          cid: 'qrcode'
        }]
      });

      // emit real-time update to dashboard
      const io = global.io;
      if (io) {
        io.emit('paymentCompleted', {
          name, email,
          ticketType: ticket[0].name,
          event: event[0].name
        });
      }

      console.log(`✅ Payment successful: ${mpesaCode} for ${name}`);

    } else {
      // ❌ PAYMENT FAILED
      await db.query(
        "UPDATE payments SET status = 'failed' WHERE checkout_request_id = ?",
        [checkoutRequestId]
      );
      console.log(`❌ Payment failed for checkout: ${checkoutRequestId}`);
    }

    // always respond 200 to Safaricom
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    console.log('Callback error:', error.message);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  }
};

// GET /api/mpesa/status/:paymentId - check payment status (polling)
const checkPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const [payment] = await db.query(
      `SELECT p.*, a.qr_code, a.name as attendee_name
       FROM payments p
       LEFT JOIN attendees a ON a.id = p.attendee_id
       WHERE p.id = ?`,
      [paymentId]
    );

    if (payment.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.status(200).json({
      status: payment[0].status,
      mpesaCode: payment[0].mpesa_code,
      attendeeName: payment[0].attendee_name
    });

  } catch (error) {
    console.log('Status check error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { initiatePayment, mpesaCallback, checkPaymentStatus };