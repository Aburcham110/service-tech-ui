/* SVG psychrometric chart (pure: returns markup, no DOM). All curves are computed with PsychroLib at the
 * given pressure: saturation, RH 10–90 %, wet-bulb lines (every 5 °F), enthalpy lines (every 5 Btu/lb).
 * Points R and S, the R→S process line and S's dew-point projection. No target zones / comfort boxes. */
import psychrolib from "../vendor/psychrolib/psychrolib.mjs";

const P = psychrolib;
P.SetUnitSystem(P.IP);
const GR = 7000;
export const DEFAULT_RANGE = Object.freeze({ tMin: 30, tMax: 110, grMax: 200 });
export const LOW_TEMP_MIN = -20;
const W = 360, H = 260, M = { l: 30, r: 34, t: 10, b: 28 }; // viewBox; humidity axis on the right

/** Chart range: default 30–110 °F / 0–200 gr, auto-extended (or forced with lowTemp) for points below 32 °F. */
export function chartRange(points = [], { lowTemp = false } = {}) {
  let { tMin, tMax, grMax } = DEFAULT_RANGE;
  const dbs = points.map((p) => p.db).filter(Number.isFinite), grs = points.map((p) => p.grains).filter(Number.isFinite);
  if (lowTemp || dbs.some((t) => t < 32)) tMin = Math.min(LOW_TEMP_MIN, Math.floor((Math.min(...dbs, tMin) - 5) / 10) * 10);
  if (dbs.length) tMax = Math.max(tMax, Math.ceil((Math.max(...dbs) + 5) / 10) * 10);
  if (grs.length) grMax = Math.max(grMax, Math.ceil((Math.max(...grs) + 10) / 20) * 20);
  return { tMin, tMax, grMax };
}

export function scales(range) {
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  return {
    x: (t) => M.l + ((t - range.tMin) / (range.tMax - range.tMin)) * pw,
    y: (gr) => M.t + ph - (gr / range.grMax) * ph,
  };
}

const satGr = (t, p) => P.GetSatHumRatio(t, p) * GR;
/** Saturation curve sampled every 1 °F (grains). */
export function saturationCurve(p, range) {
  const pts = [];
  for (let t = range.tMin; t <= range.tMax; t++) pts.push([t, satGr(t, p)]);
  return pts;
}
export function rhCurve(rh, p, range) {
  const pts = [];
  for (let t = range.tMin; t <= range.tMax; t++) pts.push([t, P.GetHumRatioFromRelHum(t, rh, p) * GR]);
  return pts;
}
/** Constant wet bulb: from saturation (db = wb) to the right until W reaches 0. */
export function wetBulbLine(twb, p, range) {
  const pts = [];
  for (let t = twb; t <= range.tMax + 1e-9; t += 1) {
    let w; try { w = P.GetHumRatioFromTWetBulb(t, twb, p); } catch (e) { break; }
    if (!(w >= 0)) { pts.push([t, 0]); break; }
    pts.push([t, w * GR]);
  }
  return pts;
}
/** Constant enthalpy h (Btu/lb): W = (h − 0.240 t)/(1061 + 0.444 t), kept between W = 0 and saturation. */
export function enthalpyLine(h, p, range) {
  const pts = [];
  for (let t = range.tMin; t <= range.tMax; t += 0.5) {
    const w = (h - 0.24 * t) / (1061 + 0.444 * t);
    if (w < 0) break;
    if (w * GR <= satGr(t, p) + 1e-9) pts.push([t, w * GR]);
  }
  return pts;
}

const f = (n) => n.toFixed(1);
function path(pts, s, range, cls, extra = "") {
  const q = pts.filter(([t, g]) => t >= range.tMin - 1e-9 && t <= range.tMax + 1e-9).map(([t, g]) => [t, Math.min(g, range.grMax)]);
  if (q.length < 2) return "";
  return `<path class="${cls}" ${extra} d="M${q.map(([t, g]) => f(s.x(t)) + "," + f(s.y(g))).join("L")}"/>`;
}

/**
 * @param p pressure psia; points: { ret, sup } from psychro.analyze (db, grains, dp, wb, h); opts: { lowTemp }
 * @returns { svg, range }
 */
export function buildChart(p, { ret, sup } = {}, opts = {}) {
  const pts = [ret, sup].filter(Boolean);
  const range = chartRange(pts, opts), s = scales(range);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="psy-chart" role="img" aria-label="Psychrometric chart at ${p.toFixed(3)} psia" data-psia="${p}" data-tmin="${range.tMin}" data-tmax="${range.tMax}" data-grmax="${range.grMax}">`);
  o.push(`<defs><clipPath id="psy-clip"><rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/></clipPath>` +
    `<marker id="psy-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="psy-arrowhead"/></marker></defs>`);
  // grid + axes
  const tStep = range.tMax - range.tMin > 100 ? 20 : 10, gStep = range.grMax > 200 ? 40 : 20;
  for (let t = Math.ceil(range.tMin / tStep) * tStep; t <= range.tMax; t += tStep)
    o.push(`<line class="psy-grid" x1="${f(s.x(t))}" y1="${M.t}" x2="${f(s.x(t))}" y2="${H - M.b}"/><text class="psy-tick" x="${f(s.x(t))}" y="${H - M.b + 10}" text-anchor="middle">${t}</text>`);
  for (let g = 0; g <= range.grMax; g += gStep)
    o.push(`<line class="psy-grid" x1="${M.l}" y1="${f(s.y(g))}" x2="${W - M.r}" y2="${f(s.y(g))}"/><text class="psy-tick" x="${W - M.r + 3}" y="${f(s.y(g) + 3)}">${g}</text>`);
  o.push(`<text class="psy-axis" x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle">Dry bulb (°F)</text>`);
  o.push(`<text class="psy-axis" transform="translate(${W - 8},${(H - M.b) / 2}) rotate(90)" text-anchor="middle">Humidity ratio (gr/lb)</text>`);
  o.push(`<g clip-path="url(#psy-clip)">`);
  for (let h = Math.ceil((0.24 * range.tMin) / 5) * 5; h <= 0.24 * range.tMax + 0.21 * 1061 && h <= 80; h += 5)
    o.push(path(enthalpyLine(h, p, range), s, range, "psy-h-line", `data-h="${h}"`));
  for (let wb = Math.ceil(range.tMin / 5) * 5; wb <= range.tMax; wb += 5)
    o.push(path(wetBulbLine(wb, p, range), s, range, "psy-wb-line", `data-wb="${wb}"`));
  for (let k = 1; k <= 9; k++) {
    const c = rhCurve(k / 10, p, range);
    o.push(path(c, s, range, "psy-rh-line", `data-rh="${k * 10}"`));
    const lab = c.filter(([t, g]) => g < range.grMax * 0.92).pop();
    if (lab) o.push(`<text class="psy-rh-label" x="${f(s.x(lab[0]) - 2)}" y="${f(s.y(lab[1]) - 2)}" text-anchor="end">${k * 10}%</text>`);
  }
  o.push(path(saturationCurve(p, range), s, range, "psy-sat", `data-rh="100"`));
  if (ret && sup) {
    o.push(`<line class="psy-dp-proj" x1="${f(s.x(sup.db))}" y1="${f(s.y(sup.grains))}" x2="${f(s.x(sup.dp))}" y2="${f(s.y(sup.grains))}" data-dp="${sup.dp}"/>`);
    o.push(`<line class="psy-process" x1="${f(s.x(ret.db))}" y1="${f(s.y(ret.grains))}" x2="${f(s.x(sup.db))}" y2="${f(s.y(sup.grains))}" marker-end="url(#psy-arrow)"/>`);
  }
  o.push(`</g>`);
  for (const [k, pt, lab] of [["ret", ret, "R"], ["sup", sup, "S"]]) {
    if (!pt) continue;
    const cx = s.x(pt.db), cy = s.y(Math.min(pt.grains, range.grMax));
    o.push(`<g class="psy-pt psy-pt-${k}"><circle id="psy-pt-${k}" cx="${f(cx)}" cy="${f(cy)}" r="4" data-db="${pt.db}" data-gr="${pt.grains}"><title>${lab}: ${pt.db.toFixed(1)} °F db, ${pt.wb.toFixed(1)} °F wb, ${pt.dp.toFixed(1)} °F dp, ${(pt.rh * 100).toFixed(0)}% RH, ${pt.grains.toFixed(1)} gr/lb, ${pt.h.toFixed(2)} Btu/lb</title></circle>` +
      `<text class="psy-pt-label" x="${f(cx + 6)}" y="${f(cy - 6)}">${lab}</text></g>`);
  }
  o.push(`<text class="psy-note" x="${M.l + 4}" y="${M.t + 10}">${p.toFixed(3)} psia · lines: RH 10–90%, wet bulb / 5 °F, enthalpy / 5 Btu/lb</text>`);
  o.push(`</svg>`);
  return { svg: o.join(""), range };
}
