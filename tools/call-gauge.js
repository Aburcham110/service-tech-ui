/** Call card Readings: "Import gauge report" -> fills suction/liquid psig and line temps (+ refrigerant on Open),
 *  then shows superheat/subcooling from the SH/Subcool tool's math. Manual entry stays as is. */
import { mountGaugeImport, SHARE_CACHE, SHARE_KEY } from "./gauge-import.js?v=30";
import { runTool } from "./logic.js?v=30";
import { getTool } from "./registry.js";

const REFS = getTool("superheat-subcool").fields.find((f) => f.name === "refrigerant").options.map((o) => o[0]);

function set(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.classList.add("imported");
  el.dispatchEvent(new Event("input", { bubbles: true })); // app.js saves the draft on input
}

document.addEventListener("DOMContentLoaded", async () => {
  const host = document.getElementById("gauge-import-host");
  if (!host) return;
  const out = document.createElement("pre");
  out.className = "out gi-calc";
  out.hidden = true;
  mountGaugeImport(host, {
    onFill(vals) {
      document.querySelectorAll("#panel-readings .imported, #refrigerant.imported").forEach((el) => el.classList.remove("imported"));
      for (const [k, v] of Object.entries(vals)) set(k, v);
      const g = (id) => (document.getElementById(id) || {}).value || "";
      const ref = g("refrigerant");
      out.hidden = false;
      if (!REFS.includes(ref)) {
        out.textContent = "Superheat/subcooling not calculated: refrigerant " + (ref ? "“" + ref + "” isn't in the PT tables" : "is empty") + ". Readings were filled.";
      } else {
        out.textContent = runTool("superheat-subcool", { mode: "both", refrigerant: ref, suctionPsig: g("suctionPsig"), suctionTemp: g("suctionTemp"), liquidPsig: g("liquidPsig"), liquidTemp: g("liquidTemp") }).lines.join("\n");
      }
      return "Readings filled" + (vals.refrigerant ? "; refrigerant is on the Open step" : "") + ". Superheat/subcooling are below.";
    },
  });
  host.after(out);
  // Shared from another app: jump to Readings so the import screen is visible.
  try {
    if ("caches" in self && await (await caches.open(SHARE_CACHE)).match(SHARE_KEY)) document.querySelector('.step-pill[data-step="readings"]')?.click();
  } catch (e) { /* ignore */ }
});
