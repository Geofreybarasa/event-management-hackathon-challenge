const axios = require('axios');
require('dotenv').config();

// ── BASE URL ──
const BASE_URL = process.env.MPESA_ENV === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke';

// ── GET ACCESS TOKEN ──
async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const response = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );

  return response.data.access_token;
}

// ── FORMAT PHONE ──
function formatPhone(phone) {
  phone = phone.toString().trim().replace(/\s/g, '');
  if (phone.startsWith('+254')) return phone.replace('+', '');
  if (phone.startsWith('254'))  return phone;
  if (phone.startsWith('07') || phone.startsWith('01')) {
    return '254' + phone.substring(1);
  }
  return phone;
}

// ── GET TIMESTAMP ──
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

// ── GET PASSWORD ──
function getPassword(timestamp) {
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

// ── EXPORTS ──
module.exports = {
  BASE_URL,
  getAccessToken,
  formatPhone,
  getTimestamp,
  getPassword
};