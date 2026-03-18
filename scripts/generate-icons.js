#!/usr/bin/env node

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'apps', 'chrome-extension', 'icons');

const COLORS = {
  green:  { r: 34, g: 197, b: 94 },
  gray:   { r: 156, g: 163, b: 175 },
  yellow: { r: 245, g: 158, b: 11 },
  red:    { r: 220, g: 38, b: 38 },
};

const SIZES = [16, 48, 128];

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      const offset = y * (1 + width * 4) + 1 + x * 4;
      rawData[offset] = pixels[pi];
      rawData[offset + 1] = pixels[pi + 1];
      rawData[offset + 2] = pixels[pi + 2];
      rawData[offset + 3] = pixels[pi + 3];
    }
  }

  const compressed = deflateSync(rawData);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawShieldIcon(size, color) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;

      const topWidth = 0.8;
      const halfWidth = topWidth * (1 - ny * 0.5);
      const inShield = ny >= -0.85 && ny <= 0.85 && Math.abs(nx) <= halfWidth;

      if (inShield) {
        const edgeDist = Math.min(halfWidth - Math.abs(nx), 0.85 - Math.abs(ny)) * size;
        const alpha = Math.min(1, edgeDist * 2);
        pixels[idx] = color.r;
        pixels[idx + 1] = color.g;
        pixels[idx + 2] = color.b;
        pixels[idx + 3] = Math.round(alpha * 255);
      }
    }
  }
  return pixels;
}

for (const [colorName, color] of Object.entries(COLORS)) {
  for (const size of SIZES) {
    const pixels = drawShieldIcon(size, color);
    const png = createPNG(size, size, pixels);
    const filename = `icon-${colorName}-${size}.png`;
    writeFileSync(join(ICONS_DIR, filename), png);
    console.log(`Generated ${filename}`);
  }
}

console.log('Done!');
