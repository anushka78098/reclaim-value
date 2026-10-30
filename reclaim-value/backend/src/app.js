const express = require('express'); const cors = require('cors'); const path = require('path');
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' })); app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.get('/api/health', (_q, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth')); app.use('/api/materials', require('./routes/materials'));
app.use('/api/listings', require('./routes/listings')); app.use('/api/requests', require('./routes/requests'));
app.use('/api/analytics', require('./routes/analytics')); app.use('/api/admin', require('./routes/admin')); app.use('/api/ai', require('./routes/ai'));
app.use((err, _q, res, _n) => { // central error handler
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate value' });
  if (err.status !== 404 && !err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
});
module.exports = app;
