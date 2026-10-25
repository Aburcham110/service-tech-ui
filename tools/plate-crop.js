/**
 * Manual 4-point perspective crop ("straighten") before OCR. Pointer events, so it works with
 * touch, mouse and pen. Resolves with a warped canvas, or null when the user taps Skip.
 * Test hook: globalThis.__plateCropCorners = [[x,y]x4] (fractions of the photo, TL,TR,BR,BL)
 * applies those corners immediately.
 */

/** 3x3 homography mapping the unit square corners (0,0),(1,0),(1,1),(0,1) to quad q. */
export function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

export function applyH(H, u, v) {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Warp quad (pixel coords in src, TL,TR,BR,BL) to an upright rectangle. Bilinear sampling. */
export function warpQuad(src, q, maxSide = 2400) {
  let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), Hh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(W, Hh));
  W = Math.max(8, Math.round(W * k)); Hh = Math.max(8, Math.round(Hh * k));
  const sw = src.width, sh = src.height;
  const sd = src.getContext("2d").getImageData(0, 0, sw, sh).data;
  const out = document.createElement("canvas");
  out.width = W; out.height = Hh;
  const ctx = out.getContext("2d"), img = ctx.createImageData(W, Hh), d = img.data;
  const M = squareToQuad(q);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      let [sx, sy] = applyH(M, (x + 0.5) / W, (y + 0.5) / Hh);
      sx = Math.min(sw - 1.001, Math.max(0, sx - 0.5)); sy = Math.min(sh - 1.001, Math.max(0, sy - 0.5));
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, o = (y * W + x) * 4;
      const i00 = (iy * sw + ix) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        d[o + c] = (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy;
      }
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function cropStep(container, photo, initial) {
  return new Promise((resolve) => {
    const hook = globalThis.__plateCropCorners;
    if (hook) { resolve(warpQuad(photo, hook.map(([x, y]) => [x * photo.width, y * photo.height]))); return; }
    const wrap = document.createElement("div");
    wrap.className = "plate-crop";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Straighten the plate");
    const h = document.createElement("p");
    h.className = "footer-note";
    h.textContent = "Drag the 4 corners onto the plate's corners to straighten it, or skip.";
    const stage = document.createElement("div");
    stage.className = "plate-crop-stage";
    stage.style.cssText = "position:relative;touch-action:none;user-select:none;max-width:100%";
    const view = document.createElement("canvas");
    const vk = Math.min(1, 900 / Math.max(photo.width, photo.height));
    view.width = Math.round(photo.width * vk); view.height = Math.round(photo.height * vk);
    view.getContext("2d").drawImage(photo, 0, 0, view.width, view.height);
    view.style.cssText = "display:block;width:100%;height:auto";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1 1"); svg.setAttribute("preserveAspectRatio", "none");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    const poly = document.createElementNS(svgNS, "polygon");
    poly.setAttribute("fill", "rgba(0,160,255,0.15)"); poly.setAttribute("stroke", "#09f");
    poly.setAttribute("stroke-width", "0.006"); poly.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(poly);
    const pts = (initial || [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]).map((p) => p.slice());
    const names = ["top-left", "top-right", "bottom-right", "bottom-left"];
    const handles = pts.map((p, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "plate-crop-handle";
      b.setAttribute("aria-label", "Move " + names[i] + " corner (arrow keys)");
      b.style.cssText = "position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #09f;background:rgba(255,255,255,.5);touch-action:none;padding:0";
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault(); b.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const r = stage.getBoundingClientRect();
          p[0] = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
          p[1] = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
          draw();
        };
        const up = () => { b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up); };
        b.addEventListener("pointermove", move); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
      });
      b.addEventListener("keydown", (e) => {
        const s = e.shiftKey ? 0.05 : 0.01, m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        if (!m) return; e.preventDefault();
        p[0] = Math.min(1, Math.max(0, p[0] + m[0])); p[1] = Math.min(1, Math.max(0, p[1] + m[1])); draw();
      });
      return b;
    });
    function draw() {
      poly.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
      handles.forEach((b, i) => { b.style.left = pts[i][0] * 100 + "%"; b.style.top = pts[i][1] * 100 + "%"; });
    }
    stage.append(view, svg, ...handles);
    draw();
    const actions = document.createElement("div");
    actions.className = "tool-actions";
    const use = document.createElement("button"); use.type = "button"; use.className = "btn btn-primary"; use.textContent = "Use crop";
    const skip = document.createElement("button"); skip.type = "button"; skip.className = "btn btn-secondary"; skip.textContent = "Skip";
    actions.append(use, skip);
    wrap.append(h, stage, actions);
    container.appendChild(wrap);
    const done = (v) => { view.width = view.height = 0; wrap.remove(); resolve(v); };
    use.addEventListener("click", () => done(warpQuad(photo, pts.map(([x, y]) => [x * photo.width, y * photo.height]))));
    skip.addEventListener("click", () => done(null));
  });
}
