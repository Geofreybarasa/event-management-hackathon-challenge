const db = require('../config/db');

// GET /api/analytics/dashboard - overall stats across all events
const getDashboardAnalytics = async (req, res) => {
  try {
    // Query 1: Get all events with their attendee and budget stats
    // LEFT JOIN means: get all events even if they have no attendees/budgets
    const [eventStats] = await db.query(`
      SELECT 
        e.id,
        e.name,
        e.type,
        e.date,
        e.location,
        e.planned_budget,
        
        -- count total registered attendees per event
        COUNT(DISTINCT a.id) as total_registered,
        
        -- count only checked in attendees
        SUM(CASE WHEN a.checked_in = 1 THEN 1 ELSE 0 END) as total_checked_in,
        
        -- average feedback rating
        ROUND(AVG(DISTINCT f.rating), 1) as avg_rating,
        
        -- total feedback count
        COUNT(DISTINCT f.id) as total_feedback,
        
        -- total actual budget spent
        COALESCE(SUM(DISTINCT b.actual_amount), 0) as total_spent,
        
        -- total planned budget from budget items
        COALESCE(SUM(DISTINCT b.planned_amount), 0) as total_planned

      FROM events e
      LEFT JOIN attendees a ON a.event_id = e.id
      LEFT JOIN feedbacks f ON f.event_id = e.id
      LEFT JOIN budgets b ON b.event_id = e.id
      GROUP BY e.id, e.name, e.type, e.date, e.location, e.planned_budget
      ORDER BY e.created_at DESC
    `);

    // Query 2: Overall totals
    const [totals] = await db.query(`
      SELECT
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT a.id) as total_attendees,
        SUM(CASE WHEN a.checked_in = 1 THEN 1 ELSE 0 END) as total_checked_in,
        ROUND(AVG(f.rating), 1) as overall_avg_rating
      FROM events e
      LEFT JOIN attendees a ON a.event_id = e.id
      LEFT JOIN feedbacks f ON f.event_id = e.id
    `);

    // Calculate performance metrics per event
    const eventsWithMetrics = eventStats.map(ev => {
      const registered = parseInt(ev.total_registered) || 0;
      const checkedIn = parseInt(ev.total_checked_in) || 0;
      const planned = parseFloat(ev.planned_budget) || 0;
      const spent = parseFloat(ev.total_spent) || 0;

      // attendance rate percentage
      const attendanceRate = registered > 0
        ? Math.round((checkedIn / registered) * 100)
        : 0;

      // budget utilization percentage
      const budgetUtilization = planned > 0
        ? Math.round((spent / planned) * 100)
        : 0;

      // performance score out of 100
      // combines attendance rate (40%) + budget efficiency (30%) + feedback (30%)
      const feedbackScore = ev.avg_rating ? (ev.avg_rating / 5) * 100 : 0;
      const budgetScore = budgetUtilization <= 100 ? budgetUtilization : Math.max(0, 200 - budgetUtilization);
      const performanceScore = Math.round(
        (attendanceRate * 0.4) + (budgetScore * 0.3) + (feedbackScore * 0.3)
      );

      return {
        ...ev,
        total_registered: registered,
        total_checked_in: checkedIn,
        attendance_rate: attendanceRate,
        budget_utilization: budgetUtilization,
        performance_score: performanceScore,
        is_over_budget: spent > planned,
        avg_rating: ev.avg_rating || 0
      };
    });

    // Find best performing event
    const bestEvent = eventsWithMetrics.reduce((best, ev) =>
      ev.performance_score > (best?.performance_score || 0) ? ev : best, null
    );

    res.status(200).json({
      totals: totals[0],
      events: eventsWithMetrics,
      bestEvent
    });

  } catch (error) {
    console.log('Analytics error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/analytics/event/:id - detailed stats for one event
const getEventAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    // Get event details with all metrics
    const [rows] = await db.query(`
      SELECT 
        e.id, e.name, e.type, e.date, e.location, e.planned_budget,
        COUNT(DISTINCT a.id) as total_registered,
        SUM(CASE WHEN a.checked_in = 1 THEN 1 ELSE 0 END) as total_checked_in,
        ROUND(AVG(DISTINCT f.rating), 1) as avg_rating,
        COUNT(DISTINCT f.id) as total_feedback,
        COALESCE(SUM(DISTINCT b.actual_amount), 0) as total_spent,
        COALESCE(SUM(DISTINCT b.planned_amount), 0) as total_planned
      FROM events e
      LEFT JOIN attendees a ON a.event_id = e.id
      LEFT JOIN feedbacks f ON f.event_id = e.id
      LEFT JOIN budgets b ON b.event_id = e.id
      WHERE e.id = ?
      GROUP BY e.id
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const ev = rows[0];
    const registered = parseInt(ev.total_registered) || 0;
    const checkedIn = parseInt(ev.total_checked_in) || 0;
    const planned = parseFloat(ev.planned_budget) || 0;
    const spent = parseFloat(ev.total_spent) || 0;

    res.status(200).json({
      event: {
        ...ev,
        attendance_rate: registered > 0 ? Math.round((checkedIn / registered) * 100) : 0,
        budget_utilization: planned > 0 ? Math.round((spent / planned) * 100) : 0,
        avg_rating: ev.avg_rating || 0
      }
    });

  } catch (error) {
    console.log('Event analytics error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getDashboardAnalytics, getEventAnalytics };