import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as X from "../tools/call-extras.js";
import { runTool } from "../tools/logic.js";
import { PT } from "../tools/pt-tables.js";

const R = { refrigerant: "R-410A", suctionPsig: "118.4", suctionTemp: "52.3", liquidPsig: "331", liquidTemp: "94.8" };

test("inline SH/SC = SH/Subcool tool, for every PT table and a spread of readings", () => {
  for (const ref of Object.keys(PT)) {
    const t = PT[ref], lo = t[2], hi = t[t.length - 3];
    for (const [sp, lp] of [[lo[1] + 0.3, hi[2] - 0.7], [t[10][1], t[25][2]], [t[16][1] + 1.1, t[28][2]]]) {
      const f = { refrigerant: ref, suctionPsig: String(sp), suctionTemp: "48.7", liquidPsig: String(lp), liquidTemp: "88.2" };
      const r = X.inlineShSc(f);
      assert.equal(r.state, "ok", ref);
      const lines = runTool("superheat-subcool", Object.assign({ mode: "both" }, f)).lines;
      assert.ok(lines.includes(`Superheat: ${r.superheat.value.toFixed(1)} °F`), ref + " SH");
      assert.ok(lines.includes(`Subcooling: ${r.subcool.value.toFixed(1)} °F`), ref + " SC");
      assert.ok(lines.some((l) => l.includes(`dew sat ${r.superheat.sat.toFixed(1)} °F`)));
      assert.ok(lines.some((l) => l.includes(`bubble sat ${r.subcool.sat.toFixed(1)} °F`)));
    }
  }
});

test("inline SH/SC: known R-410A numbers, dew vs bubble, free-typed refrigerant", () => {
  const r = X.inlineShSc(Object.assign({}, R, { refrigerant: " r410a " }));
  assert.equal(r.refrigerant, "R-410A");
  assert.equal(r.superheat.sat.toFixed(1), "40.0"); // 118.4 psig dew
  assert.equal(r.superheat.value.toFixed(1), "12.3");
  assert.equal(r.subcool.sat.toFixed(1), "102.7"); // 331 psig bubble
  assert.equal(r.subcool.value.toFixed(1), "7.9");
  const z = X.inlineShSc({ refrigerant: "R-407C", suctionPsig: "63.2", suctionTemp: "50", liquidPsig: "225.5", liquidTemp: "90" });
  assert.equal(z.superheat.sat.toFixed(1), "40.0"); // dew column
  assert.equal(z.subcool.sat.toFixed(1), "100.0"); // bubble column
  const lines = X.shScLines(r);
  assert.equal(lines[0], "Superheat: 12.3 °F (suction 118.4 psig → dew 40.0 °F, line 52.3 °F)");
  assert.equal(lines[1], "Subcool: 7.9 °F (liquid 331.0 psig → bubble 102.7 °F, line 94.8 °F)");
  assert.ok(!lines.join(" ").match(/target|band|normal|good|low|high/i), "no invented cues");
});

test("inline SH/SC only when all five are filled; clear errors otherwise", () => {
  assert.deepEqual(X.inlineShSc(Object.assign({}, R, { liquidTemp: " " })), { state: "incomplete", missing: ["liquid °F"] });
  assert.deepEqual(X.inlineShSc({}).missing, ["refrigerant", "suction psig", "suction °F", "liquid psig", "liquid °F"]);
  assert.match(X.inlineShSc(Object.assign({}, R, { refrigerant: "R-448A" })).message, /No PT table for “R-448A”/);
  assert.match(X.inlineShSc(Object.assign({}, R, { suctionTemp: "abc" })).message, /Not a number: suction °F/);
  assert.match(X.inlineShSc(Object.assign({}, R, { liquidPsig: "900" })).message, /outside table/);
  assert.equal(X.ptRefrigerant("R404A"), "R-404A");
  assert.equal(X.ptRefrigerant("R-22"), "R-22");
  assert.equal(X.ptRefrigerant("propane"), null);
});

test("amps % of plate RLA/FLA, with the source; no plate value -> no %", () => {
  const rec = { brand: "Fujitsu", model: "AOU15", rla: "10.0", summary: "Fujitsu AOU15 | RLA 10.0" };
  assert.deepEqual(X.ampsReference({ plate: rec.summary, fla: "10.0" }, rec), { amps: 10, source: "RLA from plate scan" });
  assert.deepEqual(X.ampsReference({ plate: "Carrier 24ABC | RLA 12.8", fla: "" }, null), { amps: 12.8, source: "RLA from Data plate" });
  assert.deepEqual(X.ampsReference({ plate: "Carrier 24ABC | RLA 12.8", fla: "12.8" }, null), { amps: 12.8, source: "RLA from Data plate" });
  assert.deepEqual(X.ampsReference({ plate: "", fla: "9.5" }, null), { amps: 9.5, source: "RLA/FLA typed on the call card" });
  assert.equal(X.ampsReference({ plate: "", fla: "" }, null), null);
  assert.equal(X.ampsPercent("8", null), null);
  const p = X.ampsPercent("8.6 / 9.1", { amps: 10, source: "RLA from plate scan" });
  assert.deepEqual(p.items, [{ amps: 8.6, pct: 86 }, { amps: 9.1, pct: 91 }]);
  assert.equal(X.ampsLine(p), "8.6 A = 86%, 9.1 A = 91% of 10 A (RLA from plate scan)");
  assert.equal(X.ampsPercent("", { amps: 10, source: "x" }), null);
});

test("total time: same day, edits, midnight crossing, bad input", () => {
  assert.equal(X.totalTime("08:05", "09:50", "2026-10-26", "2026-10-26").text, "1 h 45 min");
  assert.equal(X.totalTime("23:40", "00:25", "2026-10-26", "2026-10-27").text, "45 min (past midnight)");
  assert.equal(X.totalTime("23:40", "00:25").text, "45 min (past midnight)"); // no dates
  assert.equal(X.totalTime("23:40", "00:25", "2026-10-26", "2026-10-26").text, "45 min (past midnight)"); // end date not edited
  assert.equal(X.totalTime("22:00", "01:30", "2026-10-26", "2026-10-28").minutes, 27 * 60 + 30); // multi-day
  assert.equal(X.totalTime("10:00", "10:00").text, "0 min");
  assert.equal(X.totalTime("", "10:00"), null);
  assert.equal(X.totalTime("25:00", "10:00"), null);
  assert.deepEqual(X.stamp(new Date(2026, 9, 26, 7, 4)), { date: "2026-10-26", time: "07:04" });
});

test("quick phrases: exact list, appended on their own line, ___ selected", () => {
  assert.deepEqual(X.PHRASES, ["Replaced filter-drier", "Adjusted TXV", "Cleaned condenser coil", "Checked/cleared drain", "Replaced contactor", "Replaced capacitor", "Leak checked", "Evacuated to ___ microns", "Recharged by weight"]);
  assert.deepEqual(X.appendPhrase("", "Adjusted TXV"), { value: "Adjusted TXV", selStart: 12, selEnd: 12 });
  const r = X.appendPhrase("Leak checked\n", "Evacuated to ___ microns");
  assert.equal(r.value, "Leak checked\nEvacuated to ___ microns");
  assert.equal(r.value.slice(r.selStart, r.selEnd), "___");
});

test("copy lines: header, SH/SC with units, amps %, times", () => {
  const d = Object.assign({}, R, { workOrder: "WO-1182", techName: "Arthur", startDate: "2026-10-26", startTime: "23:40", endDate: "2026-10-27", endTime: "00:25", amps: "8.6", fla: "10", plate: "" });
  assert.deepEqual(X.headerLines(d), ["Work order / customer #: WO-1182", "Tech: Arthur", "Start: 2026-10-26 23:40", "End: 2026-10-27 00:25", "Total time: 45 min (past midnight)"]);
  const r = X.readingsExtraLines(d, null);
  assert.match(r[0], /^Superheat: 12\.3 °F/);
  assert.match(r[1], /^Subcool: 7\.9 °F/);
  assert.equal(r[3], "Amps: 8.6 A = 86% of 10 A (RLA/FLA typed on the call card)");
  assert.deepEqual(X.readingsExtraLines({}, null), []);
});

test("call.html: units on every reading field, header fields, chip hosts, module loaded and precached", () => {
  const h = readFileSync(new URL("../call.html", import.meta.url), "utf8");
  const panel = h.slice(h.indexOf('id="panel-readings"'), h.indexOf('id="panel-mid"'));
  const labels = [...panel.matchAll(/<span>([^<]+)<\/span><input/g)].map((m) => m[1]);
  assert.equal(labels.length, 9);
  for (const l of labels) assert.match(l, /\((psig|°F|A|V)\)$/, l);
  for (const id of ["workOrder", "techName", "startDate", "startTime", "endDate", "endTime", "shsc-inline", "amps-pct", "total-time"]) assert.ok(h.includes('id="' + id + '"'), id);
  assert.ok(h.includes('data-for="did"') && h.includes('data-for="fixed"'));
  assert.ok(h.includes("tools/call-wizard.js?v="));
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["call-extras", "call-wizard"]) assert.match(sw, new RegExp('"./tools/' + f + '\\.js\\?v=\\d+"'));
});
