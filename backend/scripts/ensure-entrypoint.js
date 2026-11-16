const fs = require('fs');
const path = require('path');

const rootMain = path.resolve(__dirname, '../dist/main.js');
const srcMain = path.resolve(__dirname, '../dist/src/main.js');

if (fs.existsSync(srcMain) && !fs.existsSync(rootMain)) {
  fs.writeFileSync(rootMain, "require('./src/main.js');\n");
  console.log('[ensure-entrypoint] Created forwarding dist/main.js -> dist/src/main.js');
} else if (fs.existsSync(rootMain) && !fs.existsSync(srcMain)) {
  fs.mkdirSync(path.dirname(srcMain), { recursive: true });
  fs.writeFileSync(srcMain, "require('../main.js');\n");
  console.log('[ensure-entrypoint] Created forwarding dist/src/main.js -> dist/main.js');
}
