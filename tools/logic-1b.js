/** Compute logic part 2 + shared num */
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}


const THR = {
  "comfort-cooling": [10, 10],
  "commercial-refrigeration": [20, 35],
  "industrial": [30, 35],
  "transport": [50, 50]
};

export function runLeakRate(f) {
  const full = num(f.fullCharge), added = num(f.added), days = num(f.days);
  if (full == null || full <= 0) return { lines: ["Full charge must be > 0."] };
  if (added == null || added < 0) return { lines: ["Added lbs required (>=0)."] };
  if (days == null || days <= 0) return { lines: ["Period days must be > 0."] };
  const cat = f.category || "commercial-refrigeration";
  const chem = f.chem || "hfc";
  const [hfc, hcfc] = THR[cat];
  const thr = chem === "hcfc" ? hcfc : hfc;
  const pct = (added / full) * (365 / days) * 100;
  const over = pct > thr;
  return {
    lines: [
      "!!! NOT A COMPLIANCE SYSTEM — NOT LEGAL ADVICE !!!",
      "",
      `Category: ${cat} | Chem: ${chem}`,
      `Full: ${full.toFixed(2)} lb | Added: ${added.toFixed(2)} lb in ${days.toFixed(1)} days`,
      `Annualized leak rate (practice): ${pct.toFixed(1)}% / yr`,
      `Educational threshold: ${thr}% / yr`,
      `Over educational band: ${over ? "YES" : "no"}`,
      "",
      "Reminders:",
      "1. Confirm full charge from nameplate",
      "2. Log in your official compliance system — not this tool",
      "3. Verify current EPA AIM Act / 608 thresholds",
      "",
      "!!! NOT A COMPLIANCE SYSTEM — NOT LEGAL ADVICE !!!"
    ]
  };
}

export function runElectrical(f) {
  const tool = f.tool || "amps";
  const lines = [];
  const pct = (m, r) => ((m - r) / Math.abs(r)) * 100;
  if (tool === "amps") {
    const m = num(f.measured);
    if (m == null) return { lines: ["Need measured amps."] };
    lines.push("--- FLA / RLA vs measured ---", `Measured: ${m.toFixed(2)} A`);
    const fla = num(f.fla), rla = num(f.rla);
    if (fla != null) {
      lines.push(`FLA: ${fla.toFixed(2)} A | delta ${pct(m, fla).toFixed(1)}%`);
      lines.push(m > fla * 1.1 ? "[APPROX] High vs FLA — check load/airflow/charge/voltage" : m < fla * 0.7 ? "[APPROX] Low vs FLA — verify meter/clamp" : "[APPROX] Often near common band vs FLA");
    }
    if (rla != null) {
      lines.push(`RLA: ${rla.toFixed(2)} A | delta ${pct(m, rla).toFixed(1)}%`);
      lines.push(m > rla * 1.15 ? "[APPROX] High vs RLA" : m < rla * 0.75 ? "[APPROX] Low vs RLA" : "[APPROX] Often near common band vs RLA");
    }
    if (fla == null && rla == null) lines.push("Provide FLA and/or RLA from nameplate.");
  } else if (tool === "capacitor") {
    const r = num(f.ratedMfd), m = num(f.measuredMfd);
    if (r == null || m == null) return { lines: ["Need rated and measured µF."] };
    const d = pct(m, r);
    lines.push("--- Capacitor check ---", "SAFETY: Discharge before handling.", `Rated ${r.toFixed(1)} µF | Measured ${m.toFixed(1)} µF | delta ${d.toFixed(1)}%`);
    lines.push(Math.abs(d) <= 6 ? "[APPROX] Within ±6% practice band" : Math.abs(d) <= 10 ? "[APPROX] Near ±10% edge — check OEM" : "[APPROX] Outside ±10% — suspect weak/failed");
  } else if (tool === "imbalance") {
    const ph = Number(f.phases) || 3;
    const v1 = num(f.v1), v2 = num(f.v2), v3 = num(f.v3);
    if (ph === 1) {
      if (v1 == null || v2 == null) return { lines: ["Need two voltages for 1φ."] };
      const avg = (v1 + v2) / 2;
      const imb = avg ? Math.abs(v1 - v2) / avg * 100 : 0;
      lines.push("--- 1φ imbalance ---", `A ${v1.toFixed(1)} V | B ${v2.toFixed(1)} V | avg ${avg.toFixed(1)}`, `Imbalance: ${imb.toFixed(2)}%`);
      lines.push(imb <= 2 ? "[APPROX] Low" : imb <= 5 ? "[APPROX] Moderate — check neutrals" : "[APPROX] High — check utility/open neutral");
    } else {
      if (v1 == null || v2 == null || v3 == null) return { lines: ["Need three voltages for 3φ."] };
      const avg = (v1 + v2 + v3) / 3;
      const maxDev = Math.max(Math.abs(v1 - avg), Math.abs(v2 - avg), Math.abs(v3 - avg));
      const imb = avg ? maxDev / avg * 100 : 0;
      lines.push("--- 3φ imbalance ---", `Vab=${v1.toFixed(1)} Vbc=${v2.toFixed(1)} Vca=${v3.toFixed(1)}`, `Imbalance: ${imb.toFixed(2)}% (NEMA-style)`);
      lines.push(imb <= 2 ? "[APPROX] Within common ≤2% target" : imb <= 3 ? "[APPROX] Elevated" : "[APPROX] High — motor heating risk");
    }
  } else {
    const mode = f.lraMode || "locked-rotor";
    lines.push("--- Locked-rotor vs running notes ---", "LOTO before wiring work.", `Mode: ${mode}`);
    if (mode === "locked-rotor") {
      lines.push("• Do not repeatedly bang a locked compressor", "• Check start/run capacitor µF and voltage under load", "• Megger windings after LOTO");
    } else {
      lines.push("• Compare amps to RLA/FLA", "• Check voltage at unit under load", "• High amps + normal V → load/airflow/charge");
    }
  }
  return { lines };
}

export function runBoxLoad(f) {
  const L = num(f.L), W = num(f.W), H = num(f.H);
  if (L == null || W == null || H == null) return { lines: ["Need L×W×H."] };
  const box = f.box || "cooler";
  let target = num(f.target);
  if (box === "cooler") target = 35;
  else if (box === "freezer") target = -10;
  if (target == null) target = 35;
  const amb = num(f.ambient) ?? 95;
  const dT = amb - target;
  if (dT <= 0) return { lines: ["Ambient must be warmer than box target."] };
  const wr = num(f.wallR) ?? 28, fr = num(f.floorR) ?? wr;
  const Aw = 2 * (L * H + W * H), Ac = L * W, Af = L * W, vol = L * W * H;
  const tx = (Aw / wr) * dT + (Ac / wr) * dT + (fr < 5000 ? (Af / fr) * dT : 0);
  const doorA = num(f.doorA) ?? 0, opens = num(f.opens) ?? 0, acpd = num(f.acpd) ?? 8;
  let inf = vol * (acpd / 24) / 60 * 1.08 * dT;
  if (doorA > 0 && opens > 0) inf += (doorA * 7 * opens) / (24 * 60) * 1.08 * dT;
  const lbs = num(f.lbs) ?? 0, enter = num(f.enter) ?? 50, cp = num(f.cp) ?? 0.75;
  const pr = lbs > 0 ? lbs * cp * Math.max(enter - target, 0) / 24 : 0;
  const misc = (num(f.lightsW) ?? 0) * 3.412 + (num(f.fansW) ?? 0) * 3.412;
  const sub = tx + inf + pr + misc;
  const sf = num(f.safety) ?? 15;
  const tot = sub * (1 + sf / 100);
  const bands = [[3000,"2–3k"],[6000,"3–6k"],[12000,"9–12k (~1 ton)"],[24000,"18–24k"],[36000,"24–36k"],[60000,"48–60k"],[120000,"90–120k"]];
  let sug = "120k+ class";
  for (const [lim, lab] of bands) { if (tot <= lim) { sug = lab + " BTU/hr class"; break; } }
  return { lines: [
    `Box: ${L}×${W}×${H} ft | Vol ${vol.toFixed(0)} ft³`,
    `Type: ${box} @ ${target}°F | Amb ${amb}°F | ΔT ${dT.toFixed(1)}°F`,
    "",
    "--- Load (BTU/hr, approx) ---",
    `Transmission: ${tx.toFixed(0)}`,
    `Infiltration: ${inf.toFixed(0)}`,
    `Product:      ${pr.toFixed(0)}`,
    `Misc:         ${misc.toFixed(0)}`,
    `Subtotal:     ${sub.toFixed(0)}`,
    `TOTAL w/ ${sf}% SF: ${tot.toFixed(0)}`,
    "",
    `Rough unit band: ${sug}`,
    "Not for stamped bids — use OEM/ASHRAE for design."
  ]};
}

export function runDuctStatic(f) {
  const shape = f.shape || "rect";
  const w = num(f.width), h = num(f.height), cfm = num(f.cfm);
  if (w == null) return { lines: ["Need width or diameter."] };
  let a;
  if (shape === "round") {
    const r = w / 24;
    a = Math.PI * r * r;
  } else {
    if (h == null) return { lines: ["Need height for rect duct."] };
    a = (w / 12) * (h / 12);
  }
  const lines = [`Internal area (approx): ${a.toFixed(3)} ft²`];
  const MAX = { "supply-main": 900, "supply-branch": 700, "return-main": 700, "return-branch": 600, flex: 500 };
  const dt = f.ductType || "supply-main";
  const lim = MAX[dt] || 700;
  if (cfm != null && a > 0) {
    const vel = cfm / a;
    lines.push(`CFM: ${cfm.toFixed(0)} → velocity ≈ ${vel.toFixed(0)} FPM`);
    lines.push(`Educational guide (${dt}): under ~${lim} FPM`);
    lines.push(vel > lim ? "Status: ABOVE educational band" : "Status: within educational band");
    lines.push(`Friction reminder: ΔP rises ~V² — factor ≈ ${((vel / lim) ** 2).toFixed(2)}× vs guide`);
  }
  let total = 0;
  const parts = [];
  const fd = num(f.filterDp), cd = num(f.coilDp), od = num(f.otherDp) ?? 0;
  if (fd != null) { parts.push(`filter ${fd.toFixed(2)}"`); total += fd; }
  if (cd != null) { parts.push(`coil ${cd.toFixed(2)}"`); total += cd; }
  if (od) { parts.push(`other ${od.toFixed(2)}"`); total += od; }
  if (parts.length) {
    lines.push("", `Component ΔP: ${parts.join(", ")}`, `Sum ≈ ${total.toFixed(2)} in. w.c.`, "Compare to blower ESP table (OEM)");
  }
  lines.push("", "Checklist:", "[ ] Measure TESP at design fan speed", "[ ] Separate filter and coil ΔP", "[ ] Flex: stretch fully, minimize sag");
  return { lines };
}
