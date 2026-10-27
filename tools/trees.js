/**
 * Step-by-step troubleshooting trees by equipment type. Generic field diagnostic logic only:
 * no brand error codes or OEM specs (none are bundled with a source; see the manuals links instead).
 *
 * Node: { text, tools?: [toolId], options?: [{ label, next } | { label, tree }] }
 *   leaf nodes have end: true and no options. tools link into tool.html?id=<toolId>.
 */
export const TREES = {
  "mini-split": {
    title: "Ductless mini-split",
    start: "start",
    nodes: {
      start: { text: "What is the complaint?", options: [
        { label: "Unit dead / won't respond", next: "power" },
        { label: "Error code or blinking LEDs", next: "code" },
        { label: "Communication error / indoor–outdoor link", next: "comm-link" },
        { label: "Runs but poor cooling / heating", next: "airflow" },
        { label: "Water dripping from the indoor unit", next: "water" },
        { label: "Outdoor coil iced in heat mode", next: "defrost" },
      ] },
      power: { text: "Measure supply voltage at the outdoor disconnect and at the outdoor unit's terminal block (power and indoor/outdoor connection terminals). Within the nameplate voltage range?", tools: ["electrical"], options: [
        { label: "Yes", next: "respond" }, { label: "No", next: "fix-power" },
      ] },
      "fix-power": { end: true, text: "Restore supply first: breaker, disconnect, fuses, wiring and terminations. Re-check voltage under load before going further.", tools: ["electrical"] },
      respond: { text: "With power present, does the indoor unit respond to the remote/wall control (beep, display, louver moves)?", options: [
        { label: "Yes", next: "airflow" }, { label: "No", next: "comm" },
      ] },
      comm: { end: true, text: "Suspect the remote/receiver, the indoor board, or the indoor–outdoor connection wiring. Check wire gauge, terminations and terminal order against the OEM installation manual; board diagnostics come from the OEM service literature (see Manuals on the call card).", tools: ["electrical", "nameplate-faults"] },
      "comm-link": { text: "Power off and locked out: check the indoor–outdoor connection cable. Gauge and cable type as the installation manual specifies, terminals tight, terminal order matched end to end, no splices, nicks or water in the run. Wiring OK?", tools: ["electrical"], options: [
        { label: "Yes, wiring checks out", next: "comm-power" }, { label: "No, found a problem", next: "comm-fix" },
      ] },
      "comm-fix": { end: true, text: "Correct the connection wiring (gauge, terminations, terminal order, damaged sections), then power up and re-check before replacing any board.", tools: ["electrical"] },
      "comm-power": { text: "Power on. Using the wiring diagram, is the outdoor unit supplying power to the indoor unit on the marked connection terminals?", tools: ["electrical"], options: [
        { label: "Yes, indoor unit has power", next: "comm-signal" }, { label: "No", next: "comm-od" },
      ] },
      "comm-od": { end: true, text: "No power out to the indoor unit: check the outdoor unit's supply, fuses and terminal block, then follow the OEM service procedure for the outdoor board.", tools: ["electrical"] },
      "comm-signal": { end: true, text: "Power reaches the indoor unit but the units still don't talk: check grounding, induced noise (cable run beside other line-voltage wiring), and that the indoor and outdoor models are a listed match. Record the displayed code exactly and follow the OEM communication diagnostic for that model; this app doesn't carry brand codes.", tools: ["electrical", "nameplate-faults", "job-log"] },
      code: { end: true, text: "Record the code exactly (which LEDs, how many flashes, any remote/controller display) plus indoor and outdoor model/serial. Look the code up only in the OEM service literature for that model (Manuals on the call card). This app doesn't carry brand error codes.", tools: ["nameplate-faults", "job-log"] },
      airflow: { text: "Filters and indoor coil clean, blower wheel clean, and the indoor fan running at the set speed? Measure the return/supply split.", tools: ["airflow-delta-t", "psychrometrics"], options: [
        { label: "Airflow problem found", next: "fix-airflow" }, { label: "Airflow OK", next: "charge" },
      ] },
      "fix-airflow": { end: true, text: "Clean filters, coil and blower wheel; clear obstructions; correct the fan setting. Re-measure ΔT after it stabilizes.", tools: ["airflow-delta-t"] },
      charge: { text: "Measure superheat and subcooling after 15+ minutes of steady running. Inverter compressors change speed, so read at a stable speed (OEM test or forced mode if the manual has one). What do you see?", tools: ["superheat-subcool"], options: [
        { label: "High superheat, low subcool", next: "leak" },
        { label: "High superheat, high subcool", next: "metering" },
        { label: "Low superheat, high subcool", next: "overcharge" },
        { label: "Both normal", next: "elec" },
      ] },
      leak: { end: true, text: "Undercharge: find and repair the leak (flare joints first on ductless), then evacuate and weigh in the nameplate charge plus any line-set adder from the OEM manual.", tools: ["leak-rate", "vacuum-coach", "charge-recovery", "a2l-checklist"] },
      metering: { end: true, text: "Restriction or metering fault: check EEV coil/connector and movement, kinked or crushed line set, and strainers.", tools: ["txv-eev"] },
      overcharge: { end: true, text: "Overcharge (or non-condensables): recover to the weighed nameplate charge; if pressures stay high, recover, evacuate and recharge by weight.", tools: ["charge-recovery", "vacuum-coach"] },
      elec: { end: true, text: "Charge and airflow check out: compare compressor and fan amps to the nameplate and follow the OEM service procedure for inverter/board diagnosis.", tools: ["electrical", "compressor-diag"] },
      water: { end: true, text: "Check drain slope and trap, a blocked pan or drain line, the condensate pump if fitted, and coil icing (low airflow or charge).", tools: ["airflow-delta-t", "superheat-subcool"] },
      defrost: { text: "Is the outdoor coil fully iced and not clearing after a defrost cycle?", options: [
        { label: "Yes, stays iced", next: "defrost-fail" }, { label: "Clears normally", next: "charge" },
      ] },
      "defrost-fail": { end: true, text: "Check outdoor coil/defrost sensor, drainage under the outdoor unit (refreezing), and the reversing valve; follow the OEM defrost sequence description.", tools: ["defrost-checklist", "electrical"] },
    },
  },

  "split-ac-hp": {
    title: "Split / packaged AC or heat pump",
    start: "start",
    nodes: {
      start: { text: "What is the complaint?", options: [
        { label: "Outdoor unit / compressor not running", next: "call" },
        { label: "Runs but poor cooling / heating", next: "airflow" },
        { label: "No cooling, compressor running: read the pressures", next: "pressures" },
        { label: "Short cycling", next: "short" },
        { label: "Indoor blower not running", next: "blower" },
        { label: "Heat pump iced in heat mode", next: "defrost" },
      ] },
      call: { text: "Is 24 V present across the contactor coil (Y call)?", tools: ["electrical"], options: [
        { label: "Yes", next: "contactor" }, { label: "No", next: "lowvolt" },
      ] },
      lowvolt: { end: true, text: "No call: check thermostat and wiring, the low-voltage fuse and transformer, and safeties in series with Y (float switch, pressure switches, lockout board).", tools: ["electrical"] },
      contactor: { text: "Contactor pulled in, with line voltage on the load side?", tools: ["electrical"], options: [
        { label: "Yes", next: "to-comp" }, { label: "No", next: "fix-contactor" },
      ] },
      "fix-contactor": { end: true, text: "Check supply at the line side, then the contactor coil and contacts (pitted or burnt).", tools: ["electrical"] },
      "to-comp": { text: "Line voltage reaches the unit but the compressor and/or condenser fan won't run.", tools: ["electrical"], options: [
        { label: "Go to the compressor tree", tree: "compressor" },
        { label: "Fan only: check fan capacitor and motor", next: "fan" },
      ] },
      fan: { end: true, text: "Check the condenser fan capacitor against its rated µF, motor windings and amps against the nameplate FLA.", tools: ["electrical"] },
      airflow: { text: "Measure ΔT and external static. Filter, blower, coil and ducts OK?", tools: ["airflow-delta-t", "duct-static", "psychrometrics"], options: [
        { label: "Airflow problem found", next: "fix-airflow" }, { label: "Airflow OK", next: "charge" },
      ] },
      "fix-airflow": { end: true, text: "Correct the airflow problem (filter, blower speed/wheel, coil, duct restriction), then re-measure.", tools: ["airflow-delta-t", "duct-static"] },
      charge: { text: "Measure superheat and subcooling (TXV: charge to subcool; fixed orifice: superheat). What do you see?", tools: ["superheat-subcool", "txv-eev"], options: [
        { label: "High superheat, low subcool", next: "leak" },
        { label: "High superheat, high subcool", next: "metering" },
        { label: "Low superheat, high subcool", next: "overcharge" },
        { label: "Both normal", next: "comp-check" },
      ] },
      leak: { end: true, text: "Undercharge: leak search and repair, evacuate, recharge.", tools: ["leak-rate", "vacuum-coach", "charge-recovery", "a2l-checklist"] },
      metering: { end: true, text: "Restriction or metering: TXV bulb/equalizer, liquid-line drier pressure drop, kinked lines.", tools: ["txv-eev"] },
      overcharge: { end: true, text: "Overcharge or dirty condenser / non-condensables: clean the coil, then recover to the correct charge.", tools: ["charge-recovery"] },
      pressures: { text: "After 15+ minutes running, read suction and head pressures and convert to saturation temperatures. Which stands out?", tools: ["superheat-subcool"], options: [
        { label: "High head pressure", next: "high-head" },
        { label: "Low suction pressure", next: "low-suction" },
        { label: "Both look normal", next: "comp-check" },
      ] },
      "high-head": { text: "Condenser coil clean, nothing recirculating hot air, and the condenser fan running at full speed?", tools: ["electrical"], options: [
        { label: "No", next: "fix-condenser" }, { label: "Yes", next: "high-head-charge" },
      ] },
      "fix-condenser": { end: true, text: "Clean the condenser coil, clear recirculation or obstructions, and repair the condenser fan (capacitor, motor, amps vs nameplate FLA). Re-read head pressure after it stabilizes.", tools: ["electrical"] },
      "high-head-charge": { end: true, text: "Condenser side is OK: measure subcooling. High subcool points to overcharge; high head without high subcool can point to non-condensables. Recover, evacuate and recharge by weight to the nameplate charge.", tools: ["superheat-subcool", "charge-recovery", "vacuum-coach"] },
      "low-suction": { text: "Indoor airflow OK: filter, blower, evaporator coil clean and not iced?", tools: ["airflow-delta-t", "duct-static"], options: [
        { label: "No, airflow problem", next: "fix-airflow" }, { label: "Yes, airflow OK", next: "charge" },
      ] },
      "comp-check": { end: true, text: "Charge and airflow OK but low capacity: check compressor efficiency (head–suction differential, amps).", tools: ["compressor-diag", "electrical"] },
      short: { end: true, text: "Check thermostat location and wiring, pressure switches tripping (high head: dirty condenser or overcharge; low: low charge or airflow), and the compressor overload.", tools: ["electrical", "superheat-subcool", "compressor-diag"] },
      blower: { end: true, text: "Check the blower motor capacitor or ECM power/signal, motor amps, the board's fan output and the door switch.", tools: ["electrical"] },
      defrost: { end: true, text: "Check the defrost board/sensor, reversing valve, outdoor fan relay and charge. Follow the OEM defrost sequence.", tools: ["defrost-checklist", "superheat-subcool"] },
    },
  },

  compressor: {
    title: "Compressor",
    start: "start",
    nodes: {
      start: { text: "What is the compressor doing?", options: [
        { label: "Won't start / hums", next: "volt" },
        { label: "Trips on overload / runs hot", next: "hot" },
        { label: "Runs but low capacity or noisy", next: "capacity" },
        { label: "Trips the breaker", next: "breaker" },
      ] },
      volt: { text: "Voltage at the compressor terminals during the start attempt, within ±10% of nameplate?", tools: ["electrical"], options: [
        { label: "Yes", next: "cap" }, { label: "No", next: "supply" },
      ] },
      supply: { end: true, text: "Low or missing voltage: check supply, contactor, wiring and voltage drop on start.", tools: ["electrical"] },
      cap: { text: "Run/start capacitor (if fitted) within its rated µF, and start relay OK?", tools: ["electrical"], options: [
        { label: "Yes", next: "windings" }, { label: "No", next: "replace-cap" },
      ] },
      "replace-cap": { end: true, text: "Replace the failed capacitor or relay with the rating specified on the unit/OEM parts list, then retest amps.", tools: ["electrical"] },
      windings: { end: true, text: "Measure winding resistance (C–S, C–R, S–R) and to ground. Compare with the OEM compressor data for that model (Copeland OPI / Tecumseh documents via Manuals). An internal overload may be open on a hot compressor: let it cool. LRA draw with good windings points to a locked/seized compressor.", tools: ["electrical", "compressor-diag", "nameplate-faults"] },
      hot: { end: true, text: "Check discharge line temperature and suction superheat (high SH = low charge or restriction), compression ratio and condenser airflow; check voltage balance and amps vs RLA.", tools: ["compressor-diag", "superheat-subcool", "electrical"] },
      capacity: { end: true, text: "Compare suction/discharge to expected; a low head–suction differential with normal charge points to internal wear. Low superheat or noise can mean floodback: check metering and evaporator airflow.", tools: ["compressor-diag", "superheat-subcool", "txv-eev"] },
      breaker: { end: true, text: "Check windings to ground (megohm), wiring and terminals, and breaker size vs MOP on the nameplate.", tools: ["electrical", "nameplate-faults"] },
    },
  },

  "walk-in": {
    title: "Commercial walk-in / refrigeration",
    start: "start",
    nodes: {
      start: { text: "What is the complaint?", options: [
        { label: "Box warm: is the evaporator iced?", next: "warm-coil" },
        { label: "Box warm, condensing unit running", next: "fans" },
        { label: "Box warm, condensing unit off", next: "off" },
        { label: "Evaporator iced", next: "ice" },
        { label: "Temperature swings / controller alarm", next: "ctrl" },
        { label: "Rack: oil or compressor alarms", next: "rack" },
      ] },
      fans: { text: "Evaporator fans running and coil clear of ice?", options: [
        { label: "Yes", next: "sh" }, { label: "No / iced", next: "ice" },
      ] },
      "warm-coil": { text: "Box is warm. Look at the evaporator coil and fans. What do you see?", options: [
        { label: "Coil iced", next: "ice-pattern" },
        { label: "No ice, fans running", next: "warm-noice" },
        { label: "Evaporator fans not running", next: "fans-off" },
      ] },
      "ice-pattern": { text: "Is the whole coil blocked with ice, or only the first passes / one section?", options: [
        { label: "Whole coil blocked", next: "ice" },
        { label: "Only the first passes / partial frost", next: "starved" },
      ] },
      "warm-noice": { text: "Coil clear and fans running: is the condensing unit running?", options: [
        { label: "Yes", next: "sh" }, { label: "No", next: "off" },
      ] },
      "fans-off": { end: true, text: "Check the evaporator fan motors and supply, the controller fan output, and any fan delay after defrost (it should release once the coil is cold again).", tools: ["electrical", "case-controller"] },
      sh: { text: "Measure evaporator superheat and suction pressure. What do you see?", tools: ["superheat-subcool", "txv-eev"], options: [
        { label: "High superheat", next: "starved" }, { label: "Normal superheat", next: "load" },
      ] },
      starved: { end: true, text: "Starved evaporator: low charge (sight glass, subcool), plugged drier/strainer, or a TXV problem.", tools: ["txv-eev", "leak-rate", "charge-recovery"] },
      load: { end: true, text: "Refrigeration side OK: check doors, gaskets, strip curtains, heater wires, and product load against box capacity.", tools: ["box-load"] },
      off: { end: true, text: "Check the thermostat/controller call, liquid-line solenoid, low-pressure control (pump-down), high-pressure and oil safeties, then the electrical supply.", tools: ["case-controller", "electrical", "compressor-diag"] },
      ice: { end: true, text: "Check defrost: heaters and termination, time clock or demand settings, fan delay, and the drain-line heater.", tools: ["defrost-checklist", "case-controller"] },
      ctrl: { end: true, text: "Probes first (location and calibration), then defrost history and EEV behaviour.", tools: ["case-controller"] },
      rack: { end: true, text: "Work the oil system: separator, filters, level controls; log oil levels and compressor alarms.", tools: ["oil-rack", "compressor-diag"] },
    },
  },
};

/** Picks a tree from the call-card equipment select and/or scanned plate values. */
export function chooseTree({ equipment, unitType, brand, model } = {}) {
  const ut = String(unitType || "").toLowerCase();
  if (ut === "compressor") return "compressor";
  if (ut === "condensing unit") return "walk-in";
  const eq = String(equipment || "").toLowerCase();
  if (eq === "mini-split") return "mini-split";
  if (["cooler", "freezer", "rack"].includes(eq)) return "walk-in";
  // A Fujitsu/Mitsubishi/Daikin indoor-or-outdoor pair from a plate with a matched unit is ductless.
  if ((ut === "indoor" || ut === "outdoor") && /fujitsu|mitsubishi|daikin|lg|samsung|gree|midea|mrcool|toshiba|panasonic/i.test(brand || "")) return "mini-split";
  if (eq === "rtu" || eq === "split" || ut === "indoor" || ut === "outdoor" || ut === "packaged") return "split-ac-hp";
  return null;
}

export const treeHref = (id) => "tree.html?type=" + encodeURIComponent(id);
export const toolHref = (id) => "tool.html?id=" + encodeURIComponent(id);

/** High-frequency steps get a named one-tap link into a tool (tree.html renders these above the tool chips). */
export const QUICK_LINKS = [
  { tool: "superheat-subcool", label: "Check superheat/subcool", carries: ["refrigerant"] },
  { tool: "electrical", label: "Check amps vs FLA", carries: ["nominalV", "rla"] },
  { tool: "vacuum-coach", label: "Vacuum / decay", carries: [] },
];

/** Quick links for a node; `known` = { refrigerant, nominalV, rla } from the last scanned plate (pre-fills the tool). */
export function quickLinks(node, known = {}) {
  return QUICK_LINKS.filter((q) => (node.tools || []).includes(q.tool)).map((q) => {
    const params = new URLSearchParams({ id: q.tool });
    q.carries.forEach((k) => { if (known[k]) params.set(k, known[k]); });
    return { tool: q.tool, label: q.label, href: "tool.html?" + params.toString() };
  });
}

/** "Log this in job notes": job-log tool with the equipment (last scanned plate) and the tree path pre-filled. */
export function jobLogHref(treeId, path, plate = {}) {
  const tree = TREES[treeId];
  if (!tree) return "tool.html?id=job-log";
  const p = plate || {};
  const steps = path.map((id, i) => {
    const n = tree.nodes[id];
    const chosen = (n.options || []).find((o) => o.next === path[i + 1]);
    return chosen ? chosen.label : null;
  }).filter(Boolean);
  const leaf = tree.nodes[path[path.length - 1]];
  const params = new URLSearchParams({ id: "job-log" });
  const equip = [p.brand, p.unitType].filter(Boolean).join(" ");
  params.set("equipment", (equip ? equip + " — " : "") + tree.title);
  [["model", "model"], ["serial", "serial"], ["refrigerant", "refrigerant"], ["charge", "systemCharge"]].forEach(([k, f]) => { if (p[k]) params.set(f, p[k]); });
  params.set("work", ("Troubleshooting (" + tree.title + "): " + steps.join(" → ") + (leaf ? "\nNext step: " + leaf.text : "")).slice(0, 500));
  return "tool.html?" + params.toString();
}
