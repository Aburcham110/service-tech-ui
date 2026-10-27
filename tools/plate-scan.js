/**
 * "Scan data plate": on-device OCR (vendored Tesseract.js) -> parser -> editable confirm form.
 *
 * Privacy: the photo never leaves the phone. Tesseract and its language data
 * load from this site (and offline from the service worker cache). The photo is
 * decoded into a canvas, and the object URL is revoked as soon as it's drawn.
 * Nothing is stored (not even localStorage) until the user taps Confirm, and
 * then only the onConfirm callback decides what to keep.
 */
import { mountGuide, renderReviewSummary, progressLine, INSTRUCTIONS } from "./scan-flow.js?v=27";
import { parsePlate, mergeParses, LOW_CONFIDENCE, lowBar, reviewReasons, ID_FIELDS } from "./plate-parse.js?v=27";
import { cropStep } from "./plate-crop.js?v=27";
import { findLabelBox, deglare, clahe } from "./plate-image.js?v=27";
import { isHeic, heicToFile } from "./heic.js?v=27";

const VENDOR = "vendor/tesseract/";
const DECODE_SIDE = 4000;   // decode cap (keeps the label's detail before cropping)
const MAX_SIDE = 1800;      // full-resolution OCR long edge (of the cropped label)
const PROBE_SIDE = 900;     // cheap orientation probe long edge
const FIND_SIDE = 600;      // label-finder working size

export const FIELDS = [
  ["brand", "Brand"], ["unitType", "Unit type"],
  ["model", "Model"], ["serial", "Serial"], ["partNo", "Part no."], ["application", "Application"], ["outdoorUnit", "Matching outdoor unit"], ["indoorUnit", "Matching indoor unit"],
  ["refrigerant", "Refrigerant"], ["charge", "Factory charge (lb)"],
  ["voltage", "Voltage"], ["phase", "Phase"], ["hz", "Hz"],
  ["rla", "Compressor RLA"], ["lra", "Compressor LRA"], ["compA", "Compressor A (cool/heat)"],
  ["fanFla", "Fan FLA"], ["fanQty", "Condenser fans (qty)"], ["fanHp", "Fan motor HP"], ["crankcaseW", "Crankcase heater (W)"],
  ["evapFanA", "Evap fan max amps"], ["defrostA", "Defrost heater max amps"], ["mca", "MCA"], ["mop", "MOP / max fuse"],
  ["designHigh", "Design pressure high (psig)"], ["designLow", "Design pressure low (psig)"], ["oil", "Oil (as printed)"],
  ["tempRange", "Temp range"], ["awef", "AWEF"],
];

function abs(rel) { return new URL(rel, document.baseURI).href; }

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractLoading) {
    tesseractLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = VENDOR + "tesseract.min.js";
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { tesseractLoading = null; reject(new Error("OCR engine failed to load")); };
      document.head.appendChild(s);
    });
  }
  return tesseractLoading;
}

/** EXIF orientation (1-8) from a JPEG's APP1 segment; 1 when absent/unreadable. */
export async function readExifOrientation(file) {
  try {
    const buf = new DataView(await file.slice(0, 131072).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return 1;
    let off = 2;
    while (off + 4 < buf.byteLength) {
      const marker = buf.getUint16(off), len = buf.getUint16(off + 2);
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) {
        const t = off + 10, le = buf.getUint16(t) === 0x4949;
        const ifd = t + buf.getUint32(t + 4, le), n = buf.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (buf.getUint16(e, le) === 0x0112) return buf.getUint16(e + 8, le) || 1;
        }
        return 1;
      }
      if ((marker & 0xff00) !== 0xff00) return 1;
      off += 2 + len;
    }
  } catch (e) { /* not a JPEG / truncated */ }
  return 1;
}

function browserAppliesExif() {
  // Safari < 13.1 (old iOS) ignored EXIF orientation when decoding into <img>/canvas.
  return !!(window.CSS && CSS.supports && CSS.supports("image-orientation", "from-image"));
}

/**
 * Decode the photo upright. Prefers createImageBitmap(imageOrientation:'from-image');
 * falls back to <img> plus manual EXIF rotation on browsers that don't apply it.
 * Returns a canvas with long edge <= MAX_SIDE.
 */
/** The browser can't decode this image (e.g. HEIC outside Safari). */
export class UndecodableImageError extends Error {
  constructor(file, damaged = false) {
    super(undecodableMessage(file, damaged));
    this.name = "UndecodableImageError";
  }
}
export function undecodableMessage(file, damaged = false) {
  const heic = damaged || /\.(heic|heif)$/i.test((file && file.name) || "") || /hei[cf]/i.test((file && file.type) || "");
  return (damaged ? "Couldn't decode this HEIC/HEIF photo — the file may be damaged or incomplete."
    : heic ? "This browser can't open HEIC/HEIF photos." : "This browser can't open that image format.") +
    " Save the photo as JPEG (or take a screenshot of it) and upload that.";
}
export const UPLOAD_ACCEPT = "image/*,.heic,.heif";

export async function decodeUpright(file, maxSide = DECODE_SIDE) {
  const orient = await readExifOrientation(file);
  let src = null, manual = 1;
  if (window.createImageBitmap) {
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { src = null; }
  }
  if (!src) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      try { await img.decode(); } catch (e) { throw new UndecodableImageError(file); }
      src = img;
    } finally {
      URL.revokeObjectURL(url);
    }
    if (orient > 1 && !browserAppliesExif()) manual = orient;
  }
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const swap = manual >= 5;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = swap ? dh : dw; c.height = swap ? dw : dh;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  // EXIF orientation transforms (only used on the manual path).
  const T = { 2: [-1, 0, 0, 1, dw, 0], 3: [-1, 0, 0, -1, dw, dh], 4: [1, 0, 0, -1, 0, dh],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, dh, 0], 7: [0, -1, -1, 0, dh, dw], 8: [0, -1, 1, 0, 0, dw] }[manual];
  if (T) ctx.setTransform(...T);
  ctx.drawImage(src, 0, 0, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (src.close) src.close(); else src.src = "";
  return { canvas: c, orientation: orient, manualExif: manual > 1 };
}

/** Rotate (0/90/180/270) and scale to long edge <= maxSide; returns a grayscale Uint8 array + dims. */
function rotatedGray(srcCanvas, deg, maxSide) {
  const s = Math.min(1, maxSide / Math.max(srcCanvas.width, srcCanvas.height));
  const w = Math.round(srcCanvas.width * s), h = Math.round(srcCanvas.height * s);
  const swap = deg === 90 || deg === 270;
  const c = document.createElement("canvas");
  c.width = swap ? h : w; c.height = swap ? w : h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(srcCanvas, -w / 2, -h / 2, w, h);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  c.width = c.height = 0;
  return { gray, w: swap ? h : w, h: swap ? w : h };
}

/** 2-98% contrast stretch, in place. */
function stretch(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const n = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) gray[i] = ((gray[i] - lo) * 255) / range;
  return gray;
}

/** Sauvola adaptive threshold (integral images): copes with glare and uneven light. */
export function sauvola(gray, w, h, k = 0.25, R = 128) {
  const win = Math.max(15, Math.round(Math.max(w, h) / 45)) | 1, r = win >> 1;
  const W = w + 1, S = new Float64Array(W * (h + 1)), S2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rs2 = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x]; rs += v; rs2 += v * v;
      S[(y + 1) * W + x + 1] = S[y * W + x + 1] + rs; S2[(y + 1) * W + x + 1] = S2[y * W + x + 1] + rs2;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (y1 - y0) * (x1 - x0);
      const sum = S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
      const sum2 = S2[y1 * W + x1] - S2[y0 * W + x1] - S2[y1 * W + x0] + S2[y0 * W + x0];
      const m = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
      out[y * w + x] = gray[y * w + x] > m * (1 + k * (sd / R - 1)) ? 255 : 0;
    }
  }
  return out;
}

function toCanvas(gray, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) { img.data[i] = img.data[i + 1] = img.data[i + 2] = gray[j]; img.data[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

function flattenWords(blocks) {
  const out = [];
  (blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) =>
    (l.words || []).forEach((w) => out.push({ text: w.text, confidence: w.confidence, bbox: w.bbox })))));
  return out;
}

const KEYWORDS = /^(?:MODEL|SERIAL|VOLTS?|PH|HZ|RLA|LRA|FLA|AMPS?|CHARGE|REFRIGERANT|MAX|MIN|FAN|MOTOR|COMPRESSOR|FUSE|SOURCE|LBS?|OZ|KG|COOL|HEAT|CIRCUIT|AMPACITY|PRESSURE|UNIT|PSIG|MPA|OUTDOOR|INDOOR|NO)\.?:?$/i;

/** Orientation score from a probe OCR: confident real words + label keywords. */
export function orientationScore(words) {
  const good = words.filter((w) => /[A-Za-z0-9]{2,}/.test(w.text));
  if (!good.length) return 0;
  const mean = good.reduce((a, w) => a + w.confidence, 0) / good.length;
  const strong = good.filter((w) => w.confidence >= 70).length;
  const kw = good.filter((w) => KEYWORDS.test(w.text) && w.confidence >= 50).length;
  return mean * Math.min(1, strong / 8) + kw * 12;
}

/** Confident (>=70) alphanumeric words: how much legible text a probe found. */
export function strongWords(words) {
  return words.filter((w) => /[A-Za-z0-9]{2,}/.test(w.text) && w.confidence >= 70).length;
}

async function makeWorker(onProgress) {
  const T = await loadTesseract();
  return T.createWorker("eng", 1, {
    workerPath: abs(VENDOR + "worker.min.js"),
    corePath: abs(VENDOR + "core"),
    langPath: abs(VENDOR + "lang"),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none", // the service worker caches the model; don't also write it to IndexedDB
    logger: (m) => onProgress && m && m.status === "recognizing text" && onProgress(m.progress),
  });
}

async function recognize(worker, canvas, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1" });
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return { text: data.text || "", words: flattenWords(data.blocks), confidence: data.confidence };
}

/**
 * Full on-device pipeline: EXIF-upright decode -> orientation probe (0/90/180/270
 * at ~800px) -> full-res OCR on the winner: grayscale and Sauvola-thresholded,
 * PSM 11 (sparse) and PSM 6 (block) -> parse every pass and merge per field.
 * progress(stageText, fraction0to1)
 */
// Default OCR plan. "glare" = flat-field + CLAHE, for reflective/curved labels.
export const DEFAULT_PLAN = [["gray", 11], ["sauvola", 11], ["glare", 11], ["gray", 6], ["sauvola", 6], ["glare", 6]];
const MIN_PASSES = 4;
const PROBE_GOOD = { score: 150, strong: 15 }; // an upright read this good needs no other angles

/** Signature of a merged parse: field -> value. Used to stop once extra passes change nothing. */
function sig(m) { return Object.fromEntries(Object.entries(m.fields).map(([k, f]) => [k, String(f.value)])); }

export async function scanPlate(file, progress = () => {}, opts = (globalThis.__plateScanOpts || {})) {
  const t0 = performance.now(), timing = {};
  progress("Preparing photo…", 0.02);
  // opts.canvas: the user already straightened/cropped the photo, so skip the auto crop.
  const { canvas: full, orientation } = opts.canvas ? { canvas: opts.canvas, orientation: "manual-crop" } : await decodeUpright(file);
  // Crop to the plate so its text keeps as many pixels as possible.
  progress("Finding the plate…", 0.04);
  const small = rotatedGray(full, 0, FIND_SIDE);
  const box = opts.canvas ? null : findLabelBox(small.gray, small.w, small.h);
  let upright = full, crop = null;
  if (box) {
    const k = full.width / small.w, pad = 0.03 * Math.max(full.width, full.height);
    const x = Math.max(0, box.x * k - pad), y = Math.max(0, box.y * k - pad);
    const w = Math.min(full.width - x, box.w * k + 2 * pad), h = Math.min(full.height - y, box.h * k + 2 * pad);
    upright = document.createElement("canvas");
    upright.width = Math.round(w); upright.height = Math.round(h);
    upright.getContext("2d").drawImage(full, x, y, w, h, 0, 0, upright.width, upright.height);
    crop = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), frac: box.frac };
  }
  const worker = await makeWorker();
  const passes = [];
  try {
    const angles = [0, 90, 180, 270], probes = [];
    for (let i = 0; i < angles.length; i++) {
      progress("Finding orientation " + (i + 1) + "/4…", 0.05 + 0.25 * (i / 4));
      const g = rotatedGray(upright, angles[i], PROBE_SIDE);
      const c = toCanvas(stretch(g.gray), g.w, g.h);
      const r = await recognize(worker, c, 11);
      c.width = c.height = 0;
      probes.push({ angle: angles[i], score: orientationScore(r.words), strong: strongWords(r.words) });
      if (opts.earlyStop !== false && i === 0 && probes[0].score >= PROBE_GOOD.score && probes[0].strong >= PROBE_GOOD.strong) break;
    }
    timing.probe = Math.round(performance.now() - t0);
    probes.sort((a, b) => b.score - a.score);
    const angle = probes[0].angle;
    if (crop) {
      // Guard against a crop that caught only part of the plate (e.g. the plate fills the
      // frame): probe the uncropped photo at the winning angle and keep whichever reads better.
      progress("Checking the crop…", 0.3);
      const g0 = rotatedGray(full, angle, PROBE_SIDE);
      const c0 = toCanvas(stretch(g0.gray), g0.w, g0.h);
      const w0 = (await recognize(worker, c0, 11)).words;
      c0.width = c0.height = 0;
      const s0 = orientationScore(w0), n0 = strongWords(w0);
      crop.fullScore = Math.round(s0); crop.cropScore = Math.round(probes[0].score);
      crop.fullWords = n0; crop.cropWords = probes[0].strong;
      // The score saturates, so also compare how many confident words each one reads.
      if (s0 > probes[0].score * 1.15 || n0 > probes[0].strong * 1.3 + 2) { upright.width = upright.height = 0; upright = full; crop.used = false; }
      else { full.width = full.height = 0; crop.used = true; }
    }
    const g = rotatedGray(upright, angle, MAX_SIDE);
    upright.width = upright.height = 0;
    const raw = Uint8ClampedArray.from(g.gray);
    const plain = stretch(g.gray);
    const plan = opts.plan || DEFAULT_PLAN, earlyStop = opts.earlyStop !== false;
    const make = { gray: () => plain, sauvola: () => sauvola(plain, g.w, g.h), glare: () => stretch(clahe(deglare(raw, g.w, g.h), g.w, g.h)) };
    const variants = [];
    const canvasFor = (n) => { let v = variants.find((x) => x[0] === n); if (!v) variants.push(v = [n, toCanvas(make[n](), g.w, g.h)]); return v[1]; };
    let prev = null;
    timing.passes = [];
    for (let i = 0; i < plan.length; i++) {
      const [vname, psm] = plan[i];
      progress("Reading plate, pass " + (i + 1) + "/" + plan.length + "…", 0.32 + 0.66 * (i / plan.length));
      const ts = performance.now();
      const r = await recognize(worker, canvasFor(vname), psm);
      passes.push({ name: vname + " psm" + psm, ...r, parsed: parsePlate({ ...r, psm }) });
      timing.passes.push(Math.round(performance.now() - ts));
      // Early stop: after MIN_PASSES, stop once another pass leaves every merged value unchanged.
      const cur = JSON.stringify(sig(mergeParses(passes.map((p) => ({ name: p.name, confidence: p.confidence, parsed: p.parsed })))));
      if (earlyStop && i + 1 >= MIN_PASSES && cur === prev) { timing.stoppedAfter = i + 1; break; }
      prev = cur;
    }
    timing.total = Math.round(performance.now() - t0);
    variants.forEach((v) => { v[1].width = v[1].height = 0; });
    progress("Done", 1);
    const merged = mergeParses(passes.map((p) => ({ name: p.name, confidence: p.confidence, parsed: p.parsed })));
    return { merged, passes: passes.map(({ name, text, confidence, words }) => ({ name, text, confidence, words })), angle, probes, orientation, crop, timing };
  } finally {
    await worker.terminate();
  }
}

/** Back-compat helper: single plain OCR of a canvas. */
export async function ocrCanvas(canvas) {
  const worker = await makeWorker();
  try { return await recognize(worker, canvas, 11); } finally { await worker.terminate(); }
}

function fmt(name, f) {
  if (!f) return "";
  if (name === "charge") return String(f.value.lb);
  return String(f.value);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Collapsible raw OCR text with a Copy button. Local only: nothing is sent anywhere. */
function rawPanel(passes, chosen) {
  const d = el("details", "plate-raw");
  d.open = true; // shown beside the fields so values can be checked against what OCR saw
  d.appendChild(el("summary", null, "Show raw OCR text"));
  const order = passes.slice().sort((a, b) => (b.name === chosen) - (a.name === chosen));
  const txt = order.map((p) => "--- " + p.name + " (mean conf " + Math.round(p.confidence || 0) + ") ---\n" + p.text.trim()).join("\n\n");
  const pre = el("pre", "plate-raw-text", txt);
  pre.tabIndex = 0;
  const copy = el("button", "btn btn-secondary btn-small plate-copy-raw", "Copy raw OCR");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(txt);
      copy.textContent = "Copied";
    } catch (e) {
      const r = document.createRange(); r.selectNodeContents(pre);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      copy.textContent = document.execCommand && document.execCommand("copy") ? "Copied" : "Selected — copy manually";
    }
  });
  d.append(copy, pre);
  return d;
}

/** Look-alike characters on plates (O/0, I/1/l, S/5, B/8, Z/2, G/6, D/0, Q/0). */
export const CONFUSABLE_CHARS = "O0QDI1LS5B8Z2G6";

/** Splits a value into runs, marking look-alike characters so the form can emphasize them. */
export function confusableMarks(value) {
  return Array.from(String(value || "")).map((ch) => ({ ch, confusable: CONFUSABLE_CHARS.includes(ch.toUpperCase()) }));
}

function renderChars(host, value) {
  host.innerHTML = "";
  const marks = confusableMarks(value);
  host.hidden = !marks.some((m) => m.confusable);
  marks.forEach((m) => { const s = el("span", m.confusable ? "cf" : null, m.ch); if (m.confusable) s.title = "Look-alike: check on the plate"; host.appendChild(s); });
}

/** Overall read quality is low: an ID field (model/serial) under 0.5 or an OCR hint about glare/blur. */
export function needsRetake(parsed) {
  const idConf = ID_FIELDS.map((n) => parsed.fields[n] ? parsed.fields[n].confidence : 0);
  return Math.min(...idConf) < 0.5 || (parsed.hints || []).some((h) => /glare|blur|retake/i.test(h));
}

function buildConfirm(parsed, onConfirm, onCancel, passes, onRetake, confirmLabel = "Fill call card") {
  const wrap = el("div", "plate-confirm");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Confirm data plate");
  const retake = needsRetake(parsed);
  // Low confidence: lead with Retake (banner + button before the heading and the form).
  if (!retake) wrap.appendChild(el("h2", null, "Confirm data plate"));
  const nLow = parsed.lowConfidence.length;
  const brand = parsed.fields.brand && parsed.fields.brand.value;
  if (retake) {
    const rb = el("div", "plate-retake", "");
    rb.setAttribute("role", "alert");
    rb.appendChild(el("strong", null, "Low confidence read. "));
    rb.appendChild(document.createTextNode("Retake closer and square-on, tilt slightly to kill glare, or straighten with the crop step — then check model and serial character by character."));
    if (onRetake) {
      const rt = el("button", "link-btn plate-retake-btn", "Retake now");
      rt.type = "button";
      // One tap: drop this read and reopen the camera (same file input, so it stays a user gesture).
      rt.addEventListener("click", () => { wrap.remove(); onRetake(); });
      rb.prepend(rt);
    }
    wrap.appendChild(rb);
    wrap.appendChild(el("h2", null, "Confirm data plate"));
  }
  wrap.appendChild(el("p", "footer-note", "Check every value against the plate. Blank = not read. " +
    (nLow ? nLow + " field(s) flagged as low confidence." : "")));
  (parsed.hints || []).forEach((h) => wrap.appendChild(el("p", "plate-hint", h)));
  const form = el("form", "plate-form");
  FIELDS.forEach(([name, label]) => {
    const f = parsed.fields[name];
    // Optional/rare fields only appear when the plate has them.
    if (!f && ["brand", "unitType", "outdoorUnit", "indoorUnit", "compA", "designHigh", "designLow", "oil", "partNo", "application", "fanQty", "fanHp", "crankcaseW", "evapFanA", "defrostA", "tempRange", "awef"].includes(name)) return;
    const lab = el("label", "field");
    const span = el("span", null, label);
    const reasons = reviewReasons(name, f, brand);
    const low = f && (f.confidence < lowBar(name) || reasons.length > 0);
    if (f) {
      span.appendChild(el("small", "conf" + (low ? " low" : ""),
        " " + Math.round(f.confidence * 100) + "%" + (low ? " — check" : "") + (f.note ? " (" + f.note + ")" : "")));
    }
    lab.appendChild(span);
    const input = el("input");
    input.name = name;
    input.dataset.plate = name;
    input.autocomplete = "off";
    input.value = fmt(name, f);
    if (low) { input.classList.add("low-conf"); input.setAttribute("aria-invalid", "true"); }
    if (name === "charge" && f) input.title = f.value.display;
    lab.appendChild(input);
    if (reasons.length) {
      const ul = el("ul", "plate-review");
      reasons.forEach((r) => ul.appendChild(el("li", null, r)));
      lab.appendChild(ul);
    }
    if (f && f.candidates && f.candidates.length > 1) {
      const chips = el("div", "plate-candidates");
      chips.appendChild(el("small", null, ID_FIELDS.includes(name) ? "OCR passes disagree — candidates: " : "Pick: "));
      f.candidates.forEach((c) => {
        const cv = fmt(name, { value: c.value });
        const b = el("button", "btn btn-secondary btn-small plate-candidate", cv + " (" + c.votes + ")");
        b.type = "button";
        b.addEventListener("click", () => { input.value = cv; input.dispatchEvent(new Event("input")); chips.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
        chips.appendChild(b);
      });
      lab.appendChild(chips);
    }
    if (ID_FIELDS.includes(name)) {
      const chars = el("div", "plate-chars");
      chars.setAttribute("aria-hidden", "true"); // visual aid; the input stays the source of truth
      renderChars(chars, input.value);
      input.addEventListener("input", () => renderChars(chars, input.value));
      lab.appendChild(chars);
      const ck = el("label", "plate-looks-right");
      const cb = el("input"); cb.type = "checkbox"; cb.name = name + "-ok"; cb.dataset.looksRight = name;
      ck.append(cb, document.createTextNode(" Looks right (checked against the plate)"));
      input.addEventListener("input", () => { cb.checked = false; gate(); });
      cb.addEventListener("change", () => gate());
      lab.appendChild(ck);
    }
    if (f && f.display) lab.appendChild(el("small", "footer-note", f.display));
    else if (name === "charge" && f) lab.appendChild(el("small", "footer-note", f.value.display));
    form.appendChild(lab);
  });
  const actions = el("div", "tool-actions");
  // One primary action: Fill call card — unless the read is unreliable, then Retake leads and Fill is secondary.
  const ok = el("button", retake && onRetake ? "btn btn-secondary plate-confirm-btn" : "btn btn-primary btn-big plate-confirm-btn", confirmLabel); ok.type = "submit";
  const cancel = el("button", "link-btn plate-discard", "Discard this read"); cancel.type = "button";
  if (retake && onRetake) {
    const rt2 = el("button", "btn btn-primary btn-big plate-retake-btn2", "📷 Retake"); rt2.type = "button";
    rt2.addEventListener("click", () => { wrap.remove(); onRetake(); });
    actions.append(rt2);
  } else if (onRetake) {
    const rt3 = el("button", "link-btn plate-retake-link", "Retake photo"); rt3.type = "button";
    rt3.addEventListener("click", () => { wrap.remove(); onRetake(); });
    actions.append(ok, rt3, cancel);
  }
  if (!actions.contains(ok)) actions.append(ok, cancel);
  const gateNote = el("p", "footer-note plate-gate-note");
  function gate() {
    const pending = ID_FIELDS.filter((n) => { const i = form.elements[n], c = form.elements[n + "-ok"]; return i && i.value.trim() && c && !c.checked; });
    ok.disabled = pending.length > 0;
    gateNote.textContent = pending.length ? "Tick “Looks right” for " + pending.join(" and ") + " to confirm." : "";
  }
  form.appendChild(gateNote);
  form.appendChild(actions);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    gate();
    if (ok.disabled) return;
    const values = {};
    FIELDS.forEach(([name]) => { const i = form.elements[name]; const v = i && i.value.trim(); if (v) values[name] = v; });
    wrap.remove();
    onConfirm(values);
  });
  cancel.addEventListener("click", () => { wrap.remove(); onCancel && onCancel(); });
  const summary = renderReviewSummary(form);
  form.addEventListener("change", gate);
  wrap.insertBefore(summary.el, wrap.querySelector(".plate-retake") ? wrap.querySelector(".plate-retake").nextSibling : wrap.firstChild);
  const cols = el("div", "plate-cols");
  cols.appendChild(form);
  if (passes && passes.length) cols.appendChild(rawPanel(passes, parsed.bestPass));
  wrap.appendChild(cols);
  queueMicrotask(() => { gate(); summary.update(); });
  return wrap;
}

/** Plain-text summary of confirmed plate values (for notes fields). */
export function plateSummary(v) {
  const parts = [];
  if (v.brand) parts.push(v.brand + (v.unitType ? " " + v.unitType : ""));
  if (v.model) parts.push("Model " + v.model);
  if (v.serial) parts.push("S/N " + v.serial);
  if (v.refrigerant) parts.push(v.refrigerant + (v.charge ? " " + v.charge + " lb" : ""));
  else if (v.charge) parts.push("Charge " + v.charge + " lb");
  const elec = [v.voltage && v.voltage + "V", v.phase && v.phase + "ph", v.hz && v.hz + "Hz"].filter(Boolean).join(" ");
  if (elec) parts.push(elec);
  [["rla", "RLA"], ["lra", "LRA"], ["compA", "Comp A"], ["fanFla", "Fan FLA"], ["fanQty", "Condenser fans (qty)"], ["fanHp", "Fan motor HP"], ["crankcaseW", "Crankcase heater (W)"],
  ["evapFanA", "Evap fan max amps"], ["defrostA", "Defrost heater max amps"], ["mca", "MCA"], ["mop", "MOP"],
    ["designHigh", "DP high"], ["designLow", "DP low"], ["oil", "Oil"], ["outdoorUnit", "OD unit"], ["indoorUnit", "ID unit"]]
    .forEach(([k, l]) => { if (v[k]) parts.push(l + " " + v[k]); });
  return parts.join(" | ");
}

/**
 * Put a "Scan data plate" button into `container`.
 * onConfirm(values) is called only after the user confirms the (possibly edited) form.
 */
export function mountPlateScan(container, onConfirm, { confirmLabel = "Fill call card" } = {}) {
  const box = el("div", "plate-scan");
  const guide = mountGuide(box);
  box.__guide = guide;
  const fileInput = (cls, accept, capture) => {
    const i = el("input", "visually-hidden " + cls);
    i.type = "file"; i.accept = accept;
    if (capture) i.setAttribute("capture", "environment");
    i.id = "plate-file-" + Math.random().toString(36).slice(2, 8);
    return i;
  };
  // Take photo: camera. Upload photo: gallery or files (no capture attribute). Both feed the same pipeline below.
  const label = el("label", "btn btn-primary btn-big plate-scan-btn", "📷 Take photo");
  const input = fileInput("plate-camera-input", "image/*", true);
  label.htmlFor = input.id;
  const upLabel = el("label", "btn btn-secondary plate-upload-btn", "🖼 Upload photo");
  const upInput = fileInput("plate-upload-input", UPLOAD_ACCEPT, false);
  upLabel.htmlFor = upInput.id;
  const showPick = (on) => { label.hidden = upLabel.hidden = !on; tip.hidden = !on; };
  const status = el("p", "plate-status footer-note");
  status.setAttribute("aria-live", "polite");
  const bar = el("progress", "plate-progress");
  bar.max = 1; bar.value = 0; bar.hidden = true;
  const tip = el("p", "plate-tip footer-note", "Tip: fill the frame with the plate, hold the phone square to it, and angle it slightly to kill glare on shiny or curved labels.");
  box.append(label, input, upLabel, upInput, tip, status, bar);
  container.appendChild(box);

  const onPick = (inp, source) => async () => {
    let file = inp.files && inp.files[0];
    inp.value = ""; // drop the reference to the photo
    if (!file) return;
    box.__lastSource = source; // "camera" | "upload" (tests only)
    box.querySelector(".plate-confirm")?.remove();
    box.querySelector(".scan-done")?.remove();
    label.classList.add("disabled"); showPick(false);
    bar.hidden = false;
    status.textContent = "Reading plate on this phone…"; status.classList.remove("plate-format-error");
    try {
      if (await isHeic(file)) {
        // Android Chrome can't decode HEIC natively: convert on the phone with the self-hosted decoder.
        status.textContent = "Converting HEIC photo on this phone…";
        try { file = await heicToFile(file); } catch (e) { console.error(e); throw new UndecodableImageError(file, true); }
        box.__lastHeic = true; // tests only
      } else box.__lastHeic = false;
      const opts = Object.assign({}, globalThis.__plateScanOpts || {});
      if (opts.cropStep !== false) {
        guide.set("crop");
        status.textContent = "";
        const { canvas: photo } = await decodeUpright(file);
        const warped = await cropStep(box, photo);
        if (warped) { opts.canvas = warped; photo.width = photo.height = 0; }
      }
      guide.set("reading");
      const t0 = performance.now();
      status.textContent = progressLine("Preparing", 0, 0);
      const res = await scanPlate(file, (stage, frac) => { status.textContent = progressLine(stage, performance.now() - t0, frac); bar.value = frac; }, opts);
      const parsed = res.merged;
      box.__lastParse = parsed; // for debugging/tests only, in memory
      box.__lastScan = { timing: res.timing, crop: res.crop, angle: res.angle, probes: res.probes, orientation: res.orientation, passes: res.passes.map((p) => ({ name: p.name, text: p.text, confidence: p.confidence })) };
      const found = Object.keys(parsed.fields).length;
      guide.set("check", needsRetake(parsed) ? INSTRUCTIONS.checkRetake : INSTRUCTIONS.check);
      status.textContent = found ? "" : "Couldn't read any plate fields. Retake closer, square-on, with less glare — or type the values.";
      const reset = () => { guide.set("photo"); showPick(true); };
      box.appendChild(buildConfirm(parsed, (values) => {
        status.textContent = "";
        guide.set("done");
        onConfirm(values);
      }, () => { status.textContent = "Read discarded."; reset(); }, res.passes, () => { reset(); status.textContent = "Retake: opening the camera…"; input.click(); }, confirmLabel));
    } catch (e) {
      console.error(e);
      status.textContent = e instanceof UndecodableImageError ? e.message
        : "Couldn't read the photo: " + (e && e.message ? e.message : e) + " — tap Take photo or Upload photo to try again.";
      status.classList.toggle("plate-format-error", e instanceof UndecodableImageError);
      guide.set("photo"); showPick(true);
    } finally {
      label.classList.remove("disabled");
      bar.hidden = true;
    }
  };
  input.addEventListener("change", onPick(input, "camera"));
  upInput.addEventListener("change", onPick(upInput, "upload"));
  box.__reset = () => { box.querySelector(".scan-done")?.remove(); guide.set("photo"); showPick(true); status.textContent = ""; };
  return box;
}
