// scripts/generate-golden.mjs
// One-shot script: produces tests/fixtures/checkerboard-warp-golden.json.
// Re-run only if the warp algorithm changes intentionally — re-running silently
// hides regressions otherwise.
import { writeFileSync } from 'node:fs';
import { solveTPS, applyTPS } from '../src/warp/tps-solver.ts';
import { renderWarp } from '../src/warp/warp-renderer.ts';

// Polyfill ImageData for the Bun/Node environment (no DOM here).
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(dataOrWidth, widthOrHeight, height) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? (dataOrWidth.length / 4 / widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
      }
      this.colorSpace = 'srgb';
    }
  };
}

function makeCheckerboard(w, h, cell) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0;
      const v = on ? 255 : 0;
      const idx = (y * w + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { data, width: w, height: h, colorSpace: 'srgb' };
}

const src = makeCheckerboard(32, 32, 8);
const pts = [0, 16, 31];
const pairs = [];
for (const sy of pts) for (const sx of pts) {
  const cx = 16, cy = 16;
  const tx = sx + (cx - sx) * 0.3;
  const ty = sy + (cy - sy) * 0.3;
  pairs.push({ label: `${sx}-${sy}`, schematic: { x: sx, y: sy }, geographic: { x: tx, y: ty } });
}
const coefs = solveTPS(pairs);
if (!coefs) throw new Error('TPS solve failed in fixture generation');
const tpsEval = (x, y) => applyTPS(coefs, x, y);
const out = renderWarp(src, 32, 32, tpsEval, 1, 32, 32);

writeFileSync(
  'tests/fixtures/checkerboard-warp-golden.json',
  JSON.stringify({ data: Array.from(out.data) })
);
console.log(`Wrote fixture: ${out.data.length} bytes`);
