/** "Import gauge report" UI: one step per screen — 1 File, 2 Match columns, 3 Check (Looks right), 4 Done.
 *  Everything is parsed on this phone. pdf.js / fflate are import()ed only for PDF / XLSX files.
 *  Nothing is written to the form until the tech taps "Looks right — fill". */
import { BRANDS, FIELDS, PRESSURE_UNITS, TEMP_UNITS, fileKind, parseCSV, toTable, parseXLSX, parseXML,
  pdfLinesToTable, itemsToLines, unitFor, mappingFits, loadMapping, saveMapping, buildPreview, fillValues } from "./gauge-parse.js?v=38";

export const SHARE_CACHE = "st-share";
export const SHARE_KEY = "./__shared-gauge-report";
const BRAND_KEY = "serviceTechGaugeBrand_v1";
const ACCEPT = ".csv,.txt,.xlsx,.xml,.pdf,text/csv,application/pdf,text/xml,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(text, cls, on) { const b = mk("button", "btn " + (cls || "btn-secondary"), text); b.type = "button"; b.addEventListener("click", on); return b; }

/** File -> table. Throws a plain-language Error for unsupported files. */
export async function readReport(file) {
  const kind = fileKind(file.name, file.type);
  if (kind === "csv") return toTable(parseCSV(await file.text()).rows, "csv");
  if (kind === "xml") return parseXML(await file.text());
  if (kind === "xlsx") {
    const { unzipSync } = await import("../vendor/fflate/fflate.mjs");
    return parseXLSX(new Uint8Array(await file.arrayBuffer()), unzipSync);
  }
  if (kind === "pdf") {
    const pdfjs = await import("../vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
    // No cMap/font/wasm URLs: text layer only, and nothing is fetched from another site.
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false }).promise;
    const lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      lines.push(...itemsToLines(tc.items));
    }
    await doc.destroy();
    const t = pdfLinesToTable(lines);
    if (!t.headers.length) throw new Error("No text with readings found in this PDF (a scanned/picture PDF can't be read). Enter the values by hand.");
    return t;
  }
  if (kind === "xls") throw new Error("Old .xls files aren't supported. Export as .xlsx or CSV, or enter by hand.");
  throw new Error("Pick a CSV, Excel (.xlsx), XML or PDF report.");
}

/** Shared via Android "Share" (Web Share Target): the service worker stored it in a cache. */
export async function takeSharedFile() {
  if (!("caches" in self)) return null;
  const c = await caches.open(SHARE_CACHE);
  const res = await c.match(SHARE_KEY);
  if (!res) return null;
  await c.delete(SHARE_KEY);
  const name = decodeURIComponent(res.headers.get("x-file-name") || "report");
  return new File([await res.blob()], name, { type: res.headers.get("content-type") || "" });
}

/**
 * opts.onFill(values, preview) writes fields and calculates; returns a short "where it went" text.
 * opts.refrigerants: allowed refrigerant values for the target form (others are not filled, and say so).
 */
export function mountGaugeImport(host, opts) {
  const box = mk("div", "gauge-import");
  host.appendChild(box);
  const st = { brand: localStorage.getItem(BRAND_KEY) || "", file: null, table: null, mapping: null, row: null, err: "" };

  function screen(title, n) {
    box.innerHTML = "";
    const h = mk("h2", "gi-title", title);
    if (n) h.prepend(mk("span", "gi-step", "Step " + n + " of 3 · "));
    const help = mk("a", "gi-help", "?"); help.href = "help.html#import"; help.setAttribute("aria-label", "Help: import gauge report");
    box.append(h, help);
    return box;
  }

  function start() {
    box.innerHTML = "";
    box.appendChild(btn("📄 Import gauge report", "btn-secondary gi-open", pick));
  }

  function pick() {
    screen("Import gauge report", 1);
    box.appendChild(mk("p", "gi-hint", "Pick the app the report came from, then pick the file (CSV, Excel, XML or PDF). It stays on this phone."));
    const lab = mk("label", "field"); lab.appendChild(mk("span", null, "Gauge app"));
    const sel = mk("select"); sel.id = "gi-brand";
    sel.appendChild(new Option("Choose…", ""));
    BRANDS.forEach((b) => sel.appendChild(new Option(b.label + " (" + b.formats.join("/").toUpperCase() + ")", b.id)));
    sel.value = st.brand;
    lab.appendChild(sel); box.appendChild(lab);
    const fileLab = mk("label", "btn btn-primary gi-file", "Choose report file");
    const input = mk("input"); input.type = "file"; input.accept = ACCEPT; input.id = "gi-file"; input.hidden = true;
    fileLab.appendChild(input);
    const msg = mk("p", "gi-error", st.err || ""); msg.setAttribute("aria-live", "polite");
    const go = async (file) => {
      if (!sel.value) { msg.textContent = "Choose the gauge app first."; return; }
      st.brand = sel.value; localStorage.setItem(BRAND_KEY, st.brand);
      msg.textContent = "Reading " + file.name + "…";
      try {
        st.table = await readReport(file); st.file = file; st.err = "";
        if (!st.table.rows.length) throw new Error("No readings found in this file. Enter the values by hand.");
        st.row = st.table.rows.length - 1;
        const saved = loadMapping(localStorage, st.brand);
        if (mappingFits(saved, st.table.headers)) { st.mapping = saved; check(); } else { st.mapping = saved || {}; mapCols(); }
      } catch (e) { msg.textContent = e.message || String(e); }
    };
    input.addEventListener("change", () => input.files[0] && go(input.files[0]));
    box.append(fileLab);
    if (st.file && st.fromShare) {
      box.appendChild(btn("Use shared file: " + st.file.name, "btn-primary", () => go(st.file)));
    }
    box.append(msg, btn("Enter by hand instead", "btn-secondary", start));
  }

  function mapCols() {
    screen("Match columns", 2);
    const t = st.table;
    box.appendChild(mk("p", "gi-hint", "Do this once for " + BRANDS.find((b) => b.id === st.brand).label + ". For each reading, pick the column (or line) from your file and its unit. Pick “Not in file” if it isn't there."));
    const sample = (col) => { const i = t.headers.indexOf(col); return i < 0 ? "" : (t.rows[t.rows.length - 1][i] || ""); };
    const rows = FIELDS.map((f) => {
      const wrap = mk("div", "gi-map"); wrap.dataset.field = f.id;
      const lab = mk("label", "field"); lab.appendChild(mk("span", null, f.label));
      const sel = mk("select"); sel.className = "gi-col";
      sel.appendChild(new Option("Not in file", ""));
      t.headers.forEach((h) => sel.appendChild(new Option(h + (sample(h) ? "  — e.g. " + sample(h) : ""), h)));
      const prev = st.mapping[f.id];
      sel.value = prev && t.headers.includes(prev.col) ? prev.col : "";
      lab.appendChild(sel); wrap.appendChild(lab);
      let unit = null;
      if (f.kind !== "text") {
        unit = mk("select"); unit.className = "gi-unit";
        unit.appendChild(new Option("Unit?", ""));
        (f.kind === "pressure" ? PRESSURE_UNITS.concat("psi") : TEMP_UNITS).forEach((u) => unit.appendChild(new Option(u === "psi" ? "psi (gauge?)" : u, u)));
        const setUnit = () => { unit.value = (sel.value && (unitFor(t, sel.value, f.kind, st.row) || (prev && prev.col === sel.value && prev.unit))) || ""; unit.disabled = !sel.value; };
        sel.addEventListener("change", setUnit); setUnit();
        wrap.appendChild(unit);
      }
      box.appendChild(wrap);
      return { f, sel, unit };
    });
    const msg = mk("p", "gi-error"); msg.setAttribute("aria-live", "polite");
    box.append(msg, btn("Save and continue", "btn-primary gi-save", () => {
      const m = {};
      for (const r of rows) if (r.sel.value) m[r.f.id] = { col: r.sel.value, unit: r.unit ? r.unit.value : undefined };
      if (!Object.keys(m).length) { msg.textContent = "Match at least one reading, or enter by hand."; return; }
      const noUnit = rows.filter((r) => r.sel.value && r.unit && !r.unit.value).map((r) => r.f.label);
      if (noUnit.length) { msg.textContent = "Pick the unit for: " + noUnit.join(", "); return; }
      const used = Object.values(m).map((x) => x.col);
      if (new Set(used).size !== used.length) { msg.textContent = "The same column is picked twice. Each reading needs its own column."; return; }
      st.mapping = m; saveMapping(localStorage, st.brand, m); check();
    }), btn("Cancel", "btn-secondary", start));
  }

  function check() {
    screen("Check the readings", 3);
    const pv = buildPreview(st.table, st.mapping, st.row);
    const refItem = pv.items.find((x) => x.id === "refrigerant");
    if (refItem.value && opts.refrigerants && !opts.refrigerants.includes(refItem.value)) {
      refItem.flags.push("not in this tool's list — not filled"); refItem.value = null;
    }
    const nav = mk("div", "gi-rownav");
    if (pv.rows > 1) {
      nav.append(btn("◀", "btn-secondary gi-prev", () => { st.row = Math.max(0, st.row - 1); check(); }),
        mk("span", "gi-rowtext", "Reading " + (pv.row + 1) + " of " + pv.rows + (pv.row === pv.rows - 1 ? " (last)" : "")),
        btn("▶", "btn-secondary gi-next", () => { st.row = Math.min(pv.rows - 1, st.row + 1); check(); }));
      box.appendChild(nav);
    }
    box.appendChild(mk("p", "gi-hint", "Compare with your gauge app. Orange = check it. Only values shown with a number are filled."));
    const tbl = mk("table", "gi-preview");
    for (const it of pv.items) {
      const tr = mk("tr", it.flags.length ? "gi-flag" : ""); tr.dataset.field = it.id;
      tr.append(mk("th", null, it.label), mk("td", "gi-val", it.display));
      const why = mk("td", "gi-why", it.flags.join("; ")); tr.appendChild(why);
      tbl.appendChild(tr);
    }
    box.appendChild(tbl);
    const vals = fillValues(pv);
    if (refItem.value == null) delete vals.refrigerant;
    const msg = mk("p", "gi-error");
    box.append(msg,
      btn("Looks right — fill", "btn-primary gi-ok", () => {
        if (!Object.keys(vals).length) { msg.textContent = "Nothing to fill. Change columns or enter by hand."; return; }
        const where = opts.onFill(vals, pv);
        done(vals, where);
      }),
      btn("Change columns", "btn-secondary gi-remap", mapCols),
      btn("Cancel", "btn-secondary", start));
  }

  function done(vals, where) {
    box.innerHTML = "";
    box.appendChild(mk("h2", "gi-title", "Done"));
    const names = { suctionPsig: "suction pressure", liquidPsig: "liquid pressure (from discharge)", suctionTemp: "suction line temp", liquidTemp: "liquid line temp", refrigerant: "refrigerant" };
    box.appendChild(mk("p", "gi-hint", "Filled: " + Object.keys(vals).map((k) => names[k]).join(", ") + ". " + (where || "") + " You can still edit any field."));
    box.appendChild(btn("Import another", "btn-secondary", pick));
  }

  start();
  takeSharedFile().then((f) => { if (f) { st.file = f; st.fromShare = true; pick(); } }).catch(() => {});
  return { pick };
}
