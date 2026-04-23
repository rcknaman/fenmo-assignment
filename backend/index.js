const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';

// Rate Limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

app.use(limiter);
app.use(cors());
app.use(bodyParser.json());

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Authentication required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// POST /register
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Username already exists' });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /login
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /me
app.get('/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// GET /expenses/summary
app.get('/expenses/summary', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? GROUP BY category',
            [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /expenses
app.get('/expenses', authenticateToken, async (req, res) => {
    try {
        const { category, sort, page = 1, limit = 5 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM expenses WHERE user_id = ?';
        let countQuery = 'SELECT COUNT(*) as total FROM expenses WHERE user_id = ?';
        let params = [req.user.id];
        let countParams = [req.user.id];

        if (category) {
            query += ' AND category = ?';
            countQuery += ' AND category = ?';
            params.push(category);
            countParams.push(category);
        }

        if (sort === 'date_desc') query += ' ORDER BY date DESC, created_at DESC';
        else if (sort === 'date_asc') query += ' ORDER BY date ASC, created_at ASC';
        else query += ' ORDER BY created_at DESC';

        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            data: rows,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /expenses
app.post('/expenses', authenticateToken, async (req, res) => {
    try {
        const { id, amount, category, description, date } = req.body;

        if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be positive' });
        if (!category || !date || !description) return res.status(400).json({ error: 'All fields are required' });

        if (id) {
            const [existing] = await db.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, req.user.id]);
            if (existing.length > 0) return res.status(200).json(existing[0]);
        }

        const expenseId = id || require('crypto').randomUUID();

        await db.query(
            'INSERT INTO expenses (id, user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?)',
            [expenseId, req.user.id, amount, category, description, date]
        );

        const [newExpense] = await db.query('SELECT * FROM expenses WHERE id = ?', [expenseId]);
        res.status(201).json(newExpense[0]);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const [existing] = await db.query('SELECT * FROM expenses WHERE id = ?', [req.body.id]);
            return res.status(200).json(existing[0]);
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
