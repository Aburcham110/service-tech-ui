/** Call card: "Scan data plate" in the Open panel. Writes into the form only on Confirm. */
import { mountPlateScan, plateSummary } from "./plate-scan.js?v=7";

function set(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === "") return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true })); // app.js saves the draft on input
}

document.addEventListener("DOMContentLoaded", () => {
  const host = document.getElementById("plate-scan-host");
  if (!host) return;
  mountPlateScan(host, (v) => {
    set("refrigerant", v.refrigerant);
    set("fla", v.rla); // rated compressor RLA as the amps reference (the measured Voltage field is left alone)
    set("plate", plateSummary(v));
  });
});
