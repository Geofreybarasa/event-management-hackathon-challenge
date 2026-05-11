const db = require('../config/db');

/*
|--------------------------------------------------------------------------
| ANALYTICS CONTROLLER
|--------------------------------------------------------------------------
| This controller handles:
|
| 1. Dashboard analytics (all events)
| 2. Single event analytics
|
| IMPORTANT IMPROVEMENT:
| ----------------------
| We DO NOT directly join attendees, feedbacks, and budgets together
| because that creates duplicated rows internally.
|
| Example:
|   10 attendees × 3 feedbacks × 4 budgets = 120 rows
|
| This causes:
|   - inflated counts
|   - wrong averages
|   - duplicated sums
|
| SOLUTION:
| ---------
| Aggregate each table separately FIRST,
| then LEFT JOIN the aggregated results.
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| GET DASHBOARD ANALYTICS
|--------------------------------------------------------------------------
| GET /api/analytics/dashboard
|--------------------------------------------------------------------------
|
| Returns:
| - overall totals
| - all event analytics
| - best performing event
|
|--------------------------------------------------------------------------
*/

const getDashboardAnalytics = async (req, res) => {

  try {

    /*
    |--------------------------------------------------------------------------
    | MAIN EVENT ANALYTICS QUERY
    |--------------------------------------------------------------------------
    |
    | We aggregate each table separately:
    |
    | attendees  -> registration/check-in stats
    | feedbacks  -> ratings stats
    | budgets    -> spending stats
    |
    |--------------------------------------------------------------------------
    */

    const [events] = await db.query(`

      SELECT
        e.id,
        e.name,
        e.type,
        e.date,
        e.location,
        e.planned_budget,
        e.created_at,

        /* attendee stats */
        COALESCE(a.total_registered, 0) AS total_registered,
        COALESCE(a.total_checked_in, 0) AS total_checked_in,

        /* feedback stats */
        COALESCE(f.avg_rating, 0) AS avg_rating,
        COALESCE(f.total_feedback, 0) AS total_feedback,

        /* budget stats */
        COALESCE(b.total_spent, 0) AS total_spent,
        COALESCE(b.total_planned, 0) AS total_planned

      FROM events e

      /* --------------------------------------------------------------- */
      /* ATTENDEE ANALYTICS                                              */
      /* --------------------------------------------------------------- */

      LEFT JOIN (

        SELECT
          event_id,

          /* total registered attendees */
          COUNT(*) AS total_registered,

          /* total checked in attendees */
          SUM(
            CASE
              WHEN checked_in = 1 THEN 1
              ELSE 0
            END
          ) AS total_checked_in

        FROM attendees

        GROUP BY event_id

      ) a ON a.event_id = e.id


      /* --------------------------------------------------------------- */
      /* FEEDBACK ANALYTICS                                              */
      /* --------------------------------------------------------------- */

      LEFT JOIN (

        SELECT
          event_id,

          /* average feedback rating */
          ROUND(AVG(rating), 1) AS avg_rating,

          /* total feedback submissions */
          COUNT(*) AS total_feedback

        FROM feedbacks

        GROUP BY event_id

      ) f ON f.event_id = e.id


      /* --------------------------------------------------------------- */
      /* BUDGET ANALYTICS                                                */
      /* --------------------------------------------------------------- */

      LEFT JOIN (

        SELECT
          event_id,

          /* actual money spent */
          SUM(actual_amount) AS total_spent,

          /* planned budget amount */
          SUM(planned_amount) AS total_planned

        FROM budgets

        GROUP BY event_id

      ) b ON b.event_id = e.id

      /* newest events first */
      ORDER BY e.created_at DESC

    `);


    /*
    |--------------------------------------------------------------------------
    | OVERALL SYSTEM TOTALS
    |--------------------------------------------------------------------------
    */

    const [overallRows] = await db.query(`

      SELECT

        /* total number of events */
        COUNT(*) AS total_events,

        /* total attendees system-wide */
        (
          SELECT COUNT(*)
          FROM attendees
        ) AS total_attendees,

        /* total checked in attendees */
        (
          SELECT COUNT(*)
          FROM attendees
          WHERE checked_in = 1
        ) AS total_checked_in,

        /* overall average rating */
        (
          SELECT ROUND(AVG(rating), 1)
          FROM feedbacks
        ) AS overall_avg_rating

      FROM events

    `);

    const totals = overallRows[0];


    /*
    |--------------------------------------------------------------------------
    | CALCULATE ADVANCED METRICS
    |--------------------------------------------------------------------------
    */

    const processedEvents = events.map(event => {

      const registered =
        parseInt(event.total_registered) || 0;

      const checkedIn =
        parseInt(event.total_checked_in) || 0;

      const plannedBudget =
        parseFloat(event.planned_budget) || 0;

      const totalSpent =
        parseFloat(event.total_spent) || 0;

      const averageRating =
        parseFloat(event.avg_rating) || 0;


      /*
      |--------------------------------------------------------------------------
      | ATTENDANCE RATE
      |--------------------------------------------------------------------------
      |
      | Formula:
      |
      | checked_in / registered * 100
      |
      |--------------------------------------------------------------------------
      */

      const attendanceRate =
        registered > 0
          ? Math.round((checkedIn / registered) * 100)
          : 0;


      /*
      |--------------------------------------------------------------------------
      | BUDGET UTILIZATION
      |--------------------------------------------------------------------------
      |
      | Formula:
      |
      | actual_spent / planned_budget * 100
      |
      |--------------------------------------------------------------------------
      */

      const budgetUtilization =
        plannedBudget > 0
          ? Math.round((totalSpent / plannedBudget) * 100)
          : 0;


      /*
      |--------------------------------------------------------------------------
      | FEEDBACK SCORE
      |--------------------------------------------------------------------------
      |
      | Convert 5-star rating into percentage
      |
      |--------------------------------------------------------------------------
      */

      const feedbackScore =
        (averageRating / 5) * 100;


      /*
      |--------------------------------------------------------------------------
      | BUDGET SCORE
      |--------------------------------------------------------------------------
      |
      | Ideal budget usage:
      | - close to 100%
      | - not too under
      | - not too over
      |
      |--------------------------------------------------------------------------
      */

      let budgetScore = 0;

      if (budgetUtilization <= 100) {

        budgetScore = budgetUtilization;

      } else {

        /*
        |--------------------------------------------------------------------------
        | Penalize overspending
        |--------------------------------------------------------------------------
        */

        budgetScore =
          Math.max(0, 200 - budgetUtilization);
      }


      /*
      |--------------------------------------------------------------------------
      | PERFORMANCE SCORE
      |--------------------------------------------------------------------------
      |
      | Weighted formula:
      |
      | attendance = 40%
      | budget    = 30%
      | feedback  = 30%
      |
      |--------------------------------------------------------------------------
      */

      const performanceScore = Math.round(

        (attendanceRate * 0.4) +

        (budgetScore * 0.3) +

        (feedbackScore * 0.3)

      );


      /*
      |--------------------------------------------------------------------------
      | RETURN FINAL CLEAN OBJECT
      |--------------------------------------------------------------------------
      */

      return {

        ...event,

        total_registered: registered,

        total_checked_in: checkedIn,

        attendance_rate: attendanceRate,

        budget_utilization: budgetUtilization,

        performance_score: performanceScore,

        is_over_budget:
          totalSpent > plannedBudget,

        avg_rating: averageRating

      };

    });


    /*
    |--------------------------------------------------------------------------
    | FIND BEST PERFORMING EVENT
    |--------------------------------------------------------------------------
    */

    const bestEvent = processedEvents.reduce(

      (best, current) => {

        if (
          !best ||
          current.performance_score >
          best.performance_score
        ) {
          return current;
        }

        return best;

      },

      null

    );


    /*
    |--------------------------------------------------------------------------
    | FINAL RESPONSE
    |--------------------------------------------------------------------------
    */

    res.status(200).json({

      success: true,

      totals,

      total_events_returned:
        processedEvents.length,

      events: processedEvents,

      bestEvent

    });

  }

  catch (error) {

    console.log(
      'Dashboard analytics error:',
      error.message
    );

    res.status(500).json({

      success: false,

      message: 'Server error'

    });

  }

};



/*
|--------------------------------------------------------------------------
| GET SINGLE EVENT ANALYTICS
|--------------------------------------------------------------------------
| GET /api/analytics/event/:id
|--------------------------------------------------------------------------
|
| Returns:
| - detailed analytics for one event
|
|--------------------------------------------------------------------------
*/

const getEventAnalytics = async (req, res) => {

  try {

    const { id } = req.params;


    /*
    |--------------------------------------------------------------------------
    | SINGLE EVENT QUERY
    |--------------------------------------------------------------------------
    */

    const [rows] = await db.query(`

      SELECT

        e.id,
        e.name,
        e.type,
        e.date,
        e.location,
        e.description,
        e.planned_budget,
        e.created_at,

        /* attendee analytics */
        COALESCE(a.total_registered, 0)
          AS total_registered,

        COALESCE(a.total_checked_in, 0)
          AS total_checked_in,

        /* feedback analytics */
        COALESCE(f.avg_rating, 0)
          AS avg_rating,

        COALESCE(f.total_feedback, 0)
          AS total_feedback,

        /* budget analytics */
        COALESCE(b.total_spent, 0)
          AS total_spent,

        COALESCE(b.total_planned, 0)
          AS total_planned

      FROM events e

      /* attendee analytics */
      LEFT JOIN (

        SELECT

          event_id,

          COUNT(*) AS total_registered,

          SUM(
            CASE
              WHEN checked_in = 1 THEN 1
              ELSE 0
            END
          ) AS total_checked_in

        FROM attendees

        GROUP BY event_id

      ) a ON a.event_id = e.id


      /* feedback analytics */
      LEFT JOIN (

        SELECT

          event_id,

          ROUND(AVG(rating), 1)
            AS avg_rating,

          COUNT(*) AS total_feedback

        FROM feedbacks

        GROUP BY event_id

      ) f ON f.event_id = e.id


      /* budget analytics */
      LEFT JOIN (

        SELECT

          event_id,

          SUM(actual_amount)
            AS total_spent,

          SUM(planned_amount)
            AS total_planned

        FROM budgets

        GROUP BY event_id

      ) b ON b.event_id = e.id


      WHERE e.id = ?

    `, [id]);


    /*
    |--------------------------------------------------------------------------
    | EVENT NOT FOUND
    |--------------------------------------------------------------------------
    */

    if (!rows.length) {

      return res.status(404).json({

        success: false,

        message: 'Event not found'

      });

    }


    const event = rows[0];


    /*
    |--------------------------------------------------------------------------
    | CALCULATE METRICS
    |--------------------------------------------------------------------------
    */

    const registered =
      parseInt(event.total_registered) || 0;

    const checkedIn =
      parseInt(event.total_checked_in) || 0;

    const plannedBudget =
      parseFloat(event.planned_budget) || 0;

    const totalSpent =
      parseFloat(event.total_spent) || 0;

    const averageRating =
      parseFloat(event.avg_rating) || 0;


    const attendanceRate =
      registered > 0
        ? Math.round((checkedIn / registered) * 100)
        : 0;


    const budgetUtilization =
      plannedBudget > 0
        ? Math.round((totalSpent / plannedBudget) * 100)
        : 0;


    const feedbackScore =
      (averageRating / 5) * 100;


    let budgetScore = 0;

    if (budgetUtilization <= 100) {

      budgetScore = budgetUtilization;

    } else {

      budgetScore =
        Math.max(0, 200 - budgetUtilization);

    }


    const performanceScore = Math.round(

      (attendanceRate * 0.4) +

      (budgetScore * 0.3) +

      (feedbackScore * 0.3)

    );


    /*
    |--------------------------------------------------------------------------
    | FINAL RESPONSE
    |--------------------------------------------------------------------------
    */

    res.status(200).json({

      success: true,

      event: {

        ...event,

        total_registered: registered,

        total_checked_in: checkedIn,

        attendance_rate: attendanceRate,

        budget_utilization: budgetUtilization,

        performance_score: performanceScore,

        is_over_budget:
          totalSpent > plannedBudget,

        avg_rating: averageRating

      }

    });

  }

  catch (error) {

    console.log(
      'Single event analytics error:',
      error.message
    );

    res.status(500).json({

      success: false,

      message: 'Server error'

    });

  }

};


/*
|--------------------------------------------------------------------------
| EXPORT CONTROLLER FUNCTIONS
|--------------------------------------------------------------------------
*/

module.exports = {

  getDashboardAnalytics,

  getEventAnalytics

};