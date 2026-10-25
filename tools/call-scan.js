/** Call card: "Scan data plate" in the Open panel. Writes into the form only on Confirm.
 *  Also shows manual links for the plate's brand/model and picks the troubleshooting tree. */
import { mountPlateScan, plateSummary } from "./plate-scan.js?v=10";
import { parsePlate } from "./plate-parse.js?v=10";
import { loadManualsIndex, findManuals, renderManuals } from "./manuals.js?v=10";
import { chooseTree, treeHref } from "./trees.js?v=10";

const SCAN_KEY = "serviceTechLastScan_v1";

function set(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === "") return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true })); // app.js saves the draft on input
}

/** Brand/model for the manuals lookup: the confirmed scan, else whatever is typed in the Data plate box. */
function plateIdentity() {
  const text = (document.getElementById("plate") || {}).value || "";
  let scan = null;
  try { scan = JSON.parse(localStorage.getItem(SCAN_KEY) || "null"); } catch (e) { /* ignore */ }
  if (scan && scan.summary === text) return scan;
  if (!text.trim()) return {};
  const f = parsePlate({ text: text.replace(/\s*\|\s*/g, "\n") }).fields;
  return { brand: f.brand && f.brand.value, model: f.model && f.model.value, unitType: f.unitType && f.unitType.value };
}

async function refresh() {
  const id = plateIdentity();
  const host = document.getElementById("manuals-host");
  if (host) {
    if (!id.brand && !id.model) host.innerHTML = "";
    else {
      try { const index = await loadManualsIndex(); renderManuals(host, findManuals(index, id), id); }
      catch (e) { host.textContent = "Manuals index unavailable."; }
    }
  }
  const link = document.getElementById("tree-link");
  if (link) {
    const t = chooseTree({ equipment: (document.getElementById("equipment") || {}).value, ...id });
    link.href = t ? treeHref(t) : "tree.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const host = document.getElementById("plate-scan-host");
  if (host) mountPlateScan(host, (v) => {
    set("refrigerant", v.refrigerant);
    set("fla", v.rla); // rated compressor RLA as the amps reference (the measured Voltage field is left alone)
    const summary = plateSummary(v);
    try { localStorage.setItem(SCAN_KEY, JSON.stringify({ brand: v.brand, model: v.model, unitType: v.unitType, summary })); } catch (e) { /* ignore */ }
    set("plate", summary);
    refresh();
  });
  ["plate", "equipment"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("input", refresh); el.addEventListener("change", refresh); }
  });
  setTimeout(refresh, 0); // after app.js restores the draft
});
