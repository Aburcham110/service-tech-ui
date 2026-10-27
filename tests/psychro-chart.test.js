import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import psychrolib from "../vendor/psychrolib/psychrolib.mjs";
import { buildChart, chartRange, scales, saturationCurve, rhCurve, wetBulbLine, enthalpyLine, DEFAULT_RANGE } from "../tools/psychro-chart.js";
import { analyze } from "../tools/psychro.js";

const P = psychrolib; P.SetUnitSystem(P.IP);
const p = P.GetStandardAtmPressure(1000), R = DEFAULT_RANGE;
const near = (a, b, t, m) => assert.ok(Math.abs(a - b) <= t, `${m}: ${a} vs ${b}`);

test("saturation and RH curves match PsychroLib at the given pressure", () => {
  const sat = saturationCurve(p, R);
  assert.equal(sat.length, 81); assert.equal(sat[0][0], 30); assert.equal(sat.at(-1)[0], 110);
  for (const [t, g] of sat) near(g, P.GetSatHumRatio(t, p) * 7000, 1e-9, "sat " + t);
  for (const rh of [0.1, 0.5, 0.9]) for (const [t, g] of rhCurve(rh, p, R)) near(g, P.GetHumRatioFromRelHum(t, rh, p) * 7000, 1e-9, `rh ${rh} @ ${t}`);
  // pressure matters: sea level sat at 75 °F is lower than at 1,000 ft
  assert.ok(saturationCurve(14.696, R)[45][1] < sat[45][1]);
});

test("wet-bulb lines start on saturation and match PsychroLib; enthalpy lines stay under saturation", () => {
  const wb = wetBulbLine(60, p, R);
  near(wb[0][1], P.GetSatHumRatio(60, p) * 7000, 1e-6, "wb starts at sat");
  for (const [t, g] of wb) if (g > 0) near(g, P.GetHumRatioFromTWetBulb(t, 60, p) * 7000, 1e-9, "wb " + t);
  for (let i = 1; i < wb.length; i++) assert.ok(wb[i][1] <= wb[i - 1][1]);
  for (const [t, g] of enthalpyLine(28.4855, p, R)) {
    near(P.GetMoistAirEnthalpy(t, g / 7000), 28.4855, 1e-9, "h " + t);
    assert.ok(g <= P.GetSatHumRatio(t, p) * 7000 + 1e-9);
  }
});

test("range: default 30–110 °F / 0–200 gr; extends for low-temp points or toggle", () => {
  assert.deepEqual(chartRange([]), { tMin: 30, tMax: 110, grMax: 200 });
  assert.equal(chartRange([{ db: -10, grains: 3 }]).tMin, -20);
  assert.equal(chartRange([{ db: -25, grains: 2 }]).tMin, -30);
  assert.equal(chartRange([{ db: 31, grains: 20 }]).tMin, -20);
  assert.equal(chartRange([{ db: 75, grains: 67 }], { lowTemp: true }).tMin, -20);
  assert.equal(chartRange([{ db: 75, grains: 67 }]).tMin, 30);
  const low = analyze({ ret: { db: 0, rh: 80 }, sup: { db: -10, rh: 90 }, pressure: { altitudeFt: 0 } });
  const c = buildChart(low.psia, low, {}); assert.equal(c.range.tMin, -20);
  assert.match(c.svg, /id="psy-pt-sup" cx="[\d.]+"/);
});

test("worked example: points placed at (db, grains), process line, dew-point projection, all line families", () => {
  const a = analyze({ ret: { db: 75, rh: 50 }, sup: { db: 55, rh: 90 }, pressure: { altitudeFt: 1000 }, cfm: 1200 });
  const { svg, range } = buildChart(a.psia, a);
  const s = scales(range);
  for (const [k, pt] of [["ret", a.ret], ["sup", a.sup]]) {
    const m = svg.match(new RegExp(`id="psy-pt-${k}" cx="([\\d.]+)" cy="([\\d.]+)"`));
    near(+m[1], s.x(pt.db), 0.06, k + " x"); near(+m[2], s.y(pt.grains), 0.06, k + " y");
  }
  const dp = svg.match(/class="psy-dp-proj" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/);
  near(+dp[3], s.x(a.sup.dp), 0.06, "dp x"); assert.equal(dp[2], dp[4]);
  assert.match(svg, /class="psy-process"[^>]*marker-end/);
  assert.equal((svg.match(/class="psy-rh-line"/g) || []).length, 9);
  assert.match(svg, /class="psy-sat"/); assert.ok((svg.match(/psy-wb-line/g) || []).length >= 10); assert.ok((svg.match(/psy-h-line/g) || []).length >= 5);
  assert.match(svg, /data-psia="14\.17/);
  assert.doesNotMatch(svg, /comfort|target|zone/i);
});

test("chart module precached", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./tools/psychro-chart.js?v=33"'));
});
