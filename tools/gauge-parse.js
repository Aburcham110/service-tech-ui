/** Gauge report import: pure parsing + unit conversion (no DOM, no network). Runs in node for tests.
 *  Every file becomes a table { headers, rows, kind }. No column meaning is guessed: the tech maps
 *  columns once per brand (see BRANDS / mapping), unless a brand mapping is VERIFIED from a real or
 *  official sample export. None is verified yet (no official sample with headers was found; see
 *  BRANDS[].verified and docs in vendor/README-gauge.md). */

export const FIELDS = [
  { id: "suctionPsig", label: "Suction pressure", kind: "pressure" },
  { id: "dischargePsig", label: "Discharge pressure", kind: "pressure" },
  { id: "suctionTemp", label: "Suction line temp", kind: "temp" },
  { id: "liquidTemp", label: "Liquid line temp", kind: "temp" },
  { id: "refrigerant", label: "Refrigerant", kind: "text" },
  { id: "timestamp", label: "Timestamp", kind: "text" },
];

/** Target formats. verified=null means generic mapper (headers/units not confirmed from a sample). */
export const BRANDS = [
  { id: "mantooth", label: "Yellow Jacket Mantooth", formats: ["csv"], verified: null },
  { id: "testo", label: "testo Smart", formats: ["csv", "pdf"], verified: null },
  { id: "sauermann", label: "Sauermann Si-Manifold", formats: ["csv", "xml", "pdf"], verified: null },
  { id: "navac", label: "myNAVAC", formats: ["xlsx", "pdf"], verified: null },
  { id: "fieldpiece", label: "Fieldpiece Job Link", formats: ["pdf"], verified: null },
  { id: "other", label: "Other / not listed", formats: ["csv", "xlsx", "xml", "pdf"], verified: null },
];

export const PRESSURE_UNITS = ["psig", "psia", "kPa", "kPa(a)", "bar", "bar(a)", "MPa"];
export const TEMP_UNITS = ["°F", "°C"];
const ATM_PSI = 14.696;

export function fileKind(name, type) {
  const n = String(name || "").toLowerCase();
  const t = String(type || "").toLowerCase();
  if (/\.csv$|\.txt$/.test(n) || /csv/.test(t)) return "csv";
  if (/\.xlsx$/.test(n) || /spreadsheetml/.test(t)) return "xlsx";
  if (/\.xls$/.test(n)) return "xls";
  if (/\.xml$/.test(n) || /xml/.test(t)) return "xml";
  if (/\.pdf$/.test(n) || /pdf/.test(t)) return "pdf";
  return null;
}

/* ---------- CSV ---------- */
export function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, "");
  // Preambles (title lines) vary, so score each delimiter over the first 20 non-blank lines.
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20).join("\n");
  const cands = [",", ";", "\t"];
  const delim = cands.map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return { rows: rows.map((r) => r.map((s) => s.trim())).filter((r) => r.some((s) => s !== "")), delim };
}

const isNum = (s) => /^[-+]?\d+(?:[.,]\d+)?$/.test(String(s).replace(/\s*(psig|psia|psi|kpa|bar|mpa|°?[fc])$/i, "").trim());

/** Header row = the last mostly-text row right before the first mostly-numeric data row. */
export function toTable(rows, kind) {
  let start = rows.findIndex((r, i) => i > 0 && r.filter(isNum).length >= Math.max(1, Math.ceil(r.filter(Boolean).length / 2)));
  if (start < 1) start = 1;
  const headers = (rows[start - 1] || []).map((h, i) => h || "Column " + (i + 1));
  const width = Math.max(headers.length, ...rows.slice(start).map((r) => r.length));
  while (headers.length < width) headers.push("Column " + (headers.length + 1));
  const data = rows.slice(start).filter((r) => r.length >= 2);
  const meta = rows.slice(0, start - 1).map((r) => r.filter(Boolean).join(" ")).filter(Boolean);
  return { kind, headers, rows: data, meta };
}

/* ---------- XLSX (zip of XML; unzip function injected so node tests and the lazy browser load share code) ---------- */
const xmlUnesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export function parseXLSX(bytes, unzipSync) {
  const files = unzipSync(bytes, { filter: (f) => /^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml|workbook\.xml)$/.test(f.name) });
  const dec = new TextDecoder();
  const sheet = files["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new Error("No first sheet in this Excel file");
  const shared = [];
  const ss = files["xl/sharedStrings.xml"] ? dec.decode(files["xl/sharedStrings.xml"]) : "";
  for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(xmlUnesc((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  const rows = [];
  for (const r of dec.decode(sheet).match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const out = [];
    for (const c of r.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (c.match(/ r="([A-Z]+)\d+"/) || [])[1];
      const t = (c.match(/ t="(\w+)"/) || [])[1];
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const is = (c.match(/<is>[\s\S]*?<\/is>/) || [])[0];
      let val = "";
      if (t === "s" && v != null) val = shared[+v] || "";
      else if (t === "inlineStr" && is) val = xmlUnesc(is.replace(/<[^>]+>/g, ""));
      else if (v != null) val = xmlUnesc(v);
      out[ref ? colIdx(ref) : out.length] = val.trim();
    }
    rows.push(Array.from(out, (x) => x || ""));
  }
  return toTable(rows.filter((r) => r.some(Boolean)), "xlsx");
}

/* ---------- XML: records = the most repeated element that has leaf children or attributes ---------- */
export function parseXML(text) {
  text = String(text).replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, "");
  const counts = {};
  for (const m of text.matchAll(/<([A-Za-z_][\w.:-]*)[\s>]/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
  const isRecord = (name) => {
    const m = text.match(new RegExp("<" + name + "(\\s[^>]*)?>([\\s\\S]*?)</" + name + ">"));
    return m && (/<[\w]/.test(m[2]) || /=/.test(m[1] || ""));
  };
  const name = Object.keys(counts).filter((n) => counts[n] > 1 && isRecord(n)).sort((a, b) => counts[b] - counts[a])[0];
  if (!name) throw new Error("No repeated records in this XML file");
  const headers = [], rows = [];
  for (const m of text.matchAll(new RegExp("<" + name + "(\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "g"))) {
    const rec = {};
    for (const a of (m[1] || "").matchAll(/([\w.:-]+)="([^"]*)"/g)) rec["@" + a[1]] = xmlUnesc(a[2]);
    for (const c of m[2].matchAll(/<([\w.:-]+)((?:\s[^>]*)?)>([^<]*)<\/\1>/g)) {
      const unit = (c[2].match(/unit="([^"]*)"/i) || [])[1];
      rec[c[1] + (unit ? " (" + unit + ")" : "")] = xmlUnesc(c[3]).trim();
    }
    for (const k of Object.keys(rec)) if (!headers.includes(k)) headers.push(k);
    rows.push(rec);
  }
  return { kind: "xml", headers, rows: rows.map((r) => headers.map((h) => r[h] ?? "")), meta: ["Records: <" + name + ">"] };
}

/* ---------- PDF text layer -> label/value pairs (one row). Lines come from pdf.js getTextContent. ---------- */
const UNIT_RE = "(psig|psia|psi|kpa|bar|mpa|°\\s?f|°\\s?c|ºf|ºc|deg\\s?f|deg\\s?c|f|c)";
export function pdfLinesToTable(lines) {
  const headers = [], vals = [];
  const re = new RegExp("^(.*?[A-Za-z][^:]*?)\\s*[:=]?\\s+([-+]?\\d+(?:[.,]\\d+)?)\\s*" + UNIT_RE + "?\\s*$", "i");
  const seen = {};
  for (const raw of lines) {
    const line = String(raw).replace(/\s+/g, " ").trim();
    let m = line.match(re);
    if (m) {
      let label = m[1].replace(/[:\s]+$/, "");
      seen[label] = (seen[label] || 0) + 1;
      if (seen[label] > 1) label += " #" + seen[label];
      headers.push(label); vals.push(m[2] + (m[3] ? " " + m[3] : ""));
      continue;
    }
    m = line.match(/^([A-Za-z][^:]{1,40}):\s*(.+)$/);
    if (m) { headers.push(m[1].trim()); vals.push(m[2].trim()); }
  }
  return { kind: "pdf", headers, rows: headers.length ? [vals] : [], meta: [] };
}

/** Group pdf.js text items into lines by y (items: {str, transform:[,,,,x,y]}). */
export function itemsToLines(items) {
  const byY = new Map();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key).push(it);
  }
  return [...byY.entries()].sort((a, b) => b[0] - a[0]).map(([, its]) => its.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str.trim()).join(" "));
}

/* ---------- units ---------- */
/** Unit named in a header or value, or null. Never assumed. */
export function detectUnit(text, kind) {
  const s = String(text || "").toLowerCase().replace(/º/g, "°");
  if (kind === "pressure") {
    if (/psig/.test(s)) return "psig";
    if (/psia/.test(s)) return "psia";
    if (/kpa\s*\(?a(bs)?\)?\b/.test(s)) return "kPa(a)";
    if (/kpa/.test(s)) return "kPa";
    if (/bar\s*\(?a(bs)?\)?\b/.test(s)) return "bar(a)";
    if (/\bbar/.test(s)) return "bar";
    if (/mpa/.test(s)) return "MPa";
    if (/\bpsi\b/.test(s)) return "psi";
    return null;
  }
  if (kind === "temp") {
    if (/°\s?f|deg\s?f|\(f\)|\[f\]|\bf$/.test(s)) return "°F";
    if (/°\s?c|deg\s?c|\(c\)|\[c\]|\bc$/.test(s)) return "°C";
    return null;
  }
  return null;
}

/** Convert to psig / °F. Returns { value, note } ; note says what was assumed (shown as a flag). */
export function toPsig(v, unit) {
  const n = num(v);
  if (n == null) return { value: null };
  switch (unit) {
    case "psig": return { value: n };
    case "psi": return { value: n, note: "\"psi\" read as gauge (psig)" };
    case "psia": return { value: n - ATM_PSI, note: "psia − 14.7" };
    case "kPa": return { value: n * 0.1450377, note: "kPa read as gauge" };
    case "kPa(a)": return { value: n * 0.1450377 - ATM_PSI, note: "kPa absolute − 14.7 psi" };
    case "bar": return { value: n * 14.50377, note: "bar read as gauge" };
    case "bar(a)": return { value: n * 14.50377 - ATM_PSI, note: "bar absolute − 14.7 psi" };
    case "MPa": return { value: n * 145.0377, note: "MPa read as gauge" };
    default: return { value: null };
  }
}
export function toF(v, unit) {
  const n = num(v);
  if (n == null) return { value: null };
  if (unit === "°F") return { value: n };
  if (unit === "°C") return { value: n * 9 / 5 + 32 };
  return { value: null };
}
export function num(v) {
  const s = String(v ?? "").replace(/\s*(psig|psia|psi|kpa|bar|mpa|°?\s?[fc])\s*$/i, "").trim().replace(/^(-?\d+),(\d+)$/, "$1.$2");
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
export const round1 = (n) => Math.round(n * 10) / 10;

export function normRefrigerant(s) {
  const m = String(s || "").toUpperCase().replace(/\s+/g, "").match(/^R-?(\d{2,4}[A-Z]?)$/);
  return m ? "R-" + m[1] : null;
}

/* ---------- mapping ---------- */
export const MAP_KEY = "serviceTechGaugeMap_v1";
/** mapping: { [fieldId]: { col: headerText, unit } }. A saved mapping only applies when every mapped header is present. */
export function mappingFits(mapping, headers) {
  if (!mapping) return false;
  const cols = Object.values(mapping).map((m) => m && m.col).filter(Boolean);
  return cols.length > 0 && cols.every((c) => headers.includes(c));
}
export function loadMapping(storage, brand) {
  try { return (JSON.parse(storage.getItem(MAP_KEY) || "{}"))[brand] || null; } catch (e) { return null; }
}
export function saveMapping(storage, brand, mapping) {
  let all = {};
  try { all = JSON.parse(storage.getItem(MAP_KEY) || "{}"); } catch (e) { /* ignore */ }
  all[brand] = mapping;
  storage.setItem(MAP_KEY, JSON.stringify(all));
}
/** Suggested unit for a mapped column from its header, else from the cell text. null = tech must pick. */
export function unitFor(table, col, kind, rowIdx) {
  const i = table.headers.indexOf(col);
  if (i < 0) return null;
  return detectUnit(col, kind) || detectUnit((table.rows[rowIdx ?? table.rows.length - 1] || [])[i], kind);
}

/** Build the preview for one row. Each item: { id, label, raw, unit, value, display, flags[] }.
 *  value null => not filled. Any flag => shown in orange on the preview. */
export function buildPreview(table, mapping, rowIdx) {
  const r = rowIdx ?? table.rows.length - 1;
  const row = table.rows[r] || [];
  const items = FIELDS.map((f) => {
    const m = mapping[f.id];
    const it = { id: f.id, label: f.label, raw: "", unit: null, value: null, display: "—", flags: [] };
    if (!m || !m.col) { it.flags.push("not in the file / not mapped — not filled"); return it; }
    const i = table.headers.indexOf(m.col);
    it.raw = i >= 0 ? (row[i] ?? "") : "";
    if (f.kind === "text") {
      if (f.id === "refrigerant") {
        const rf = normRefrigerant(it.raw);
        it.value = rf;
        it.display = rf || it.raw || "—";
        if (!rf) it.flags.push(it.raw ? "not a refrigerant name — not filled" : "empty — not filled");
      } else { it.value = it.raw || null; it.display = it.raw || "—"; }
      return it;
    }
    it.unit = m.unit || null;
    if (!it.unit) { it.flags.push("unit unknown — pick it"); return it; }
    const c = f.kind === "pressure" ? toPsig(it.raw, it.unit) : toF(it.raw, it.unit);
    if (c.value == null) { it.flags.push(it.raw ? "not a number — not filled" : "empty — not filled"); return it; }
    it.value = round1(c.value);
    const tgt = f.kind === "pressure" ? "psig" : "°F";
    it.display = it.value + " " + tgt + (it.unit !== tgt ? "  (from " + it.raw.replace(/\s*[a-z°()]+$/i, "") + " " + it.unit + ")" : "");
    if (c.note) it.flags.push(c.note);
    if (f.kind === "pressure" && (it.value < -15 || it.value > 700)) it.flags.push("outside gauge range — check");
    if (f.kind === "temp" && (it.value < -60 || it.value > 250)) it.flags.push("outside line-temp range — check");
    return it;
  });
  const dis = items.find((x) => x.id === "dischargePsig");
  if (dis && dis.value != null) dis.flags.push("used as liquid pressure for subcooling (line loss not counted)");
  return { row: r, rows: table.rows.length, items };
}

/** Field values to write (only non-null items), keyed by the target form's ids. */
export function fillValues(preview) {
  const get = (id) => (preview.items.find((x) => x.id === id) || {}).value;
  const out = { suctionPsig: get("suctionPsig"), liquidPsig: get("dischargePsig"), suctionTemp: get("suctionTemp"), liquidTemp: get("liquidTemp"), refrigerant: get("refrigerant") };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out;
}
