/* Psychrometrics screen logic (pure, no DOM): parse the form values, run tools/psychro.js,
 * build input-sanity warnings ("check probes", NOT standards), cited hints, and the copy text.
 * Only cited hints are shipped: BPA PTCS 325–500 cfm/ton and "most manufacturers suggest 0.5 inH₂O or less". */
import { analyze } from "./psychro.js?v=31";

export const BPA_URL = "https://www.bpa.gov/-/media/Aep/energy-efficiency/residential/residential-ptcs-essentials/ptcs-esp-cfm-lookup-tables-final.pdf";
export const BPA_SOURCE = "BPA PTCS External Static Pressure – CFM Manufacturer Lookup Tables";
export const NEAR_SAT_RH = 0.98; // a reading this close to saturation is often a wet or misplaced sensor

const num = (v) => { if (v === undefined || v === null) return NaN; const s = String(v).trim().replace(",", "."); return s === "" ? NaN : Number(s); };

/** Raw form strings -> analyze() options + per-field input problems. */
export function readForm(f) {
  const problems = [];
  const point = (side, label) => {
    const db = num(f[side + "Db"]), val = num(f[side + "Hum"]), mode = f[side + "HumMode"] === "wb" ? "wb" : "rh";
    if (!Number.isFinite(db)) problems.push(`${label}: enter dry bulb (°F).`);
    if (!Number.isFinite(val)) problems.push(`${label}: enter ${mode === "wb" ? "wet bulb (°F)" : "RH (%)"}.`);
    else if (mode === "rh" && (val < 0 || val > 100)) problems.push(`${label}: RH ${val}% is outside 0–100%. Check probes.`);
    else if (mode === "wb" && Number.isFinite(db) && val > db) problems.push(`${label}: wet bulb ${val} °F is above dry bulb ${db} °F, which is impossible. Check probes.`);
    return mode === "wb" ? { db, wb: val } : { db, rh: val };
  };
  const ret = point("ret", "Return"), sup = point("sup", "Supply");
  const pv = num(f.pressureValue), mode = f.pressureMode || "altitudeFt";
  const pressureEntered = Number.isFinite(pv);
  const pressure = pressureEntered ? { [mode]: pv } : { altitudeFt: 0 };
  if (pressureEntered && mode !== "altitudeFt" && !(pv > 0)) problems.push("Barometric pressure must be above 0.");
  const cfm = num(f.cfm), tesp = num(f.tesp), ratedTons = num(f.ratedTons);
  return { opts: { ret, sup, pressure, cfm: cfm > 0 ? cfm : undefined, airflowAt: f.airflowAt === "return" ? "return" : "supply" },
    pressureEntered, tesp, ratedTons, problems };
}

/** Full evaluation for the results card. Never throws. */
export function evaluate(f) {
  const r = readForm(f);
  if (r.problems.length) return { ok: false, problems: r.problems };
  let a;
  try { a = analyze(r.opts); } catch (e) { return { ok: false, problems: [String(e.message || e) + ". Check probes."] }; }
  const warnings = [];
  if (a.sup.db >= a.ret.db) warnings.push(`Supply ${a.sup.db} °F is not colder than return ${a.ret.db} °F (cooling). Check probes.`);
  for (const [k, n] of [["ret", "Return"], ["sup", "Supply"]]) if (a[k].rh >= NEAR_SAT_RH) warnings.push(`${n} RH ${(a[k].rh * 100).toFixed(1)}% is at or near saturation. The sensor may be wet. Check probes.`);
  const hints = [];
  const cfmPerRatedTon = a.cfm && r.ratedTons > 0 ? a.cfm / r.ratedTons : undefined;
  if (cfmPerRatedTon !== undefined && (cfmPerRatedTon < 325 || cfmPerRatedTon > 500))
    hints.push({ text: `${cfmPerRatedTon.toFixed(0)} cfm per rated ton. BPA's PTCS program specifies 325–500 cfm/ton.`, url: BPA_URL, source: BPA_SOURCE });
  if (Number.isFinite(r.tesp) && r.tesp > 0.5)
    hints.push({ text: `TESP ${r.tesp} inH₂O. BPA notes most manufacturers suggest 0.5 inH₂O or less; check the equipment's rating.`, url: BPA_URL, source: BPA_SOURCE });
  const capacity = a.cfm ? (() => {
    const dens = { key: "density", label: a.totalDensityLabel, btuh: a.totalDensity, tons: a.tonsDensity };
    const std = { key: "std", label: a.totalStdLabel, btuh: a.totalStd, tons: a.tonsStd };
    return { totals: r.pressureEntered ? [dens, std] : [std, dens] };
  })() : null;
  return { ok: true, a, warnings, hints, pressureEntered: r.pressureEntered, tesp: r.tesp, ratedTons: r.ratedTons,
    cfmPerRatedTon, cfmPerMeasuredTon: a.cfm ? a.cfm / (r.pressureEntered ? a.tonsDensity : a.tonsStd) : undefined, capacity };
}

const f1 = (x) => x.toFixed(1), f0 = (x) => Math.round(x).toLocaleString("en-US");
export function pointRows(p) {
  return [["Dry bulb", f1(p.db) + " °F"], ["Wet bulb", f1(p.wb) + " °F"], ["Dew point", f1(p.dp) + " °F"], ["RH", f1(p.rh * 100) + " %"],
    ["Humidity ratio", f1(p.grains) + " gr/lb (" + p.W.toFixed(5) + " lb/lb)"], ["Enthalpy", p.h.toFixed(2) + " Btu/lb"], ["Specific volume", p.v.toFixed(3) + " ft³/lb"]];
}

/** Plain-text summary for the Copy button (numbers only, labels included). */
export function copyText(ev) {
  if (!ev.ok) return "";
  const a = ev.a, L = ["Psychrometrics", `Pressure: ${a.psia.toFixed(3)} psia${ev.pressureEntered ? "" : " (assumed sea level)"}`];
  for (const [k, n] of [["ret", "Return"], ["sup", "Supply"]]) L.push(`${n}: ` + pointRows(a[k]).map(([l, v]) => `${l} ${v}`).join(", "));
  L.push(`ΔT ${f1(a.dT)} °F, Δh ${a.dh.toFixed(2)} Btu/lb, ΔW ${f1(a.dGrains)} gr/lb`, `Coil leaving dew point ${f1(a.coilLeavingDewPoint)} °F`);
  if (ev.capacity) {
    for (const t of ev.capacity.totals) L.push(`Total ${f0(t.btuh)} Btu/h (${t.tons.toFixed(2)} tons) - ${t.label}`);
    L.push(`Sensible ${f0(a.sensibleStd)} Btu/h - ${a.sensibleLabel}`, `Latent ${f0(a.latentStd)} Btu/h - ${a.latentLabel}`,
      `SHR ${a.shrAll.std.toFixed(2)} - ${"Sensible ÷ standard-air total"} (default)`, `SHR ${a.shrAll.sum.toFixed(2)} - Sensible ÷ (sensible + latent) (alternative)`,
      `Airflow ${f0(a.cfm)} cfm measured in ${a.airflowAt} air; ${f0(ev.cfmPerMeasuredTon)} cfm per measured ton` + (ev.cfmPerRatedTon ? `; ${f0(ev.cfmPerRatedTon)} cfm per rated ton (${ev.ratedTons} tons)` : ""));
  }
  if (Number.isFinite(ev.tesp)) L.push(`TESP ${ev.tesp} inH₂O`);
  for (const w of ev.warnings) L.push("Check: " + w);
  for (const h of ev.hints) L.push("Note: " + h.text + " Source: " + h.source);
  return L.join("\n");
}
