/** Call card (call.html) extras: inline SH/SC on Readings, amps % of plate RLA/FLA, total time on Close,
 *  quick-phrase chips on Mid/Close, and the extra Copy lines (app.js calls self.stCallCopyExtras). Offline only. */
import { inlineShSc, shScLines, ampsReference, ampsPercent, ampsLine, totalTime, PHRASES, appendPhrase, headerLines, readingsExtraLines } from "./call-extras.js?v=30";
import { DRAFT_KEY, CARD_SCAN_KEY } from "./card-plate.js?v=30";

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null") || null; } catch (e) { return null; } };
const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) || {}).value || "";
const FORM = ["refrigerant", "suctionPsig", "suctionTemp", "liquidPsig", "liquidTemp", "amps", "fla", "plate", "startDate", "startTime", "endDate", "endTime", "workOrder", "techName"];
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
    for (const ph of PHRASES) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip phrase-chip"; b.textContent = ph;
      b.addEventListener("click", () => {
        const r = appendPhrase(ta.value, ph);
        ta.value = r.value;
        ta.focus();
        ta.setSelectionRange(r.selStart, r.selEnd);
        ta.dispatchEvent(new Event("input", { bubbles: true })); // app.js saves the draft
      });
      box.appendChild(b);
    }
  });
}

self.stCallCopyExtras = (d) => ({ header: headerLines(d), readings: readingsExtraLines(d, read(CARD_SCAN_KEY)) });

function init() {
  chips();
  render();
  document.addEventListener("input", render);
  document.addEventListener("change", render);
  document.addEventListener("st:draft", render);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
