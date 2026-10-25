/**
 * Pure image helpers for the plate scanner (no DOM, testable in node).
 * All functions take an 8-bit grayscale array (row-major) plus width/height.
 */

/**
 * Find the data-plate region: the largest cluster of bright cells that contain
 * text-like edge density. Works orientation-independently, so it runs before the
 * rotation probe. Returns {x, y, w, h} in the input's pixel units, or null when
 * nothing convincing is found (caller then uses the whole photo).
 */
export function findLabelBox(gray, w, h, cell = 8) {
  const W = Math.floor(w / cell), H = Math.floor(h / cell);
  if (W < 4 || H < 4) return null;
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let acc = 0, med = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= gray.length / 2) { med = v; break; } }
  const bright = Math.max(med, 110);
  const texty = new Uint8Array(W * H);
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    let edges = 0, nBright = 0;
    for (let y = cy * cell; y < cy * cell + cell; y++) for (let x = cx * cell; x < cx * cell + cell; x++) {
      const i = y * w + x, v = gray[i];
      const gx = x > 0 ? Math.abs(v - gray[i - 1]) : 0, gy = y > 0 ? Math.abs(v - gray[i - w]) : 0;
      if (Math.max(gx, gy) > 40) edges++;
      if (v > bright) nBright++;
    }
    const e = edges / (cell * cell);
    texty[cy * W + cx] = e > 0.12 && e < 0.6 && nBright >= cell * cell * 0.1 ? 1 : 0;
  }
  // Close small gaps (3x3 dilate then erode) so lines of text join into one blob.
  const morph = (src, dilate) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let any = 0, all = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        const v = yy >= 0 && yy < H && xx >= 0 && xx < W ? src[yy * W + xx] : 0;
        any |= v; all &= v;
      }
      out[y * W + x] = dilate ? any : all;
    }
    return out;
  };
  let m = morph(texty, true);
  m = morph(m, false);
  // Largest connected component, scored by how many texty cells it contains.
  const lab = new Int32Array(W * H).fill(-1);
  let best = null;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || lab[s] >= 0) continue;
    const stack = [s]; lab[s] = s;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (stack.length) {
      const p = stack.pop(), px = p % W, py = (p / W) | 0;
      n += texty[p];
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (m[q] && lab[q] < 0) { lab[q] = s; stack.push(q); }
      }
    }
    if (!best || n > best.n) best = { n, x0, y0, x1, y1 };
  }
  if (!best || best.n < 12) return null;
  const pad = 2;
  const x = Math.max(0, best.x0 - pad) * cell, y = Math.max(0, best.y0 - pad) * cell;
  const bw = Math.min(w, (best.x1 + 1 + pad) * cell) - x, bh = Math.min(h, (best.y1 + 1 + pad) * cell) - y;
  const frac = (bw * bh) / (w * h);
  if (frac < 0.03 || frac > 0.9) return null;
  return { x, y, w: bw, h: bh, frac: Math.round(frac * 100) / 100 };
}
