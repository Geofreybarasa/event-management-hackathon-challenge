const express = require('express');
const router = express.Router(); // ✅ capital R

// import middleware
const { validateBudget } = require('../middleware/validate');
const { checkEventExists, checkBudgetExists } = require('../middleware/checkExists');

// import controllers
const { 
  addBudgetItem, 
  getEventBudget, 
  updateActualAmount, 
  deleteBudgetItem 
} = require('../controllers/budgetController');

// POST - validate budget, check event exists, then add item
router.post('/', validateBudget, checkEventExists, addBudgetItem);

// GET - check event exists, then get all budget items for that event
router.get('/event/:eventId', checkEventExists, getEventBudget);

// PATCH - check budget item exists, then update actual amount
router.patch('/:id', checkBudgetExists, updateActualAmount);

// DELETE - check budget item exists, then delete
router.delete('/:id', checkBudgetExists, deleteBudgetItem);

module.exports = router;