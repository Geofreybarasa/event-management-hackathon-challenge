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

// ====================== INITIATE STK PUSH ======================
const initiatePayment = async (req, res) => {
  try {
    const { phone, ticket_type_id, name, email, event_id } = req.body;

    // Input validation
    if (!phone || !ticket_type_id || !name || !email || !event_id) {
      return res.status(400).json({
        success: false,
        message: 'phone, ticket_type_id, name, email and event_id are required'
      });
    }

    // Get ticket type
    const [ticket] = await db.query(
      'SELECT * FROM ticket_types WHERE id = ?',
      [ticket_type_id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket type not found'
      });
    }

    // Check availability
    if (ticket[0].sold >= ticket[0].capacity) {
      return res.status(400).json({
        success: false,
        message: `Sorry — ${ticket[0].name} tickets are sold out!`
      });
    }

    // Prevent duplicate registration
    const [existing] = await db.query(
      'SELECT id FROM attendees WHERE event_id = ? AND email = ?',
      [event_id, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'This email is already registered for this event'
      });
    }

    const formattedPhone = formatPhone(phone);
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(timestamp);

    // STK Push Request
    const stkResponse = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: ticket[0].price,                    // Real price
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: name.substring(0, 12),    // M-Pesa accepts max 12 chars
        TransactionDesc: `${ticket[0].name} Ticket`
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const checkoutRequestId = stkResponse.data.CheckoutRequestID;

    // Save payment record
    const [paymentResult] = await db.query(
      `INSERT INTO payments 
       (ticket_type_id, event_id, phone, amount, checkout_request_id, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [ticket_type_id, event_id, formattedPhone, ticket[0].price, checkoutRequestId]
    );

    const paymentId = paymentResult.insertId;

    // Store temporary registration data
    await db.query(
      'UPDATE payments SET mpesa_code = ? WHERE id = ?',
      [JSON.stringify({ name, email, ticket_type_id, event_id }), paymentId]
    );

    // ==================== FINAL RESPONSE ====================
    res.status(200).json({
      success: true,
      message: '✅ Payment prompt sent successfully. Please check your phone and enter M-Pesa PIN.',
      customerName: name,
      checkoutRequestId,
      paymentId,
      amount: ticket[0].price,
      ticketType: ticket[0].name,
      status: 'pending',
      note: 'You can poll the status endpoint to check payment progress.'
    });

  } catch (error) {
    console.error('STK Push Error:', {
      message: error.message,
      response: error.response?.data
    });

    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment. Please try again.',
      error: process.env.NODE_ENV === 'development' 
        ? (error.response?.data || error.message) 
        : undefined
    });
  }
};

// ====================== MPESA CALLBACK ======================
const mpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body.Body?.stkCallback;

    if (!callbackData) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    const checkoutRequestId = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;

    // Find payment
    const [payments] = await db.query(
      'SELECT * FROM payments WHERE checkout_request_id = ?',
      [checkoutRequestId]
    );

    if (payments.length === 0) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    const payment = payments[0];

    if (resultCode === 0) {
      // SUCCESS
      const items = callbackData.CallbackMetadata?.Item || [];
      const mpesaCode = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || '';

      const regData = JSON.parse(payment.mpesa_code || '{}');
      const { name, email, ticket_type_id, event_id } = regData;

      const qrToken = crypto.randomUUID();

      // Get ticket details
      const [ticket] = await db.query('SELECT name, color FROM ticket_types WHERE id = ?', [ticket_type_id]);
      const ticketName = ticket[0]?.name || 'Regular';

      // Create attendee
      const [attendeeResult] = await db.query(
        `INSERT INTO attendees 
         (event_id, name, email, qr_code, ticket_type_id, ticket_type_name, payment_status, phone)
         VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)`,
        [event_id, name, email, qrToken, ticket_type_id, ticketName, payment.phone]
      );

      // Update payment
      await db.query(
        `UPDATE payments SET 
         status = 'completed', 
         mpesa_code = ?, 
         attendee_id = ? 
         WHERE checkout_request_id = ?`,
        [mpesaCode, attendeeResult.insertId, checkoutRequestId]
      );

      // Update sold count
      await db.query('UPDATE ticket_types SET sold = sold + 1 WHERE id = ?', [ticket_type_id]);

      // Send confirmation email (existing logic remains)
      // ... [Your email sending code remains the same - I can keep it if you want]
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

      console.log(`✅ Payment Successful: ${mpesaCode} for ${name}`);

    } else {
      // FAILED
      await db.query(
        "UPDATE payments SET status = 'failed' WHERE checkout_request_id = ?",
        [checkoutRequestId]
      );
      console.log(`❌ Payment Failed for checkout: ${checkoutRequestId}`);
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    console.error('Callback Error:', error.message);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  }
};

// ====================== CHECK PAYMENT STATUS ======================
const checkPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'paymentId is required'
      });
    }

    const [payments] = await db.query(
      `SELECT p.*, a.qr_code, a.name as attendee_name, a.email as attendee_email 
       FROM payments p
       LEFT JOIN attendees a ON a.id = p.attendee_id
       WHERE p.id = ?`,
      [paymentId]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    const payment = payments[0];

    res.status(200).json({
      success: true,
      status: payment.status,
      customerName: payment.mpesa_code ? JSON.parse(payment.mpesa_code).name : null,
      amount: payment.amount,
      mpesaCode: payment.mpesa_code,
      attendeeName: payment.attendee_name,
      qrCode: payment.qr_code,
      ticketType: payment.ticket_type_name // if you added this column
    });

  } catch (error) {
    console.error('Status Check Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
};

module.exports = { 
  initiatePayment, 
  mpesaCallback, 
  checkPaymentStatus 
};