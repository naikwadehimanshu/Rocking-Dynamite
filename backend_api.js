// ============================================================
// Reimbursement Management System — Express Backend
// Stack: Node.js + Express + MySQL2 + JWT + Multer + Tesseract.js
// ============================================================
// File structure:
//   server.js          ← entry point (this file)
//   config/db.js       ← MySQL pool
//   middlewares/auth.js← JWT auth + role guard
//   routes/
//     auth.js          ← POST /api/auth/signup, /login, /logout
//     users.js         ← CRUD /api/users
//     expenses.js      ← CRUD /api/expenses + file upload
//     approvals.js     ← GET/PUT /api/approvals
//     rules.js         ← CRUD /api/rules
//     ocr.js           ← POST /api/ocr/scan
//     currencies.js    ← GET /api/currencies, /convert
// ============================================================

// ── server.js ───────────────────────────────────────────────
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/expenses',  require('./routes/expenses'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/rules',     require('./routes/rules'));
app.use('/api/ocr',       require('./routes/ocr'));
app.use('/api/currencies',require('./routes/currencies'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(process.env.PORT || 4000, () => console.log('Server running on port', process.env.PORT || 4000));


// ── config/db.js ────────────────────────────────────────────
/*
const mysql = require('mysql2/promise');
const pool  = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'reimbursement_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           'Z',
});
module.exports = pool;
*/


// ── middlewares/auth.js ──────────────────────────────────────
/*
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'changeme';

exports.authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

exports.requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: 'Forbidden' });
  next();
};
*/


// ── routes/auth.js ──────────────────────────────────────────

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // Adjust path based on your actual file structure

const SECRET = process.env.JWT_SECRET || 'changeme';

router.post('/signup', async (req, res) => {
  const { name, company, email, country, password } = req.body;

  // Basic validation
  if (!name || !company || !email || !password || !country) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check if user email already exists
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Email is already in use.' });
    }

    // 2. Determine basic currency info (You can expand this with a real map/API later)
    // Defaulting to USD/$ if logic isn't provided by frontend
    let currency = 'USD';
    let currencySymbol = '$';
    if (country.toLowerCase().includes('india')) { currency = 'INR'; currencySymbol = '₹'; }
    else if (country.toLowerCase().includes('kingdom')) { currency = 'GBP'; currencySymbol = '£'; }
    else if (country.toLowerCase().includes('euro')) { currency = 'EUR'; currencySymbol = '€'; }
    else if (country.toLowerCase().includes('japan')) { currency = 'JPY'; currencySymbol = '¥'; }

    // 3. Create the Company
    const [companyResult] = await connection.execute(
      'INSERT INTO companies (name, country, currency, currency_symbol) VALUES (?, ?, ?, ?)',
      [company, country, currency, currencySymbol]
    );
    const newCompanyId = companyResult.insertId;

    // 4. Hash the password & Create the Admin User
    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await connection.execute(
      'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [newCompanyId, name, email, hashedPassword, 'admin']
    );
    const newUserId = userResult.insertId;

    // 5. Seed default expense categories for the new company
    const defaultCategories = ['Travel', 'Meals & Entertainment', 'Accommodation', 'Office Supplies', 'Software', 'Miscellaneous'];
    for (const cat of defaultCategories) {
      await connection.execute(
        'INSERT INTO expense_categories (company_id, name) VALUES (?, ?)',
        [newCompanyId, cat]
      );
    }

    await connection.commit();

    // 6. Generate JWT and respond
    const userPayload = {
      id: newUserId,
      company_id: newCompanyId,
      name: name,
      email: email,
      role: 'admin'
    };

    const token = jwt.sign(userPayload, SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'Workspace created successfully',
      token,
      user: userPayload
    });

  } catch (error) {
    await connection.rollback();
    console.error('Signup Error:', error);
    res.status(500).json({ error: 'Failed to create workspace. Please try again.' });
  } finally {
    connection.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // 1. Find user by email
    const [users] = await pool.execute(
      'SELECT id, company_id, name, email, password, role FROM users WHERE email = ?',
      [email]
    );

    // If no user is found with that email
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // 2. Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 3. Create the payload and sign the JWT
    const userPayload = {
      id: user.id,
      company_id: user.company_id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(userPayload, SECRET, { expiresIn: '24h' });

    // 4. Return the token and user data to the frontend
    res.json({
      message: 'Login successful',
      token,
      user: userPayload
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'An error occurred during login. Please try again.' });
  }
});


// ── routes/expenses.js ──────────────────────────────────────
/*
// GET  /api/expenses          - list (filtered by role)
// POST /api/expenses          - submit new expense (employee)
// GET  /api/expenses/:id      - single expense detail
// PUT  /api/expenses/:id      - edit draft
// DELETE /api/expenses/:id    - cancel draft

router.post('/', authenticate, requireRole('employee','admin'), upload.single('receipt'), async (req, res) => {
  // 1. Validate fields
  // 2. Convert amount to company currency via exchangerate-api (cache 1 hour in Redis/memory)
  // 3. INSERT expense (status='draft')
  // 4. Determine applicable approval rule (by category or fallback default)
  // 5. Build first approval_request row (step_order=1)
  //    - If is_manager_approver → first request goes to manager
  //    - Else → first step from rule
  // 6. UPDATE expense status='pending'
  // 7. INSERT audit_log
  // 8. Return expense with approval timeline
});

router.get('/', authenticate, async (req, res) => {
  // Admin:    all company expenses
  // Manager:  expenses in their approval queue + team expenses
  // Employee: own expenses only
  // Support: ?status=pending&category=1&page=1&limit=20
});
*/


// ── routes/approvals.js ──────────────────────────────────────
/*
// GET /api/approvals          - approver's pending queue
// PUT /api/approvals/:id      - approve or reject

router.put('/:id', authenticate, requireRole('manager','admin'), async (req, res) => {
  // 1. Load approval_request, verify approver_id === req.user.id & status='pending'
  // 2. UPDATE approval_requests SET status, comments, responded_at
  // 3. Evaluate rule:
  //    - sequential: if approved → generate next step request; if last → expense approved
  //    - percentage: count total approvals; if >= threshold → expense approved
  //    - specific_approver: if this approver → expense approved regardless
  //    - hybrid: check either condition
  //    - if rejected → expense rejected immediately (for sequential) or after quorum lost
  // 4. UPDATE expenses.status accordingly
  // 5. INSERT audit_log
});
*/


// ── routes/rules.js ──────────────────────────────────────────
/*
// CRUD approval_rules + approval_rule_steps (admin only)

router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { name, category_id, is_manager_approver, rule_type,
          percentage_threshold, specific_approver_id, steps } = req.body;
  // Validate steps array: [{ approver_id, step_order, is_required }]
  // INSERT rule, then INSERT steps
});
*/


// ── routes/ocr.js ───────────────────────────────────────────
/*
// POST /api/ocr/scan  (multipart receipt image)
// Uses Tesseract.js (local, offline-capable) to extract text
// Then calls Claude API to parse structured fields from OCR text

router.post('/scan', authenticate, upload.single('receipt'), async (req, res) => {
  const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng');
  // Parse amount, date, merchant, description from raw text using regex + NLP heuristics
  // Optional: pass to AI model for higher accuracy
  res.json({ raw_text: text, parsed: { amount, date, merchant, description } });
});
*/


// ── routes/currencies.js ────────────────────────────────────
/*
// GET /api/currencies         - list all countries + currencies (cached from restcountries)
// GET /api/currencies/convert - ?from=USD&to=INR&amount=100

const CACHE = new Map();  // In-memory cache; use Redis in production

router.get('/convert', authenticate, async (req, res) => {
  const { from, to, amount } = req.query;
  const cacheKey = `rate_${from}`;
  let rates = CACHE.get(cacheKey);
  if (!rates || Date.now() - rates._ts > 3600_000) {  // 1 hr TTL
    const r = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
    rates = await r.json();
    rates._ts = Date.now();
    CACHE.set(cacheKey, rates);
  }
  const rate = rates.rates[to];
  res.json({ from, to, rate, converted: (parseFloat(amount) * rate).toFixed(2) });
});
*/


// ── .env (template) ─────────────────────────────────────────
/*
PORT=4000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=secret
DB_NAME=reimbursement_db
JWT_SECRET=your-256-bit-secret
CLIENT_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
*/


// ── package.json (key deps) ─────────────────────────────────
/*
{
  "dependencies": {
    "express": "^4.18",
    "mysql2": "^3.6",
    "bcryptjs": "^2.4",
    "jsonwebtoken": "^9.0",
    "multer": "^1.4",
    "tesseract.js": "^5.0",
    "node-fetch": "^3.3",
    "helmet": "^7.0",
    "cors": "^2.8",
    "morgan": "^1.10",
    "dotenv": "^16.0"
  },
  "devDependencies": {
    "nodemon": "^3.0"
  }
}
*/

STATE.user = { id:99, name:payload.name, email:payload.email, role:'admin', company_id:99 };
STATE.token = 'demo_token';
STATE.isDemo = false;   // ← add this
// Reset all data to empty for new user
DEMO_EXPENSES = [];
DEMO_APPROVALS = [];
// DEMO_RULES stays empty too — admin hasn't created any yet
// In handleSignup(), after creating STATE.user:
DEMO_USERS.length = 0;   // clear array in-place
DEMO_USERS.push(STATE.user);  // only the new admin exists
// In handleSignup():
DEMO_RULES.length = 0;

function company() {
  // Replace hardcoded values:
  const companyName = STATE.companyName || STATE.user.name + "'s Company";
  const country = STATE.signupCountry || '—';
  const currency = STATE.companyCurrency || '—';
  // use these variables in the render() HTML
}
// In handleSignup():
STATE.companyName = payload.company;
STATE.signupCountry = payload.country;
// currency from the selected option's data-currency attribute:
const sel = document.getElementById('signupCountry');
const opt = sel.options[sel.selectedIndex];
STATE.companyCurrency = opt.dataset.currency || 'USD';
STATE.companySymbol   = opt.dataset.symbol   || '$';
document.getElementById('expCurrency').value = STATE.companyCurrency || 'USD';