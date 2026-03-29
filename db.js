const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'reimbursement_db',
  waitForConnections: true,
  connectionLimit: 10,
});

// Test connection when server starts
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected!');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL FAILED:', err.message);
  });

module.exports = pool;