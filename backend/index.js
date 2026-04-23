const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Rate Limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});

app.use(limiter);
app.use(cors());
app.use(bodyParser.json());

// GET /expenses/summary
app.get('/expenses/summary', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT category, SUM(amount) as total FROM expenses GROUP BY category'
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /expenses
app.get('/expenses', async (req, res) => {
    try {
        const { category, sort, page = 1, limit = 5 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM expenses';
        let countQuery = 'SELECT COUNT(*) as total FROM expenses';
        let params = [];
        let countParams = [];

        if (category) {
            query += ' WHERE category = ?';
            countQuery += ' WHERE category = ?';
            params.push(category);
            countParams.push(category);
        }

        if (sort === 'date_desc') {
            query += ' ORDER BY date DESC, created_at DESC';
        } else if (sort === 'date_asc') {
            query += ' ORDER BY date ASC, created_at ASC';
        } else {
            query += ' ORDER BY created_at DESC';
        }

        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            data: rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /expenses
app.post('/expenses', async (req, res) => {
    try {
        const { id, amount, category, description, date } = req.body;

        // Basic Validation
        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Amount must be a positive number' });
        }
        if (!category) {
            return res.status(400).json({ error: 'Category is required' });
        }
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }
        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }

        // Idempotency check
        if (id) {
            const [existing] = await db.query('SELECT * FROM expenses WHERE id = ?', [id]);
            if (existing.length > 0) {
                return res.status(200).json(existing[0]);
            }
        }

        const expenseId = id || require('crypto').randomUUID();

        await db.query(
            'INSERT INTO expenses (id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
            [expenseId, amount, category, description, date]
        );

        const [newExpense] = await db.query('SELECT * FROM expenses WHERE id = ?', [expenseId]);
        res.status(201).json(newExpense[0]);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const [existing] = await db.query('SELECT * FROM expenses WHERE id = ?', [req.body.id]);
            return res.status(200).json(existing[0]);
        }
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
