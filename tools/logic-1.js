/** Compute / diagnostic logic (part 1) — educational approximations */

import { PT } from "./pt-tables.js?v=41";

function satTemp(ref, psig, side = "dew") {
  const t = PT[ref];
  if (!t) throw new Error("Unsupported refrigerant");
  const c = side === "bubble" ? 2 : 1;
  const lo = t[0][c], hi = t[t.length - 1][c];
  if (psig < lo || psig > hi) {
    throw new Error(`Pressure ${psig} psig outside table (${lo}–${hi}) for ${ref}`);
  }
  for (let i = 0; i < t.length - 1; i++) {
    const p0 = t[i][c], p1 = t[i + 1][c];
    if (psig >= p0 && psig <= p1) {
      return t[i][0] + ((psig - p0) / (p1 - p0)) * (t[i + 1][0] - t[i][0]);
    }
  }
  return t[t.length - 1][0];
}

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shGuide(sh) {
  if (sh < 5) return "Very low — risk of liquid floodback (approx).";
  if (sh <= 20) return "Often in a common target band for many fixed-orifice systems (approx).";
  if (sh <= 30) return "Somewhat high — may indicate undercharge or airflow issue (approx).";
  return "High — check charge, metering device, and airflow (approx).";
}
function scGuide(sc) {
  if (sc < 5) return "Low — possible undercharge or restriction (approx).";
  if (sc <= 15) return "Often in a common target band for many TXV systems (approx).";
  if (sc <= 20) return "Somewhat high — may indicate overcharge (approx).";
  return "High — check for overcharge or non-condensables (approx).";
}

/** The numbers behind runSuperheatSubcool (one code path for the SH/SC tool and the call card).
 *  Returns { superheat: {psig, line, sat, value}|null, subcool: {...}|null } or { error }. PT: dew for SH, bubble for SC. */
export function shScValues(f) {
  const mode = f.mode || "both";
  const out = { superheat: null, subcool: null };
  try {
    if (mode === "superheat" || mode === "both") {
      const sp = num(f.suctionPsig), st = num(f.suctionTemp);
      if (sp == null || st == null) return { error: "Need suction pressure and suction temp for superheat." };
      const sat = satTemp(f.refrigerant, sp, "dew");
      out.superheat = { psig: sp, line: st, sat, value: st - sat };
    }
    if (mode === "subcooling" || mode === "both") {
      const lp = num(f.liquidPsig), lt = num(f.liquidTemp);
      if (lp == null || lt == null) return { error: "Need liquid pressure and liquid temp for subcooling." };
      const sat = satTemp(f.refrigerant, lp, "bubble");
      out.subcool = { psig: lp, line: lt, sat, value: sat - lt };
    }
  } catch (e) {
    return { error: "Error: " + e.message };
  }
  return out;
}

export function runSuperheatSubcool(f) {
  const lines = ["Refrigerant: " + f.refrigerant, "Note: Sat temps from PT table — dew for superheat, bubble for subcooling.", "Verify against the OEM PT chart for the refrigerant.", ""];
  const r = shScValues(f);
  if (r.error) return { lines: [r.error] };
  if (r.superheat) {
    const { psig, line, sat, value } = r.superheat;
    lines.push("--- Superheat ---", `Suction: ${psig.toFixed(1)} psig → dew sat ${sat.toFixed(1)} °F`, `Line temp: ${line.toFixed(1)} °F`, `Superheat: ${value.toFixed(1)} °F`, "[APPROX] " + shGuide(value), "");
  }
  if (r.subcool) {
    const { psig, line, sat, value } = r.subcool;
    lines.push("--- Subcooling ---", `Liquid: ${psig.toFixed(1)} psig → bubble sat ${sat.toFixed(1)} °F`, `Line temp: ${line.toFixed(1)} °F`, `Subcooling: ${value.toFixed(1)} °F`, "[APPROX] " + scGuide(value), "");
  }
  return { lines };
}

const COOLING = new Set(["res-ac", "hp-cool", "commercial-rtu"]);
const TARGET_DT = {
  "res-ac": [15, 22, "typical residential cooling"],
  "hp-cool": [15, 22, "heat pump cooling"],
  "hp-heat": [20, 35, "heat pump heating"],
  "furnace": [35, 70, "check nameplate temperature rise"],
  "commercial-rtu": [15, 25, "packaged RTU cooling-ish"]
};

export function runAirflowDeltaT(f) {
  const sys = f.system || "res-ac";
  const supply = num(f.supply), ret = num(f.returnTemp);
  if (supply == null || ret == null) return { lines: ["Need supply and return temps."] };
  const [lo, hi, note] = TARGET_DT[sys];
  const dt = COOLING.has(sys) ? ret - supply : supply - ret;
  const status = dt < lo ? "low" : dt > hi ? "high" : "in-band";
  const mode = COOLING.has(sys) ? "cooling (return − supply)" : "heating (supply − return)";
  const lines = [
    `System: ${sys}`,
    `Supply: ${supply.toFixed(1)} °F | Return: ${ret.toFixed(1)} °F`,
    `Measured ΔT (${mode}): ${dt.toFixed(1)} °F`,
    `Typical band: ${lo}–${hi} °F (${note})`,
    `Band status: ${status}`
  ];
  let heat = num(f.btuh);
  const kw = num(f.kw);
  if (heat == null && kw != null) heat = kw * 3412;
  if (heat != null) {
    lines.push(`Heat input: ${heat.toFixed(0)} BTU/h`);
    if (Math.abs(dt) >= 0.5) lines.push(`Rough CFM ≈ ${(heat / (1.08 * Math.abs(dt))).toFixed(0)} (BTUh/(1.08×|ΔT|))`);
    else lines.push("Rough CFM: n/a (ΔT too small)");
  }
  lines.push("", "Check next (educational):", "1. Confirm probe placement", "2. Verify blower speed / clean filter");
  if (COOLING.has(sys) && status === "high") lines.push("3. High cool ΔT often = low airflow across evaporator");
  else if (COOLING.has(sys) && status === "low") lines.push("3. Low cool ΔT: check airflow then charge/metering");
  else lines.push("3. Spot-check static and SH/SC if capacity complaint");
  return { lines };
}

function esHpa(tc) { return 6.112 * Math.exp((17.62 * tc) / (243.12 + tc)); }
function f2c(f) { return (f - 32) * 5 / 9; }
function c2f(c) { return c * 9 / 5 + 32; }

export function runPsychrometrics(f) {
  const db = num(f.db);
  if (db == null) return { lines: ["Need dry-bulb °F."] };
  const psia = num(f.psia) ?? 14.696;
  let rh = num(f.rh);
  const wb = num(f.wb);
  const notes = [];
  if (f.inputMode === "wb" || (rh == null && wb != null)) {
    if (wb == null) return { lines: ["Need wet-bulb °F."] };
    if (wb > db + 0.05) return { lines: ["Wet-bulb cannot exceed dry-bulb."] };
    const dbc = f2c(db), wbc = f2c(wb);
    const pHpa = psia * 68.94757;
    let e = esHpa(wbc) - pHpa * (dbc - wbc) * 0.00066 * (1 + 0.00115 * wbc);
    e = Math.max(0.01, e);
    rh = Math.max(0, Math.min(100, 100 * e / esHpa(dbc)));
    notes.push("RH derived approx from DB/WB");
  }
  if (rh == null) return { lines: ["Need RH % or wet-bulb."] };
  const e = esHpa(f2c(db)) * (rh / 100);
  const ln = Math.log(e / 6.112);
  const dew = c2f((243.12 * ln) / (17.62 - ln));
  const ePsia = e / 68.94757;
  const W = 0.622 * ePsia / Math.max(1e-6, psia - ePsia);
  const h = 0.24 * db + W * (1061 + 0.444 * db);
  const lines = [
    `Dry-bulb: ${db.toFixed(1)} °F`,
    wb != null ? `Wet-bulb (input): ${wb.toFixed(1)} °F` : null,
    `RH: ${rh.toFixed(1)} %`,
    `Dew point (approx): ${dew.toFixed(1)} °F`,
    `Humidity ratio W: ${W.toFixed(5)} lb/lb da`,
    `Enthalpy h (approx): ${h.toFixed(1)} BTU/lb da`,
    "",
    "Notes:",
    ...notes.map((n) => "• " + n),
    "• Sea-level P default 14.696 psia unless overridden"
  ].filter(Boolean);
  return { lines };
}

const LIQ = {
  "R-410A": {"1/4":0.27,"3/8":0.58,"1/2":1.05,"5/8":1.65},
  "R-22": {"1/4":0.29,"3/8":0.62,"1/2":1.12,"5/8":1.75},
  "R-134a": {"1/4":0.25,"3/8":0.54,"1/2":0.98,"5/8":1.55},
  "R-404A": {"1/4":0.26,"3/8":0.56,"1/2":1.02,"5/8":1.60},
  "R-407C": {"1/4":0.27,"3/8":0.57,"1/2":1.04,"5/8":1.62},
  "R-32": {"1/4":0.22,"3/8":0.48,"1/2":0.88,"5/8":1.38},
  "R-454B": {"1/4":0.24,"3/8":0.52,"1/2":0.95,"5/8":1.48}
};
const INC = { "split-ac": 25, "package": 0, "walk-in": 0, "custom": 15 };

export function runChargeRecovery(f) {
  const factory = num(f.factoryLbs);
  if (factory == null || factory < 0) return { lines: ["Need factory charge (lb)."] };
  const ref = f.refrigerant || "R-410A";
  const sys = f.system || "split-ac";
  const liqFt = num(f.liquidFt) ?? 0;
  const lod = f.liquidOd || "3/8";
  const sucFt = num(f.suctionFt) ?? 0;
  const sod = f.suctionOd || lod;
  const inc = num(f.includedFt) ?? INC[sys];
  const bill = Math.max(0, liqFt - inc);
  const liqOz = bill * LIQ[ref][lod];
  const billS = Math.max(0, sucFt - inc);
  const sucOz = sucFt > 0 ? billS * LIQ[ref][sod] * 0.08 : 0;
  const recvOz = (num(f.receiverLbs) ?? 0) * 16;
  const extraOz = (num(f.extraLbs) ?? 0) * 16;
  const total = factory + (liqOz + sucOz + recvOz + extraOz) / 16;
  const cur = num(f.currentLbs);
  const lines = [
    `System: ${sys} | Refrigerant: ${ref}`,
    `Factory: ${factory.toFixed(2)} lb`,
    `Liquid: ${liqFt.toFixed(1)} ft @ ${lod}" (included ${inc} → billable ${bill.toFixed(1)} ft)`,
    "",
    "--- Approx additional ---",
    `Liquid line: ${liqOz.toFixed(1)} oz (${(liqOz/16).toFixed(2)} lb)`,
    `Suction approx: ${sucOz.toFixed(1)} oz`,
    `Receiver/extra: ${((recvOz+extraOz)/16).toFixed(2)} lb`,
    `Estimated TOTAL: ${total.toFixed(2)} lb`
  ];
  if (cur != null) {
    const d = total - cur;
    lines.push(`Current: ${cur.toFixed(2)} lb`);
    if (d > 0.05) lines.push(`Estimated to ADD: ${d.toFixed(2)} lb (${(d*16).toFixed(1)} oz)`);
    else if (d < -0.05) lines.push(`Estimated to RECOVER: ${Math.abs(d).toFixed(2)} lb`);
    else lines.push("Within ~0.05 lb of estimate (approx matched).");
  }
  lines.push("", "Checklist: confirm OEM chart; prefer weighed charge; zeotropes → liquid charge.");
  return { lines };
}
