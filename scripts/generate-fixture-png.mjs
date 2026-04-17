import { writeFileSync } from 'node:fs';

// Generate a real 64x64 PNG from scratch using pure JS
// PNG format: signature + IHDR + IDAT + IEND

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32BE(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type, data) {
  const typeBytes = [...type].map(c => c.charCodeAt(0));
  const crc = crc32([...typeBytes, ...data]);
  return [...uint32BE(data.length), ...typeBytes, ...data, ...uint32BE(crc)];
}

// IHDR: 64x64 RGB
const width = 64, height = 64;
const ihdr = [...uint32BE(width), ...uint32BE(height), 8, 2, 0, 0, 0]; // bit depth 8, color type 2 (RGB), no interlace

// Build raw image data: simple checkerboard pattern
// Each row: filter byte (0 = None) + RGB pixels
function adler32(data) {
  let s1 = 1, s2 = 0;
  for (const b of data) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  return (s2 << 16) | s1;
}

// Build uncompressed raw data (filter + pixels per row)
const rawRows = [];
for (let y = 0; y < height; y++) {
  rawRows.push(0); // filter = None
  for (let x = 0; x < width; x++) {
    const tile = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    rawRows.push(tile === 0 ? 200 : 50); // R
    rawRows.push(tile === 0 ? 200 : 50); // G
    rawRows.push(tile === 0 ? 200 : 50); // B
  }
}
const raw = new Uint8Array(rawRows);

// zlib non-compressed deflate: CMF=0x78, FLG=0x01, then stored blocks
// Each stored block: BFINAL, BTYPE=00, LEN, NLEN, data
function zlibDeflateStored(data) {
  const out = [0x78, 0x01]; // zlib header: deflate, no compression
  const blockSize = 65535;
  const blocks = Math.ceil(data.length / blockSize);
  for (let i = 0; i < blocks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    const block = data.slice(start, end);
    const len = block.length;
    const nlen = (~len) & 0xffff;
    const bfinal = i === blocks - 1 ? 1 : 0;
    out.push(bfinal); // BFINAL | BTYPE=00
    out.push(len & 0xff, (len >> 8) & 0xff);
    out.push(nlen & 0xff, (nlen >> 8) & 0xff);
    out.push(...block);
  }
  const a = adler32(data);
  out.push((a >>> 24) & 0xff, (a >>> 16) & 0xff, (a >>> 8) & 0xff, a & 0xff);
  return out;
}

const compressed = zlibDeflateStored(Array.from(raw));

const png = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  ...chunk('IHDR', ihdr),
  ...chunk('IDAT', compressed),
  ...chunk('IEND', []),
];

writeFileSync('tests/fixtures/checkerboard-small.png', Buffer.from(png));
console.log(`Wrote tests/fixtures/checkerboard-small.png (${png.length} bytes)`);
