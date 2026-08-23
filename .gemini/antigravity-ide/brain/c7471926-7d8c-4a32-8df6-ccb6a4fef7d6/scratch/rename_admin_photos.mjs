import fs from 'fs';
import path from 'path';

const dir = 'c:/Users/USER/Desktop/Irrigation Pro/admin/public/photos';
const files = fs.readdirSync(dir);

files.forEach((file) => {
  const oldPath = path.join(dir, file);
  if (file.length > 50) {
    const ext = path.extname(file);
    const cleanName = file.substring(0, 35).replace(/[^a-zA-Z0-9]/g, '_') + ext;
    const newPath = path.join(dir, cleanName);
    fs.renameSync(oldPath, newPath);
    console.log(`Renamed: ${file} -> ${cleanName}`);
  }
});
