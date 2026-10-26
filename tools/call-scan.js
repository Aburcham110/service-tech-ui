/** Call card: "Scan data plate" in the Open panel. After Confirm, "Add to call card" writes the
 *  plate (brand, model, serial, refrigerant, charge…) into the Open step; nothing is written before that.
 *  Also shows manual links for the plate's brand/model and picks the troubleshooting tree. */
import { mountPlateScan } from "./plate-scan.js?v=14";
import { callCardFill, renderScanActions, saveScan, SCAN_KEY } from "./call-card.js?v=14";
import { parsePlate } from "./plate-parse.js?v=14";
import { loadManualsIndex, findManuals, renderManuals } from "./manuals.js?v=14";
import { chooseTree, treeHref } from "./trees.js?v=14";
import { getLastPlate, summaryRows, plateOnCard } from "./last-plate.js?v=14";


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

/** "Scanned equipment" box at the top of Open: what the last added scan put on this card. The fields
 *  below (Refrigerant, Data plate…) stay plain editable inputs; this box is read-only context. */
function renderSummary() {
  const box = document.getElementById("scanned-summary");
  if (!box) return;
  const p = getLastPlate();
  const on = plateOnCard(p, (document.getElementById("plate") || {}).value);
  box.hidden = !on;
  box.innerHTML = "";
  if (!on) return;
  const h = document.createElement("strong"); h.textContent = "Scanned equipment"; box.appendChild(h);
  const dl = document.createElement("dl");
  summaryRows(p).forEach(([l, v]) => { const dt = document.createElement("dt"); dt.textContent = l; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); });
  box.appendChild(dl);
  const n = document.createElement("small"); n.className = "footer-note"; n.textContent = "Pre-filled from the scan — edit any field below before continuing."; box.appendChild(n);
}

function goReadings() {
  const pill = document.querySelector('.step-pill[data-step="readings"]');
  if (pill) { pill.click(); window.scrollTo(0, 0); }
}

async function refresh() {
  renderSummary();
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
    renderScanActions(host, v, {
      equipment: () => (document.getElementById("equipment") || {}).value,
      onReadings: goReadings,
      onAdd: (vals) => {
        const fill = callCardFill(vals);
        Object.entries(fill).forEach(([k, val]) => set(k, val));
        saveScan(vals); // after set("plate"): the stored summary now matches the Data plate box
        refresh();
      },
    });
  });
  ["plate", "equipment"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("input", refresh); el.addEventListener("change", refresh); }
  });
  setTimeout(refresh, 0); // after app.js restores the draft
});
