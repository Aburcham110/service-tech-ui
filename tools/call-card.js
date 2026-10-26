/** Confirmed plate scan -> call card (Open step), and the scan's follow-up actions. */
import { plateSummary } from "./plate-scan.js?v=22";
import { scanTreeHref } from "./tree-pick.js?v=22";

import { saveLastPlate, nominalVoltage, SCAN_KEY } from "./last-plate.js?v=22";
import { whereItWent } from "./scan-flow.js?v=22";
import { saveCardScan } from "./card-plate.js?v=22";
export { SCAN_KEY };
export const DRAFT_KEY = "serviceTechCallDraft_v1"; // app.js STORAGE_KEY

/** Call-card fields for confirmed plate values: the Data plate line carries brand, model, serial,
 *  refrigerant and charge (plus electrical); refrigerant gets its own field; RLA is the amps reference. */
export function callCardFill(v) {
  const out = {};
  const plate = plateSummary(v || {});
  if (plate) out.plate = plate;
  if (v && v.refrigerant) out.refrigerant = v.refrigerant;
  if (v && v.rla) out.fla = v.rla;
  return out;
}

/** Draft with the scan applied (other call-card fields untouched). */
export function mergeIntoDraft(draft, v) {
  return Object.assign({}, draft || {}, callCardFill(v));
}

/** "Start troubleshooting for this equipment": tree.html opened from the scan (tree-pick.js picks the
 *  tree from brand/model/unit type; the page re-checks against the manuals index and asks when unsure). */
export function troubleshootHref(v, equipment) {
  return scanTreeHref(v || {}, equipment);
}

/** A plate sent to the call card: the last scanned plate (last-plate.js) and this card's plate (card-plate.js). */
export function saveScan(v) { saveLastPlate(v); saveCardScan(v); }

/** Tool links for a confirmed plate: SH/SC with the refrigerant, electrical with nameplate voltage + RLA. */
export function scanToolLinks(v) {
  const out = [];
  const sh = new URLSearchParams({ id: "superheat-subcool" });
  if (v && v.refrigerant) sh.set("refrigerant", v.refrigerant);
  out.push({ tool: "superheat-subcool", label: "Check superheat/subcool", href: "tool.html?" + sh });
  const el = new URLSearchParams({ id: "electrical" });
  const nv = nominalVoltage(v && v.voltage);
  if (nv) el.set("nominalV", String(nv));
  if (v && v.rla) el.set("rla", v.rla);
  out.push({ tool: "electrical", label: "Check amps vs FLA", href: "tool.html?" + el });
  return out;
}

/**
 * Actions shown after a confirmed scan (both primary): "Add to call card" and "Start troubleshooting for
 * this equipment", then one-tap tool links. The plate is stored as the last scanned plate on confirm.
 * After Add: "Added — open call card" (link) and, when onReadings is given, "Go to Readings".
 */
export function renderScanActions(host, v, { onAdd, equipment, onReadings, callHref = "call.html" } = {}) {
  saveLastPlate(v);
  host.querySelector(".scan-actions")?.remove();
  const mk = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const box = mk("div", "scan-actions", "");
  const add = mk("button", "btn btn-primary", "Add to call card");
  add.type = "button"; add.id = "btn-add-to-call";
  const go = mk("a", "btn btn-primary", "Start troubleshooting for this equipment");
  go.id = "btn-start-troubleshooting";
  go.href = troubleshootHref(v, typeof equipment === "function" ? equipment() : equipment);
  if (typeof equipment === "function") go.addEventListener("click", () => { go.href = troubleshootHref(v, equipment()); });
  const done = mk("div", "scan-added", "");
  done.hidden = true; done.setAttribute("role", "status");
  add.addEventListener("click", () => {
    onAdd && onAdd(v);
    add.textContent = "Added to call card ✓"; add.disabled = true;
    done.innerHTML = "";
    const link = mk("a", "scan-added-link", "Added — open call card"); link.id = "link-open-call"; link.href = callHref;
    done.appendChild(link);
    if (onReadings) {
      const r = mk("button", "btn btn-secondary", "Go to Readings →"); r.type = "button"; r.id = "btn-go-readings";
      r.addEventListener("click", onReadings);
      done.appendChild(r);
    }
    done.hidden = false;
  });
  const tools = mk("div", "scan-tools", "");
  scanToolLinks(v).forEach((q) => { const a = mk("a", "chip scan-tool-link", q.label + " →"); a.href = q.href; a.dataset.tool = q.tool; tools.appendChild(a); });
  box.append(add, go, done, tools);
  host.appendChild(box);
  return box;
}

/** Manuals page for the plate (the manuals helper shows the model-level match and portals). */
export function manualHref(v) {
  const q = new URLSearchParams();
  if (v && v.brand) q.set("brand", v.brand);
  if (v && v.model) q.set("model", v.model);
  return "manuals.html" + (String(q) ? "?" + q : "");
}

/**
 * Done screen after "Fill call card": where the data went, one primary action, then links to the
 * call card, the manual and troubleshooting. primary: { label, onClick } or { label, href }.
 */
export function renderDone(host, v, { equipment, primary, onCard = true, callHref = "call.html", onScanAgain } = {}) {
  saveLastPlate(v);
  host.querySelector(".scan-done")?.remove();
  host.querySelector(".scan-actions")?.remove();
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = mk("div", "scan-done"); box.setAttribute("role", "status");
  box.appendChild(mk("h2", null, "✓ Plate saved"));
  box.appendChild(mk("p", "scan-done-lead", "Here’s where the data went:"));
  const ul = mk("ul", "scan-done-where");
  whereItWent(v, { onCard }).forEach((t) => ul.appendChild(mk("li", null, t)));
  box.appendChild(ul);
  const p = primary || { label: "Open call card", href: callHref };
  const main = mk(p.href ? "a" : "button", "btn btn-primary btn-big scan-done-primary", p.label);
  main.id = "btn-done-primary";
  if (p.href) main.href = p.href; else { main.type = "button"; main.addEventListener("click", p.onClick); }
  box.appendChild(main);
  const links = mk("div", "scan-done-links");
  const eq = () => (typeof equipment === "function" ? equipment() : equipment);
  const call = mk("a", "link-btn", "Call card"); call.id = "link-open-call"; call.href = callHref;
  const man = mk("a", "link-btn", "Manual for " + ([v.brand, v.model].filter(Boolean).join(" ") || "this unit")); man.id = "link-done-manual"; man.href = manualHref(v);
  const tr = mk("a", "link-btn", "Troubleshooting"); tr.id = "link-done-tree"; tr.href = troubleshootHref(v, eq());
  tr.addEventListener("click", () => { tr.href = troubleshootHref(v, eq()); });
  links.append(call, man, tr);
  box.appendChild(links);
  const tools = mk("div", "scan-tools");
  scanToolLinks(v).forEach((q) => { const a = mk("a", "chip scan-tool-link", q.label + " →"); a.href = q.href; a.dataset.tool = q.tool; tools.appendChild(a); });
  box.appendChild(tools);
  if (onScanAgain) { const a = mk("button", "link-btn scan-again", "Scan another plate"); a.type = "button"; a.addEventListener("click", onScanAgain); box.appendChild(a); }
  host.appendChild(box);
  if (box.scrollIntoView) box.scrollIntoView({ block: "start", behavior: "smooth" });
  return box;
}
