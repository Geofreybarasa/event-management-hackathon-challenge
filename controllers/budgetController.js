const db = require('../config/db');

// POST - add budget item to event
const addBudgetItem = async (req, res) => {
  try {
    const { event_id, category, description, planned_amount } = req.body;

    const [result] = await db.query(
      'INSERT INTO budgets (event_id, category, description, planned_amount) VALUES (?, ?, ?, ?)',
      [event_id, category, description, planned_amount]
    );

    const [newItem] = await db.query(
      'SELECT * FROM budgets WHERE id = ?',
      [result.insertId]
    );

    // 201 = something was created
    res.status(201).json({
      message: '✅ Budget item added!',
      budget: newItem[0]
    });

  } catch (error) {
    console.log('Error adding budget item:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET - get all budget items for event
const getEventBudget = async (req, res) => {
  try {
    // correct way to get eventId from params
    const { eventId } = req.params;

    const [items] = await db.query(
      'SELECT * FROM budgets WHERE event_id = ?',
      [eventId]
    );

    const totalPlanned = items.reduce((sum, item) => sum + parseFloat(item.planned_amount), 0);
    const totalActual = items.reduce((sum, item) => sum + parseFloat(item.actual_amount), 0);

    res.status(200).json({
      event: req.event.name,
      totalPlanned,
      totalActual,
      difference: totalPlanned - totalActual,
      items
    });

  } catch (error) {
    console.log('Error fetching budget:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH - update actual amount spent
const updateActualAmount = async (req, res) => {
  try {
    const { actual_amount } = req.body;

    // ✅ prevent negative actual amount
    if (parseFloat(actual_amount) < 0) {
      return res.status(400).json({ 
        message: 'Actual amount cannot be negative' 
      });
    }

    await db.query(
      'UPDATE budgets SET actual_amount = ? WHERE id = ?',
      [actual_amount, req.budget.id]
    );

    const [updated] = await db.query(
      'SELECT * FROM budgets WHERE id = ?',
      [req.budget.id]
    );

    res.status(200).json({
      message: '✅ Actual amount updated!',
      budget: updated[0]
    });

  } catch (error) {
    console.log('Error updating budget:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE - remove budget item
const deleteBudgetItem = async (req, res) => {
  try {
    // DELETE not SELECT
    await db.query(
      'DELETE FROM budgets WHERE id = ?',
      [req.budget.id]
    );

    res.status(200).json({
      message: '✅ Budget item deleted!'
    });

  } catch (error) {
    console.log('Error deleting budget:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { addBudgetItem, getEventBudget, updateActualAmount, deleteBudgetItem };