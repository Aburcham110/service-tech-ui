/** A2L, defrost, oil, case checklists */
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}


export function runA2lChecklist(f) {
  const ref = f.refrigerant || "R-454B", job = f.job || "both";
  const sections = [
    ["Pre-job", ["Identify refrigerant on nameplate and SDS", "Confirm ventilation / room volume vs charge", "Survey ignition sources — control or remove", "Use A2L-rated recovery, vacuum, manifold, leak detector", "Verify recovery cylinder class compatible"]],
    ["Brazing / joining", ["NEVER braze on a charged system — recover first", "Purge with dry nitrogen while heating", "Prefer OEM-approved joints", "Keep hot work away from cylinders"]],
    ["Charge", ["Weigh-in only — document cylinder start/stop", "No pressure-only top-off for zeotropes", "Charge liquid where OEM specifies", "Stay within nameplate / OEM line charts"]],
    ["Commission", ["Confirm RDS / sensors if required", "Functional-check leak mitigation per OEM", "Document sensor locations and tests", "Verify airflow / clearances / vent paths"]],
    ["Cylinder / MOT", ["Transport upright, secured; valves capped", "Know local flammable-gas transport rules (AHJ)", "Do not mix refrigerants; label contents", "Store away from heat / ignition"]]
  ];
  const lines = [`Refrigerant: ${ref} | Job: ${job}`, ""];
  let n = 0;
  for (const [title, items] of sections) {
    lines.push(`## ${title}`);
    for (const item of items) { n++; lines.push(`[ ] ${n}. ${item}`); }
    lines.push("");
  }
  lines.push("A2L = mildly flammable; ignition control and rated tools are non-optional.");
  return { lines };
}

export function runDefrostChecklist(f) {
  const box = f.box || "freezer", mode = f.mode || "time-clock";
  const steps = [
    "LOTO before opening panels",
    "Confirm box setpoint and product load",
    "Identify defrost control type",
    "Record defrost count/day and duration",
    "Verify terminate device (probe / Klixon / pressure / failsafe)",
    "Inspect frost pattern before forcing defrost",
    "Force/wait for defrost; confirm compressor off as designed",
    "Measure heater V/A vs nameplate during defrost",
    "Confirm drain pan heater / clear drain",
    "Check fan delay / drip time after terminate",
    "After fans on: watch water blow-off / short-cycle",
    "Verify door/frame heaters on freezers if gasket ice",
    "Document temps and controller history"
  ];
  if (mode === "time-clock") {
    steps.splice(4, 0, "Time clock: verify time-of-day, failsafe, pin/program", "Confirm clock power reserve / battery");
  } else if (mode === "demand") {
    steps.splice(4, 0, "Demand: confirm coil/air sensors seated", "Review adaptive parameters (max interval, terminate, lockouts)");
  }
  if (box === "freezer") {
    steps.push("Freezer: confirm electric / hot-gas type matches test", "Check hot-gas valves if applicable");
  } else {
    steps.push("Cooler: off-cycle defrost may be normal — confirm heaters before condemning");
  }
  const lines = [`Path: ${box} | mode: ${mode}`, "", "Checklist:"];
  steps.forEach((s, i) => lines.push(`[ ] ${i + 1}. ${s}`));
  lines.push("", "Failure notes:", "• Ice one end → airflow / heater partial", "• 0 A heaters → open element / contactor", "• Always TIME terminate → heaters/drain/probe", "• Fans slam on wet coil → missing fan delay");
  return { lines };
}

export function runOilRack(f) {
  const symptom = f.symptom || "general";
  const base = [
    "LOTO before opening oil lines",
    "Confirm which circuit/compressor alarmed; note oil P & reservoir",
    "Check separator differential vs OEM band",
    "Inspect/replace oil filters; note bypass indicator",
    "Verify oil float / level regulator and equalizer lines",
    "Confirm reservoir heater and oil type match OEM",
    "Check oil return solenoid / orifice / check valves",
    "Look for oil traps / double risers on suction",
    "Oil logging signs: cold sticky suction, low capacity",
    "EPR stability: hunting may push oil differently",
    "After service: watch oil through pull-down and one defrost"
  ];
  const extra = {
    "low-oil-alarm": ["Priority: verify probe & wiring before mechanical oil failure", "Do not keep resetting oil fail"],
    "high-separator-dp": ["Separator/coalescer due — check sludge/acid", "Excess oil after compressor changeout"],
    "oil-logging": ["Warm suction / raise velocity; check TXV", "Check defrost return slug paths / header pitch"],
    "unstable-epr": ["EPR hunting: pilot, strainer, oversized valve", "Fix pressure control before chasing oil"],
    general: ["Walk oil path: compressor → separator → reservoir → regulators → returns"]
  };
  const items = base.concat(extra[symptom] || []);
  const lines = [`Symptom: ${symptom}`, "", "Call tree:"];
  items.forEach((s, i) => lines.push(`[ ] ${i + 1}. ${s}`));
  return { lines };
}

export function runCaseController(f) {
  const focus = f.focus || "full";
  const blocks = [];
  if (focus === "order-of-ops" || focus === "full") {
    blocks.push(["Order of operations", [
      "PROBES first → wiring/power → then programming",
      "Do not reflash/replace controller before proving sensors",
      "Map probe IDs to physical locations on drawing",
      "Stabilize temps before chasing intermittent EEV/defrost alarms"
    ]]);
  }
  if (focus === "probes" || focus === "full") {
    blocks.push(["Probes", [
      "Discharge air probe in stream, not against metal wall",
      "Return/product probe representative of load",
      "Defrost terminate in coldest coil location per OEM",
      "Compare live readings to calibrated thermometer",
      "Open/shorted: ohms vs OEM chart; reseat connectors",
      "Reversed probes cause wrong cut-in and crazy terminate"
    ]]);
  }
  if (focus === "defrost-history" || focus === "full") {
    blocks.push(["Defrost history", [
      "Read TIME vs TEMP terminate vs failsafe",
      "Always TEMP early → probe warm/shorted/wrong place",
      "Always TIME → heaters open, contactor, drain freeze, probe cold",
      "Watch one full refrigerate → defrost → drip → refrigerate"
    ]]);
  }
  if (focus === "eev-hunting" || focus === "full") {
    blocks.push(["EEV hunting", [
      "Often upstream: bad probe, wrong setpoint, unstable suction",
      "Check % open vs SH error; sensor faults before replacing valve",
      "EPR/holdback swings look like valve hunting",
      "Verify SH target and probe used for SH calc"
    ]]);
  }
  const lines = [`Focus: ${focus}`, ""];
  let n = 0;
  for (const [title, items] of blocks) {
    lines.push(`## ${title}`);
    for (const item of items) { n++; lines.push(`[ ] ${n}. ${item}`); }
    lines.push("");
  }
  return { lines };
}
