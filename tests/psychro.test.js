import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, airPoint, pressurePsia, STD_AIR } from "../tools/psychro.js";

// Worked example (Psychrometric Analysis Spec §6). Expected = PsychroLib 2.x Python, unrounded.
const EX = { ret: { db: 75, rh: 50 }, sup: { db: 55, rh: 90 }, pressure: { altitudeFt: 1000 }, cfm: 1200 };
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);

test("pressure from altitude / inHg / psia", () => {
  near(pressurePsia({ altitudeFt: 1000 }), 14.172651183508815, 1e-9, "1000 ft");
  near(pressurePsia({ altitudeFt: 0 }), 14.696, 1e-3, "sea level");
  near(pressurePsia({ inHg: 29.921 }), 14.696, 2e-3, "inHg");
  assert.equal(pressurePsia({ psia: 13.5 }), 13.5);
  assert.throws(() => pressurePsia({}));
});

test("worked example point properties", () => {
  const r = analyze(EX);
  near(r.ret.W, 0.009581963959824743, 1e-8, "W ret"); near(r.sup.W, 0.008572485155435586, 1e-8, "W sup");
  near(r.ret.h, 28.485543161236215, 1e-4, "h ret"); near(r.sup.h, 22.504746837412895, 1e-4, "h sup");
  near(r.ret.wb, 62.393539183637394, 0.01, "wb ret"); near(r.sup.wb, 53.310260440640015, 0.01, "wb sup");
  near(r.ret.dp, 55.11990432501227, 0.01, "dp ret"); near(r.sup.dp, 52.124564505551106, 0.01, "dp sup");
  near(r.ret.v, 14.192096725911014, 1e-4, "v ret"); near(r.sup.v, 13.639386518573627, 1e-4, "v sup");
  near(r.ret.grains, 67.0737477187732, 1e-3, "gr ret");
  near(r.dh, 5.98079632382332, 1e-4, "dh"); near(r.dGrains, 7.0663516307241, 1e-3, "dW gr"); assert.equal(r.dT, 20);
  near(r.coilLeavingDewPoint, 52.1246, 0.01, "coil dp");
});

test("worked example capacity (±1 Btu/h)", () => {
  const r = analyze(EX);
  near(r.totalStd, 32296.30014864593, 1, "total 4.5");
  near(r.totalDensity, 31571.605858436506, 1, "total density (supply)");
  near(r.sensibleStd, 25920, 1e-9, "sensible 1.08");
  near(r.latentStd, 5766.142930670866, 1, "latent 0.68");
  near(r.sumStd, 31686.142930670867, 1, "Qs+Ql");
  assert.equal(r.airflowAt, "supply"); assert.equal(r.shrMethod, "std");
  near(r.shr, 0.8025687116078755, 1e-4, "SHR std"); assert.equal(r.shr.toFixed(2), "0.80");
  near(r.shrAll.sum, 0.8180231988700183, 1e-4, "SHR sum");
  near(r.tonsStd, 2.6914, 1e-3, "tons");
  assert.match(r.totalStdLabel, /^Standard air/); assert.match(r.sensibleLabel, /^Standard air/);
  assert.match(r.latentLabel, /^Standard air/); assert.match(r.totalDensityLabel, /supply/);
});

test("return airflow location and alternate SHR are selectable and labeled", () => {
  const r = analyze({ ...EX, airflowAt: "return", shrMethod: "sum" });
  near(r.totalDensity, 30342.05189209891, 1, "density (return)");
  assert.match(r.totalDensityLabel, /return/);
  near(r.shr, 0.8180231988700183, 1e-4, "SHR sum"); assert.match(r.shrLabel, /sensible \+ latent/);
  assert.throws(() => analyze({ ...EX, airflowAt: "duct" }));
});

test("wet-bulb input round-trips; bad inputs throw; no cfm => no capacity", () => {
  const p = pressurePsia({ altitudeFt: 1000 });
  const a = airPoint({ db: 75, wb: 62.393539183637394 }, p);
  near(a.rh, 0.5, 1e-4, "rh from wb"); near(a.h, 28.4855, 1e-3, "h from wb");
  assert.throws(() => airPoint({ db: 70, wb: 72 }, p));
  assert.throws(() => airPoint({ db: 70, rh: 120 }, p));
  assert.throws(() => airPoint({ db: 70 }, p));
  const r = analyze({ ...EX, cfm: undefined });
  assert.equal(r.totalStd, undefined); near(r.dh, 5.9808, 1e-3, "dh still");
  assert.equal(STD_AIR.total.factor, 4.5);
});

test("no uncited range hints; vendored PsychroLib is MIT and precached", () => {
  const src = readFileSync(new URL("../tools/psychro.js", import.meta.url), "utf8");
  for (const s of ["16", "0.70", "350", "450"]) assert.ok(!new RegExp(`\\b${s.replace(".", "\\.")}\\b`).test(src), s);
  assert.match(readFileSync(new URL("../vendor/psychrolib/LICENSE", import.meta.url), "utf8"), /MIT License/);
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /vendor\/psychrolib\/psychrolib\.mjs/); assert.match(sw, /tools\/psychro\.js\?v=38/);
});
