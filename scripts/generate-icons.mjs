import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('client/public/icons', { recursive: true });

for (const size of [192, 512]) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) * 4;
      png.data[idx] = 0xcd;     // R
      png.data[idx + 1] = 0x29; // G
      png.data[idx + 2] = 0x27; // B
      png.data[idx + 3] = 0xff; // A
    }
  }
  const buffer = PNG.sync.write(png);
  writeFileSync(`client/public/icons/icon-${size}.png`, buffer);
  console.log(`Created icon-${size}.png (${buffer.length} bytes)`);
}
