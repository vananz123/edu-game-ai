// Renders the LAN QR encoder from src/renderer/features/lan.ts into PNG files so an
// independent decoder (OpenCV via Python) can verify it. Test tooling only.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = path.join(__dirname, '..', '..', 'src', 'renderer', 'features', 'lan.ts');
const source = fs.readFileSync(SOURCE, 'utf8');

// Take from the QR section to the end of lanQrReedSolomon; those functions are pure.
const start = source.indexOf('const LAN_QR = {');
const end = source.indexOf('/** Wire the LAN bridge once at boot');
if (start < 0 || end < 0) throw new Error('could not locate the QR section in lan.ts');
const qrSource = source.slice(start, end);

const sandbox = { TextEncoder, console };
vm.createContext(sandbox);
vm.runInContext(qrSource, sandbox, { filename: 'lan.ts#qr' });

const payloads = process.argv.slice(2);
if (!payloads.length) throw new Error('usage: node lan-qr-verify.js <payload> [payload...]');

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
payloads.forEach((payload, index) => {
  const matrix = sandbox.lanQrMatrix(payload);
  if (!matrix) { console.log(`FAIL ${payload}: encoder returned null`); process.exitCode = 1; return; }
  // 8px modules + 4-module quiet zone, written as PGM (no image library needed).
  const scale = 8;
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  const header = Buffer.from(`P5\n${size * scale} ${size * scale}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(size * scale * size * scale, 255);
  matrix.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      // Cells are `{ value, reserved }` objects from lanQrNewMatrix.
      if (!cell || !cell.value) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const y = (rowIndex + quiet) * scale + dy;
          const x = (colIndex + quiet) * scale + dx;
          pixels[y * size * scale + x] = 0;
        }
      }
    });
  });
  const file = path.join(outDir, `qr-${index}.pgm`);
  fs.writeFileSync(file, Buffer.concat([header, pixels]));
  console.log(`${file}\t${payload}`);
});
