const r = require('express').Router(); const bcrypt = require('bcryptjs'); const jwt = require('jsonwebtoken');
const { User } = require('../models'); const { auth, wrap } = require('../middleware');
const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, rating: u.rating });

r.post('/register', wrap(async (req, res) => {
  const { name, email, password, role, lng, lat } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'name, email and password (6+ chars) required' });
  if (!['Company', 'Buyer', 'Recycler'].includes(role || 'Buyer')) return res.status(400).json({ error: 'Invalid role' }); // Admin cannot self-register
  if (await User.findOne({ email: String(email).toLowerCase() })) return res.status(409).json({ error: 'Email already registered' });
  const u = await User.create({ name, email, role: role || 'Buyer', passwordHash: await bcrypt.hash(password, 10),
    ...(lng && lat ? { location: { type: 'Point', coordinates: [+lng, +lat] } } : {}) });
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
r.post('/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign(u), user: pub(u) });
}));
r.get('/me', auth, (req, res) => res.json({ user: pub(req.user) }));
module.exports = r;
