import test from "node:test";
import assert from "node:assert/strict";
import { cardPlate, getCardPlate, saveCardScan, DRAFT_KEY, CARD_SCAN_KEY } from "../tools/card-plate.js";
import { plateSummary } from "../tools/plate-scan.js";
import { pickTree } from "../tools/tree-pick.js";

const v = { brand: "Fujitsu", unitType: "indoor", model: "ASUG15LZAS", serial: "WW015057", refrigerant: "R-410A", voltage: "208/230" };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; };

test("no call card open (no Data plate text): null, so Troubleshooting keeps the old behavior", () => {
  assert.equal(cardPlate({ plate: "" }, { summary: "x", brand: "Fujitsu" }), null);
  assert.equal(cardPlate(null, null), null);
  assert.equal(getCardPlate(mem()), null);
});

test("card scan persists in localStorage with the draft and round-trips", () => {
  const s = mem();
  saveCardScan(v, s);
  s.setItem(DRAFT_KEY, JSON.stringify({ plate: plateSummary(v), refrigerant: "R-410A", equipment: "mini-split" }));
  const p = getCardPlate(s);
  assert.ok(JSON.parse(s.getItem(CARD_SCAN_KEY)).at);
  for (const k of ["brand", "model", "serial", "unitType", "refrigerant"]) assert.equal(p[k], v[k], k);
  assert.equal(p.equipment, "mini-split");
  assert.equal(p.edited, false);
  assert.equal(pickTree(p).tree, "mini-split");
});

test("hand-edits on the card win: model in Data plate, Refrigerant field, Equipment", () => {
  const rec = Object.assign({ summary: plateSummary(v) }, v);
  const p = cardPlate({ plate: plateSummary(v).replace("ASUG15LZAS", "ASUG12LZAS"), refrigerant: "R-32", equipment: "split" }, rec);
  assert.equal(p.model, "ASUG12LZAS"); assert.equal(p.brand, "Fujitsu"); assert.equal(p.serial, "WW015057");
  assert.equal(p.refrigerant, "R-32"); assert.equal(p.equipment, "split"); assert.equal(p.edited, true);
  const q = cardPlate({ plate: "Carrier Model 24ACC636A003 | S/N 1234X" }, rec);
  assert.equal(q.brand, "Carrier"); assert.equal(q.model, "24ACC636A003"); assert.notEqual(q.serial, "WW015057");
});

test("typed-only card (no scan) still drives Troubleshooting", () => {
  const p = cardPlate({ plate: "Carrier Model 24ACC636A003" }, null);
  assert.equal(p.brand, "Carrier"); assert.equal(pickTree(p).tree, "split-ac-hp");
});
