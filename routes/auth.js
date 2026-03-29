const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); 

const SECRET = process.env.JWT_SECRET || 'changeme';

router.post('/signup', async (req, res) => {
  const { name, company, email, country, password } = req.body;
  if (!name || !company || !email || !password || !country) return res.status(400).json({ error: 'All fields are required.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Email is already in use.' });
    }

    let currency = 'USD'; let currencySymbol = '$';
    if (country.toLowerCase().includes('india')) { currency = 'INR'; currencySymbol = '₹'; }
    else if (country.toLowerCase().includes('kingdom')) { currency = 'GBP'; currencySymbol = '£'; }
    else if (country.toLowerCase().includes('euro')) { currency = 'EUR'; currencySymbol = '€'; }

    const [companyResult] = await connection.execute(
      'INSERT INTO companies (name, country, currency, currency_symbol) VALUES (?, ?, ?, ?)',
      [company, country, currency, currencySymbol]
    );
    const newCompanyId = companyResult.insertId;

    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await connection.execute(
      'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [newCompanyId, name, email, hashedPassword, 'admin']
    );
    
    await connection.commit();

    const userPayload = { id: userResult.insertId, company_id: newCompanyId, name, email, role: 'admin' };
    const token = jwt.sign(userPayload, SECRET, { expiresIn: '24h' });

    res.status(201).json({ message: 'Workspace created', token, user: userPayload });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: 'Failed to create workspace.' });
  } finally {
    connection.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const userPayload = { id: user.id, company_id: user.company_id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(userPayload, SECRET, { expiresIn: '24h' });

    res.json({ message: 'Login successful', token, user: userPayload });
  } catch (error) {
    res.status(500).json({ error: 'Login error.' });
  }
});

module.exports = router;