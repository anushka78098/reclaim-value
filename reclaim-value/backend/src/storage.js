const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'uploads');
async function saveImage(file) {
  if (process.env.CLOUDINARY_URL) {
    const cloudinary = require('cloudinary').v2;
    const r = await new Promise((ok, no) => cloudinary.uploader.upload_stream({ folder: 'reclaim' }, (e, x) => (e ? no(e) : ok(x))).end(file.buffer));
    return r.secure_url;
  }
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${file.originalname.replace(/[^\w.]/g, '_')}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return `/uploads/${name}`;
}
module.exports = { saveImage };
