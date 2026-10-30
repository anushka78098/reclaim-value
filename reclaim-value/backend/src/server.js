require('dotenv').config(); const mongoose = require('mongoose'); const app = require('./app');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing – copy .env.example to .env');
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(process.env.PORT || 5000, () => console.log('API on :' + (process.env.PORT || 5000))))
  .catch((e) => { console.error(e); process.exit(1); });
