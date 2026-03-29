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
app.use(express.static(path.join(__dirname)));

// ── Active Routes ──
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api',       require('./routes/init'));

// ── Inactive Routes (We will turn these on later) ──
// app.use('/api/expenses',  require('./routes/expenses'));
// app.use('/api/approvals', require('./routes/approvals'));
// app.use('/api/rules',     require('./routes/rules'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(process.env.PORT || 4000, () => console.log('Server running on port', process.env.PORT || 4000));