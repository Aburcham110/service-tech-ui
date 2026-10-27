/* Psychrometric engine (pure, no DOM). IP units throughout.
 * Properties come from PsychroLib 2.5.0 (ASHRAE Handbook—Fundamentals Ch. 1 equations), vendored for offline use.
 * Capacity: standard-air factors 4.5 / 1.08 / 0.68 (0.075 lb/ft³ air) are LABELED as standard-air;
 * the density-corrected total uses the moist-air specific volume where the airflow was measured.
 * No range hints / pass-fail here: none are shipped without a citation. */
import psychrolib from "../vendor/psychrolib/psychrolib.mjs";

const P = psychrolib;
P.SetUnitSystem(P.IP);

export const GRAINS_PER_LB = 7000;
export const STD_AIR = Object.freeze({
  total: { factor: 4.5, label: "Standard air (0.075 lb/ft³): 4.5 × cfm × Δh" },
  sensible: { factor: 1.08, label: "Standard air (0.075 lb/ft³): 1.08 × cfm × ΔT" },
  latent: { factor: 0.68, label: "Standard air (0.075 lb/ft³): 0.68 × cfm × ΔW (grains)" },
});
export const SHR_METHODS = Object.freeze({
  std: "Sensible ÷ standard-air total (1.08·cfm·ΔT ÷ 4.5·cfm·Δh)",
  sum: "Sensible ÷ (sensible + latent), standard-air factors",
});
const PSI_PER_INHG = 0.4911541;

/** Pressure (psia) from { psia } | { inHg } | { altitudeFt } (ASHRAE standard atmosphere). */
export function pressurePsia(src = {}) {
  let p;
  if (Number.isFinite(src.psia)) p = src.psia;
  else if (Number.isFinite(src.inHg)) p = src.inHg * PSI_PER_INHG;
  else if (Number.isFinite(src.altitudeFt)) p = P.GetStandardAtmPressure(src.altitudeFt);
  else throw new Error("pressure: give psia, inHg or altitudeFt");
  if (!(p > 0)) throw new Error("pressure must be > 0");
  return p;
}

/** One air state. Give db (°F) plus rh (0–1, or 0–100 if > 1) OR wb (°F). */
export function airPoint({ db, rh, wb }, psia) {
  if (!Number.isFinite(db)) throw new Error("dry bulb required");
  let RH;
  if (Number.isFinite(rh)) RH = rh > 1 ? rh / 100 : rh;
  else if (Number.isFinite(wb)) {
    if (wb > db) throw new Error("wet bulb above dry bulb");
    RH = P.GetRelHumFromTWetBulb(db, wb, psia);
  } else throw new Error("RH or wet bulb required");
  if (!(RH >= 0 && RH <= 1)) throw new Error("RH must be 0–100%");
  const W = P.GetHumRatioFromRelHum(db, RH, psia);
  return {
    db, rh: RH, W, grains: W * GRAINS_PER_LB,
    h: P.GetMoistAirEnthalpy(db, W),
    wb: Number.isFinite(wb) && !Number.isFinite(rh) ? wb : P.GetTWetBulbFromRelHum(db, RH, psia),
    dp: P.GetTDewPointFromRelHum(db, RH),
    v: P.GetMoistAirVolume(db, W, psia),
  };
}

/**
 * Full analysis. opts: { ret, sup, pressure: {psia|inHg|altitudeFt}, cfm, airflowAt: "supply"|"return", shrMethod: "std"|"sum" }
 */
export function analyze({ ret, sup, pressure, cfm, airflowAt = "supply", shrMethod = "std" }) {
  if (airflowAt !== "supply" && airflowAt !== "return") throw new Error("airflowAt must be supply or return");
  const psia = pressurePsia(pressure);
  const R = airPoint(ret, psia), S = airPoint(sup, psia);
  const dT = R.db - S.db, dh = R.h - S.h, dW = R.W - S.W, dGr = dW * GRAINS_PER_LB;
  const out = { psia, ret: R, sup: S, dT, dh, dW, dGrains: dGr, coilLeavingDewPoint: S.dp, airflowAt };
  if (Number.isFinite(cfm) && cfm > 0) {
    const v = airflowAt === "supply" ? S.v : R.v;
    const totalStd = STD_AIR.total.factor * cfm * dh;
    const sensibleStd = STD_AIR.sensible.factor * cfm * dT;
    const latentStd = STD_AIR.latent.factor * cfm * dGr;
    const shr = { std: sensibleStd / totalStd, sum: sensibleStd / (sensibleStd + latentStd) };
    Object.assign(out, {
      cfm,
      totalStd, totalStdLabel: STD_AIR.total.label,
      totalDensity: (60 * cfm * dh) / v,
      totalDensityLabel: `Density-corrected: 60 × cfm × Δh ÷ v (${airflowAt} air, v = ${v.toFixed(4)} ft³/lb)`,
      sensibleStd, sensibleLabel: STD_AIR.sensible.label,
      latentStd, latentLabel: STD_AIR.latent.label,
      sumStd: sensibleStd + latentStd,
      shrMethod, shr: shr[shrMethod], shrLabel: SHR_METHODS[shrMethod], shrAll: shr,
      tonsStd: totalStd / 12000, tonsDensity: (60 * cfm * dh) / v / 12000,
    });
  }
  return out;
}
