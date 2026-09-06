/** Checklist / report logic (part 2) — educational */

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dash(v) { return (v == null || String(v).trim() === "") ? "—" : String(v).trim(); }

export function runCompressorDiag(f) {
  const symptom = f.symptom || "high-amps";
  const sh = num(f.sh), sc = num(f.sc);
  const safety = [
    "LOTO electrical before meggering or changing compressor",
    "Recover refrigerant safely before opening the circuit",
    "Verify capacitor discharge / inverter DC bus wait if applicable"
  ];
  const tables = {
    "high-discharge-temp": {
      checks: ["Confirm DLT 6–8\" from compressor", "High SH / low charge / restriction → check SH/SC", "Dirty condenser / failed OD fan → high head + DLT", "Check oil / cooling; windings amp & imbalance"],
      parts: ["Condenser fan", "Filter-drier", "TXV/piston", "Compressor (last)"]
    },
    floodback: {
      checks: ["Low SH: TXV hunting, oversized orifice, iced coil", "Crankcase heater offline; migration on off-cycle", "Check accumulator and piping pitch"],
      parts: ["TXV", "Crankcase heater", "Accumulator", "Coil / airflow"]
    },
    "short-cycle": {
      checks: ["Control: thermostat / short-cycle timer / pressure switches", "High head cutout: dirty condenser, overcharge", "Low pressure: low charge, restriction, low airflow", "Electrical: contactor chatter, low voltage"],
      parts: ["Contactor", "HP/LP switches", "Capacitor", "Thermostat"]
    },
    "locked-rotor": {
      checks: ["Do not repeatedly reset", "Hard-start / capacitor — measure µF", "Seized bearings / flooded start", "Single-phasing on 3φ; megger after LOTO"],
      parts: ["Start/run capacitor", "Hard-start kit", "Contactor", "Compressor"]
    },
    "high-amps": {
      checks: ["Compare RLA/FLA to measured clamp amps", "High head raises amps — fix air-side first", "Low voltage / imbalance; liquid flood density"],
      parts: ["Capacitor", "Contactor", "Condenser fan", "Compressor"]
    }
  };
  const t = tables[symptom];
  let checks = t.checks.slice();
  if (sh != null && ["high-discharge-temp", "high-amps", "floodback"].includes(symptom)) {
    if (sh < 5) checks.unshift("Context: low SH — prioritize floodback / overfeed");
    else if (sh > 30) checks.unshift("Context: high SH — prioritize low charge / restriction");
  }
  const ranked = safety.concat(sh != null || sc != null ? [`Reported SH ${sh ?? "—"} / SC ${sc ?? "—"}`] : [], checks);
  const lines = [`Symptom: ${symptom}`, "", "Ranked checks:"];
  ranked.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  lines.push("", "Parts to consider:");
  t.parts.forEach((p) => lines.push("• " + p));
  return { lines };
}

export function runTxvEev(f) {
  const valve = f.valve || "txv", symptom = f.symptom || "general";
  const sh = num(f.sh), sc = num(f.sc);
  const ranked = [
    "Confirm airflow first before condemning the valve",
    "Measure SH at evaporator outlet / compressor per OEM",
    "Measure SC at condenser outlet; separate charge vs metering"
  ];
  if (sh != null) ranked.push(`Reported SH ≈ ${sh.toFixed(1)} °F — compare to OEM target`);
  if (sc != null) ranked.push(`Reported SC ≈ ${sc.toFixed(1)} °F`);
  if (valve === "txv" || valve === "unknown") {
    ranked.push("TXV bulb: tight, correct orientation, insulated", "Equalizer open / not kinked", "Inlet screen / drier restriction → high SH", "Power element loss → valve closed / high SH");
  }
  if (valve === "eev" || valve === "unknown") {
    ranked.push("EEV: prove sensors and % open before replacing valve", "Compare % open to SH error", "Sensor faults drive wrong position", "Stepper wiring / lost steps after power loss");
  }
  if (symptom === "hunting") ranked.splice(3, 0, "Hunting: unstable load, oversized valve, bulb loose, or EEV PID");
  if (symptom === "high-sh") ranked.splice(3, 0, "High SH: underfeed — restriction, loss of charge, valve closed");
  if (symptom === "low-sh") ranked.splice(3, 0, "Low SH: overfeed / flood risk — bulb warm, valve stuck open");
  ranked.push("Charge: weigh-in / OEM charts; blends not pressure-only topped", "Document SH/SC, valve type, bulb location, EEV % before parts");
  const lines = [`Valve: ${valve} | Symptom: ${symptom}`, "", "Ranked checks:"];
  ranked.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  lines.push("", "Parts (last): filter-drier, TXV element, EEV stepper after proven, sensors");
  return { lines };
}

export function runVacuumCoach(f) {
  const mode = f.mode || "coach";
  const lines = [`Mode: ${mode}`, ""];
  if (mode === "coach") {
    lines.push("Evacuation coach:");
    [
      "Use a digital MICRON gauge — compound inches are not microns",
      "Educational target: below 500 microns (follow OEM 250–500)",
      "Gauge on system, preferably far from the pump",
      "Remove Schrader cores; short large-diameter hoses",
      "Fresh pump oil; isolate pump and watch HOLD",
      "Blank-off gauge first to prove instrument",
      "Nitrogen sweep / triple evac when OEM calls for it"
    ].forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  } else if (mode === "interpret-decay") {
    const start = num(f.startMicron), after = num(f.afterMicron), minutes = num(f.minutes);
    if (start == null || after == null || minutes == null || minutes <= 0) {
      return { lines: ["Need start microns, after microns, and hold minutes > 0."] };
    }
    const rise = after - start, rate = rise / minutes;
    lines.push(`Hold: ${start.toFixed(0)} → ${after.toFixed(0)} µ over ${minutes.toFixed(1)} min (Δ ${rise >= 0 ? "+" : ""}${rise.toFixed(0)}, ~${rate.toFixed(0)} µ/min)`, "", "Educational interpretation:");
    if (rise <= 50 && after <= 500) lines.push("• Small/no rise near target — often acceptable (verify OEM)");
    else if (rise > 0 && rate < 50 && after < 1000) lines.push("• Slow rise — often outgassing / moisture; continue evacuate");
    else if (rate >= 50 && rate < 200) lines.push("• Moderate rise — moisture or small leak");
    else lines.push("• Fast rise — suspect leak, open core, wet system, or gauge leak");
    lines.push("• Always blank-off gauge before condemning the system");
  } else {
    lines.push("Checklist before charge:");
    [
      "Micron target met and hold acceptable per OEM",
      "Pump isolated; gauge still on system",
      "Cores reinstalled / torqued",
      "Weigh-in charge ready; cylinder matches nameplate",
      "No pressure-only top-off for zeotropic blends",
      "Break vacuum with refrigerant only as OEM specifies",
      "Document microns, hold time, and charge lbs"
    ].forEach((s, i) => lines.push(`[ ] ${i + 1}. ${s}`));
  }
  return { lines };
}
