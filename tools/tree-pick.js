/**
 * After a scan: which troubleshooting tree fits the scanned unit. Uses, in order:
 *   1. the scanner's unit type "compressor" (a bare compressor nameplate),
 *   2. brand (aliases resolved through the manuals index: Bohn -> Heatcraft, Coleman/UPG -> York …)
 *      plus model-number patterns,
 *   3. the scanner's indoor/outdoor type,
 *   4. the call card's equipment select (only when the scan itself doesn't settle it — its default is "cooler").
 * Returns { tree, certain, choices, why }. When not certain, choices holds the 2–3 likely trees.
 * Generic routing only: no model-specific codes or specs live here.
 */
import { brandKey, matchModel } from "./manuals.js?v=31";

export const TREE_LABELS = {
  "mini-split": "Ductless mini-split",
  "split-ac-hp": "Split AC / heat pump",
  compressor: "Compressor",
  "walk-in": "Walk-in / refrigeration",
};

const SPLIT = ["split-ac-hp", "mini-split"];
// Model-number patterns (series prefixes printed on the plates).
const PATTERNS = [
  // Fujitsu wall-mount/ductless indoor (AS..) and outdoor (AO..) units
  { brand: "Fujitsu", re: /^A[SO]U/, tree: "mini-split", why: "Fujitsu ASU/AOU (ductless) model" },
  // Mitsubishi Electric M-series ductless: MSZ/MUZ/MXZ/MFZ/MLZ/SEZ/SUZ/PKA/SLZ
  { brand: "Mitsubishi Electric", re: /^(MSZ|MUZ|MXZ|MFZ|MLZ|SEZ|SUZ|SLZ|PKA)/, tree: "mini-split", why: "Mitsubishi M-series ductless model" },
  // Daikin ducted FIT/DX/DZ split systems vs Daikin ductless (FTX/FTK/RX/RK/CTX/FDMQ/MXS)
  { brand: "Daikin", re: /^(DX|DZ)/, tree: "split-ac-hp", why: "Daikin DX/DZ ducted split model" },
  { brand: "Daikin", re: /^(FTX|FTK|RX|RK|CTX|FDMQ|MXS|FVX|FFQ)/, tree: "mini-split", why: "Daikin ductless model" },
  // LG ductless indoor/outdoor and Multi F
  { brand: "LG", re: /^(LS|LA|LMU|LMN|LSU|LSN|LAU|LAN|KUSX)/, tree: "mini-split", why: "LG ductless model" },
];
// Brand-level routing when no pattern decides.
const BRANDS = {
  Copeland: { tree: "compressor", certain: true, why: "Copeland compressor" },
  Tecumseh: { tree: "compressor", certain: true, why: "Tecumseh compressor" },
  Heatcraft: { tree: "walk-in", certain: true, why: "Heatcraft/Bohn refrigeration" },
  Manitowoc: { choices: ["walk-in", "compressor"], why: "Manitowoc ice machine — no ice-machine tree; pick the closest" },
  Carrier: { tree: "split-ac-hp", certain: true, why: "Carrier split system" },
  Trane: { tree: "split-ac-hp", certain: true, why: "Trane split system" },
  Goodman: { tree: "split-ac-hp", certain: true, why: "Goodman split system" },
  Lennox: { tree: "split-ac-hp", certain: true, why: "Lennox split system" },
  Rheem: { tree: "split-ac-hp", certain: true, why: "Rheem/Ruud split system" },
  York: { tree: "split-ac-hp", certain: true, why: "York/UPG split system" },
  Fujitsu: { choices: ["mini-split", "split-ac-hp"], why: "Fujitsu — model doesn't say ductless or ducted" },
  "Mitsubishi Electric": { choices: ["mini-split", "split-ac-hp"], why: "Mitsubishi — model doesn't say ductless or ducted" },
  Daikin: { choices: ["mini-split", "split-ac-hp"], why: "Daikin — model doesn't say ductless or ducted" },
  LG: { choices: ["mini-split", "split-ac-hp"], why: "LG — model doesn't say ductless or ducted" },
};
const EQUIP = { "mini-split": "mini-split", cooler: "walk-in", freezer: "walk-in", rack: "walk-in", rtu: "split-ac-hp", split: "split-ac-hp" };
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sure = (tree, why) => ({ tree, certain: true, choices: [tree], why });
const ask = (choices, why, hint) => {
  const c = [...new Set(hint && choices.includes(hint) ? [hint, ...choices] : choices)].slice(0, 3);
  return { tree: null, certain: false, choices: c, why };
};

/** Brand key: from the plate brand (aliases), else from an exact model match in the index. */
export function scanBrand(index, { brand, model } = {}) {
  const k = index ? brandKey(index, brand) : null;
  if (k) return k;
  if (/^mitsubishi(\s+electric)?$/i.test(String(brand || "").trim())) return "Mitsubishi Electric"; // plates often say just MITSUBISHI
  if (index && model) { const m = matchModel(index, { model }); if (m.kind === "exact") return m.brand; }
  return brand ? String(brand) : null;
}

export function pickTree({ brand, model, unitType, equipment } = {}, index = null) {
  const ut = String(unitType || "").toLowerCase();
  const eq = EQUIP[String(equipment || "").toLowerCase()] || null;
  if (ut === "compressor") return sure("compressor", "Scanner read a compressor nameplate");
  if (ut === "condensing unit") return sure("walk-in", "Scanner read a walk-in condensing unit plate");
  const b = scanBrand(index, { brand, model });
  const m = norm(model);
  const p = b && m && PATTERNS.find((x) => x.brand === b && x.re.test(m));
  if (p) return sure(p.tree, p.why);
  const r = b && BRANDS[b];
  if (r && r.certain) return sure(r.tree, r.why);
  if (r) return ask(r.choices, r.why, eq);
  if (ut === "indoor" || ut === "outdoor" || ut === "packaged") {
    if (eq && SPLIT.includes(eq)) return sure(eq, "Scanned " + ut + " unit; call card says " + equipment);
    return ask(SPLIT, "Scanned " + ut + " unit of an unlisted brand");
  }
  if (eq) return sure(eq, "Call card equipment: " + equipment);
  return ask(["split-ac-hp", "mini-split", "walk-in"], "Nothing on the plate says which equipment this is");
}

/** tree.html link for a scan: the tree (when certain) plus the scan identity for the header. */
export function scanTreeHref(v = {}, equipment, index = null) {
  const pick = pickTree({ brand: v.brand, model: v.model, unitType: v.unitType, equipment }, index);
  const q = new URLSearchParams({ from: "scan" });
  if (pick.certain) q.set("type", pick.tree); else q.set("choose", pick.choices.join(","));
  for (const k of ["brand", "model", "unitType", "refrigerant"]) if (v[k]) q.set(k, v[k]);
  if (equipment) q.set("equipment", equipment);
  return "tree.html?" + q;
}

/**
 * Header link for the scanned model. Uses the index's own doc for this model (exact/prefix match);
 * an error-code section is linked only when that doc carries one (doc.errorCodes {url, label}) — anchors
 * and page numbers are never guessed. Otherwise: the Manuals helper for this brand/model.
 */
export function manualLink(index, { brand, model } = {}) {
  const m = index && model ? matchModel(index, { brand, model }) : null;
  const doc = m && (m.kind === "exact" || m.kind === "prefix") ? m.docs[0] : null;
  if (doc && doc.errorCodes && doc.errorCodes.url) return { href: doc.errorCodes.url, label: doc.errorCodes.label || "Error codes — " + doc.title, external: true, kind: "error-codes" };
  if (doc) return { href: doc.url, label: doc.title + (doc.docType ? " (" + doc.docType + ")" : ""), external: true, kind: m.kind };
  const q = new URLSearchParams(); if (brand) q.set("brand", brand); if (model) q.set("model", model);
  return { href: "manuals.html" + (String(q) ? "?" + q : ""), label: "Find the manual", external: false, kind: "helper" };
}
