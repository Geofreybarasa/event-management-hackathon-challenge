const express = require('express');
const router = express.Router();
const { getDashboardAnalytics, getEventAnalytics } = require('../controllers/analyticsController');

// GET all events analytics for dashboard
router.get('/dashboard', getDashboardAnalytics);

// GET single event analytics
router.get('/event/:id', getEventAnalytics);

module.exports = router;