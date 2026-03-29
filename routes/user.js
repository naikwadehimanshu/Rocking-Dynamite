const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/db');

// Set up the email transporter (Update with your real SMTP credentials)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
});

router.post('/', async (req, res) => {
  // In a real app, you'd get the company_id from the authenticated admin's token (req.user)
  const companyId = 1; 
  const { name, email, role, manager_id } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  try {
    // 1. Generate a random 10-character password (e.g., 'a1b2c3d4e5')
    const tempPassword = crypto.randomBytes(5).toString('hex');
    
    // 2. Hash the password securely for the database
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 3. Save the new user to MySQL
    const [result] = await pool.execute(
      'INSERT INTO users (company_id, name, email, password, role, manager_id) VALUES (?, ?, ?, ?, ?, ?)',
      [companyId, name, email, hashedPassword, role || 'employee', manager_id || null]
    );

    // 4. Send the welcome email
    const mailOptions = {
      from: '"ReimburseFlow Admin" <noreply@reimburseflow.com>',
      to: email,
      subject: 'Welcome to ReimburseFlow - Your Account Details',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>Welcome to the team, ${name}!</h2>
            <p>Your administrator has created a ReimburseFlow account for you.</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Login Email:</strong> ${email}</p>
                <p style="margin: 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; font-size: 16px;">${tempPassword}</span></p>
            </div>
            <p>Please log in and update your password immediately.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: 'User created and email sent successfully.' });

  } catch (error) {
    console.error('Error in user creation:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }
    res.status(500).json({ error: 'Failed to create user or send email.' });
  }
});

module.exports = router;