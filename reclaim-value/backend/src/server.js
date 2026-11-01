const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
require('dotenv').config(); const mongoose = require('mongoose'); const app = require('./app');
const listen = require('./listen');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing – copy .env.example to .env');
const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI).then(() => listen(app, port))
  .catch((e) => { console.error(e); process.exit(1); });
