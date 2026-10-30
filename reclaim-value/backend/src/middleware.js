const jwt = require('jsonwebtoken');
const { User } = require('./models');

const auth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    const { id } = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(id).select('-passwordHash');
    if (!user || user.suspended) return res.status(401).json({ error: 'Account unavailable' });
    req.user = user; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: `Requires role: ${roles.join('/')}` });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
module.exports = { auth, requireRole, wrap };
