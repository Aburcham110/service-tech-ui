/** Call card (call.html) extras: inline SH/SC on Readings, amps % of plate RLA/FLA, total time on Close,
 *  quick-phrase chips on Mid/Close, and the extra Copy lines (app.js calls self.stCallCopyExtras). Offline only. */
import { inlineShSc, shScLines, ampsReference, ampsPercent, ampsLine, totalTime, PHRASES, CLOSE_PHRASES, appendPhrase, parseParts, partsLines, headerLines, readingsExtraLines } from "./call-extras.js?v=40";
import { psychroHref, carried } from "./psychro-link.js?v=40";
import { DRAFT_KEY, CARD_SCAN_KEY } from "./card-plate.js?v=40";

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null") || null; } catch (e) { return null; } };
const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) || {}).value || "";
const FORM = ["supplyTemp", "returnTemp", "refrigerant", "suctionPsig", "suctionTemp", "liquidPsig", "liquidTemp", "amps", "fla", "plate", "startDate", "startTime", "endDate", "endTime", "workOrder", "techName"];
/** Current values from the form (falls back to the saved draft for fields not on the page). */
function current() {
  const d = Object.assign({}, read(DRAFT_KEY) || {});
  for (const k of FORM) if ($(k)) d[k] = val(k);
  return d;
}

function render() {
  const d = current();
  const sh = $("shsc-inline");
  if (sh) {
    const r = inlineShSc(d);
    sh.innerHTML = "";
    sh.dataset.state = r.state;
    if (r.state === "incomplete") sh.textContent = "Superheat / subcool: fill " + r.missing.join(", ") + " (refrigerant is on Open).";
    else if (r.state === "error") sh.textContent = r.message;
    else {
      const [l1, l2, l3] = shScLines(r);
      const big = (cls, label, v) => { const p = document.createElement("p"); p.className = "shsc-val " + cls; const b = document.createElement("strong"); b.textContent = label + ": " + v.toFixed(1) + " °F"; p.appendChild(b); return p; };
      sh.append(big("shsc-sh", "Superheat", r.superheat.value), big("shsc-sc", "Subcool", r.subcool.value));
      const small = document.createElement("small"); small.className = "shsc-basis";
      small.textContent = [l1.replace(/^Superheat: [^(]+/, "SH "), l2.replace(/^Subcool: [^(]+/, "SC "), l3 + ". Same math as the SH / Subcool tool. Compare with the OEM charging chart."].join(" · ");
      sh.appendChild(small);
    }
  }
  const ap = $("amps-pct");
  if (ap) {
    const p = ampsPercent(d.amps, ampsReference(d, read(CARD_SCAN_KEY)));
    ap.textContent = p ? ampsLine(p) : "";
    ap.hidden = !p;
  }
  const pl = $("psy-link");
  if (pl) {
    pl.href = psychroHref(d);
    const c = carried(d);
    $("psy-link-note").textContent = c.ret && c.sup ? "Carries supply and return dry bulb (°F). Add RH or wet bulb there." : "Fill supply and return air (°F) first, or open it and type them.";
  }
  const tt = $("total-time");
  if (tt) {
    const t = totalTime(d.startTime, d.endTime, d.startDate, d.endDate);
    tt.textContent = t ? "Total time: " + t.text : "Total time: set start (Open) and end time.";
  }
}

function chips() {
  document.querySelectorAll(".phrase-chips").forEach((box) => {
    const ta = $(box.dataset.for);
    if (!ta || box.children.length) return;
    for (const ph of (box.dataset.set === "close" ? CLOSE_PHRASES : PHRASES)) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip phrase-chip"; b.textContent = ph;
      b.addEventListener("click", () => {
        const r = appendPhrase(ta.value, ph);
        ta.value = r.value;
        ta.focus();
        ta.setSelectionRange(r.selStart, r.selEnd);
        ta.dispatchEvent(new Event("input", { bubbles: true })); // app.js saves the draft
        if (typeof self.stToast === "function") self.stToast("Added: " + (ph.length > 32 ? ph.slice(0, 32) + "…" : ph));
      });
      box.appendChild(b);
    }
  });
}

/* Parts list: rows live in the hidden #partsList (JSON) so app.js saves/fills it like any field. */
function partsSave(rows) {
  const h = $("partsList"); if (!h) return;
  h.value = JSON.stringify(rows);
  const old = $("partsUsed"); if (old) old.value = ""; // migrated into rows
  h.dispatchEvent(new Event("input", { bubbles: true }));
}
function partsRender() {
  const host = $("parts-rows"); if (!host) return;
  const rows = parseParts({ partsList: val("partsList"), partsUsed: val("partsUsed") });
  host.innerHTML = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div"); row.className = "part-row"; row.dataset.i = i;
    const f = (k, label, cls, mode) => {
      const l = document.createElement("label"); l.className = "field " + cls;
      const sp = document.createElement("span"); sp.textContent = label;
      const inp = document.createElement("input"); inp.className = "part-" + k; inp.value = r[k]; inp.autocomplete = "off"; if (mode) inp.inputMode = mode;
      inp.addEventListener("input", () => { const cur = parseParts({ partsList: val("partsList"), partsUsed: val("partsUsed") }); cur[i][k] = inp.value; partsSave(cur); });
      l.append(sp, inp); return l;
    };
    const top = document.createElement("div"); top.className = "row";
    top.append(f("part", "Part " + (i + 1), "pf-name"), f("qty", "Qty (ea)", "pf-qty", "decimal"));
    const rm = document.createElement("button"); rm.type = "button"; rm.className = "link-btn part-remove"; rm.textContent = "Remove part " + (i + 1);
    rm.addEventListener("click", () => { const cur = parseParts({ partsList: val("partsList"), partsUsed: val("partsUsed") }); cur.splice(i, 1); partsSave(cur); partsRender(); });
    row.append(top, f("note", "Note (optional)", "pf-note"), rm);
    host.appendChild(row);
  });
}
function partsInit() {
  const add = $("parts-add"); if (!add) return;
  add.addEventListener("click", () => {
    const cur = parseParts({ partsList: val("partsList"), partsUsed: val("partsUsed") }); cur.push({ part: "", qty: "1", note: "" });
    partsSave(cur); partsRender();
    const ins = document.querySelectorAll("#parts-rows .part-part"); if (ins.length) ins[ins.length - 1].focus();
  });
  partsRender();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(partsRender, 0)); else setTimeout(partsRender, 0); // after app.js fills the form
  // Clear draft / other tabs: re-render when the hidden value no longer matches the rows on screen.
  document.addEventListener("st:draft", () => setTimeout(() => { const n = document.querySelectorAll("#parts-rows .part-row").length; if (n !== parseParts({ partsList: val("partsList"), partsUsed: val("partsUsed") }).length) partsRender(); }, 0));
}
self.stCallPartsLines = (d) => partsLines(parseParts(d));

self.stCallCopyExtras = (d) => ({ header: headerLines(d), readings: readingsExtraLines(d, read(CARD_SCAN_KEY)) });

function init() {
  chips();
  partsInit();
  render();
  document.addEventListener("input", render);
  document.addEventListener("change", render);
  document.addEventListener("st:draft", render);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
