const express = require('express');
const router  = express.Router();

router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Server is working!' });
});

module.exports = router;