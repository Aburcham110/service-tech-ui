/**
 * "Scan data plate": on-device OCR (vendored Tesseract.js) -> parser -> editable confirm form.
 *
 * Privacy: the photo never leaves the phone. Tesseract and its language data
 * load from this site (and offline from the service worker cache). The photo is
 * decoded into a canvas, and the object URL is revoked as soon as it's drawn.
 * Nothing is stored (not even localStorage) until the user taps Confirm, and
 * then only the onConfirm callback decides what to keep.
 */
import { parsePlate, LOW_CONFIDENCE } from "./plate-parse.js?v=5";

const VENDOR = "vendor/tesseract/";
const MAX_SIDE = 1600;

export const FIELDS = [
  ["model", "Model"], ["serial", "Serial"], ["refrigerant", "Refrigerant"],
  ["charge", "Factory charge (lb)"], ["voltage", "Voltage"], ["phase", "Phase"], ["hz", "Hz"],
  ["rla", "Compressor RLA"], ["lra", "Compressor LRA"], ["fanFla", "Fan FLA"],
  ["mca", "MCA"], ["mop", "MOP / max fuse"],
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

/** Decode -> downscale to <= MAX_SIDE -> grayscale -> 2-98% contrast stretch. */
export async function preprocess(file) {
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  img.src = "";
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    gray[j] = g; hist[gray[j]]++;
  }
  const n = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((gray[j] - lo) * 255) / range;
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function flattenWords(blocks) {
  const out = [];
  (blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) =>
    (l.words || []).forEach((w) => out.push({ text: w.text, confidence: w.confidence })))));
  return out;
}

export async function ocrCanvas(canvas, onProgress) {
  const T = await loadTesseract();
  const worker = await T.createWorker("eng", 1, {
    workerPath: abs(VENDOR + "worker.min.js"),
    corePath: abs(VENDOR + "core"),
    langPath: abs(VENDOR + "lang"),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none", // the service worker caches the model; don't also write it to IndexedDB
    logger: (m) => onProgress && m && typeof m.progress === "number" && onProgress(m.status, m.progress),
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    return { text: data.text || "", words: flattenWords(data.blocks), confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

function fmt(name, f) {
  if (!f) return "";
  if (name === "charge") return String(f.value.lb);
  return String(f.value);
}

function buildConfirm(parsed, onConfirm, onCancel) {
  const wrap = document.createElement("div");
  wrap.className = "plate-confirm";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Confirm data plate");
  const h = document.createElement("h2");
  h.textContent = "Confirm data plate";
  wrap.appendChild(h);
  const p = document.createElement("p");
  p.className = "footer-note";
  const nLow = parsed.lowConfidence.length;
  p.textContent = "Check every value against the plate. Blank = not read. " +
    (nLow ? nLow + " field(s) flagged as low confidence." : "");
  wrap.appendChild(p);
  const form = document.createElement("form");
  form.className = "plate-form";
  FIELDS.forEach(([name, label]) => {
    const f = parsed.fields[name];
    const lab = document.createElement("label");
    lab.className = "field";
    const span = document.createElement("span");
    span.textContent = label;
    const low = f && f.confidence < LOW_CONFIDENCE;
    if (f) {
      const c = document.createElement("small");
      c.className = "conf" + (low ? " low" : "");
      c.textContent = " " + Math.round(f.confidence * 100) + "%" + (low ? " — check" : "") + (f.note ? " (" + f.note + ")" : "");
      span.appendChild(c);
    }
    lab.appendChild(span);
    const input = document.createElement("input");
    input.name = name;
    input.dataset.plate = name;
    input.autocomplete = "off";
    input.value = fmt(name, f);
    if (low) { input.classList.add("low-conf"); input.setAttribute("aria-invalid", "true"); }
    if (name === "charge" && f) input.title = f.value.display;
    lab.appendChild(input);
    form.appendChild(lab);
  });
  const actions = document.createElement("div");
  actions.className = "tool-actions";
  const ok = document.createElement("button");
  ok.type = "submit"; ok.className = "btn btn-primary"; ok.textContent = "Confirm";
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "btn btn-secondary"; cancel.textContent = "Discard";
  actions.append(ok, cancel);
  form.appendChild(actions);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = {};
    FIELDS.forEach(([name]) => { const v = form.elements[name].value.trim(); if (v) values[name] = v; });
    wrap.remove();
    onConfirm(values);
  });
  cancel.addEventListener("click", () => { wrap.remove(); onCancel && onCancel(); });
  wrap.appendChild(form);
  return wrap;
}

/** Plain-text summary of confirmed plate values (for notes fields). */
export function plateSummary(v) {
  const parts = [];
  if (v.model) parts.push("Model " + v.model);
  if (v.serial) parts.push("S/N " + v.serial);
  if (v.refrigerant) parts.push(v.refrigerant + (v.charge ? " " + v.charge + " lb" : ""));
  else if (v.charge) parts.push("Charge " + v.charge + " lb");
  const elec = [v.voltage && v.voltage + "V", v.phase && v.phase + "ph", v.hz && v.hz + "Hz"].filter(Boolean).join(" ");
  if (elec) parts.push(elec);
  [["rla", "RLA"], ["lra", "LRA"], ["fanFla", "Fan FLA"], ["mca", "MCA"], ["mop", "MOP"]].forEach(([k, l]) => { if (v[k]) parts.push(l + " " + v[k]); });
  return parts.join(" | ");
}

/**
 * Put a "Scan data plate" button into `container`.
 * onConfirm(values) is called only after the user confirms the (possibly edited) form.
 */
export function mountPlateScan(container, onConfirm) {
  const box = document.createElement("div");
  box.className = "plate-scan";
  const label = document.createElement("label");
  label.className = "btn btn-secondary plate-scan-btn";
  label.textContent = "📷 Scan data plate";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.className = "visually-hidden";
  input.id = "plate-file-" + Math.random().toString(36).slice(2, 8);
  label.htmlFor = input.id;
  const status = document.createElement("p");
  status.className = "plate-status footer-note";
  status.setAttribute("aria-live", "polite");
  box.append(label, input, status);
  container.appendChild(box);

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = ""; // drop the reference to the photo
    if (!file) return;
    box.querySelector(".plate-confirm")?.remove();
    label.classList.add("disabled");
    status.textContent = "Reading plate on this phone…";
    try {
      const canvas = await preprocess(file);
      const ocr = await ocrCanvas(canvas, (s, pr) => { status.textContent = "Reading plate on this phone… " + Math.round(pr * 100) + "%"; });
      canvas.width = canvas.height = 0;
      const parsed = parsePlate(ocr);
      box.__lastParse = parsed; // for debugging/tests only, in memory
      const found = Object.keys(parsed.fields).length;
      status.textContent = found ? "Found " + found + " field(s). Review below." : "Couldn't read any plate fields. Try again closer, square-on, with less glare.";
      box.appendChild(buildConfirm(parsed, (values) => {
        status.textContent = "Plate values applied.";
        onConfirm(values);
      }, () => { status.textContent = "Discarded."; }));
    } catch (e) {
      console.error(e);
      status.textContent = "OCR failed: " + (e && e.message ? e.message : e);
    } finally {
      label.classList.remove("disabled");
    }
  });
  return box;
}
