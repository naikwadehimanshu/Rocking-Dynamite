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
/*
router.post('/signup', async (req, res) => {
  // 1. Validate: name, email, password, country
  // 2. Fetch currency for country from restcountries API (or local JSON fallback)
  // 3. db.beginTransaction()
  // 4. INSERT companies (name derived from email domain, country, currency)
  // 5. INSERT users (role='admin', company_id)
  // 6. Hash password with bcrypt
  // 7. Seed default expense_categories for company
  // 8. db.commit()
  // 9. Sign JWT { id, company_id, role } → return token + user
});

router.post('/login', async (req, res) => {
  // 1. Find user by email
  // 2. bcrypt.compare password
  // 3. Sign JWT → return token + user
});
*/


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
