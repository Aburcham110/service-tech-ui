/** Confirmed plate scan -> call card (Open step), and the scan's follow-up actions. */
import { plateSummary } from "./plate-scan.js?v=12";
import { chooseTree, treeHref } from "./trees.js?v=12";

export const SCAN_KEY = "serviceTechLastScan_v1";
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

/** "Start troubleshooting for this equipment": the matching tree, with the refrigerant carried along. */
export function troubleshootHref(v, equipment) {
  const t = chooseTree({ equipment, unitType: v && v.unitType, brand: v && v.brand, model: v && v.model });
  if (!t) return "tree.html";
  return treeHref(t) + (v && v.refrigerant ? "&refrigerant=" + encodeURIComponent(v.refrigerant) : "");
}

export function saveScan(v) {
  try {
    localStorage.setItem(SCAN_KEY, JSON.stringify({ brand: v.brand, model: v.model, serial: v.serial, unitType: v.unitType,
      refrigerant: v.refrigerant, charge: v.charge, summary: plateSummary(v) }));
  } catch (e) { /* private mode: ignore */ }
}

/** Buttons shown after a confirmed scan. onAdd() does the fill; returns the container. */
export function renderScanActions(host, v, { onAdd, equipment } = {}) {
  host.querySelector(".scan-actions")?.remove();
  const box = document.createElement("div");
  box.className = "scan-actions";
  const add = document.createElement("button");
  add.type = "button"; add.className = "btn btn-primary"; add.id = "btn-add-to-call";
  add.textContent = "Add to call card";
  add.addEventListener("click", () => { onAdd(v); add.textContent = "Added to call card ✓"; });
  const go = document.createElement("a");
  go.className = "btn btn-secondary"; go.id = "btn-start-troubleshooting";
  go.href = troubleshootHref(v, typeof equipment === "function" ? equipment() : equipment);
  go.textContent = "Start troubleshooting for this equipment";
  if (typeof equipment === "function") go.addEventListener("click", () => { go.href = troubleshootHref(v, equipment()); });
  box.append(add, go);
  host.appendChild(box);
  return box;
}
