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

  rtu: {
    title: "RTU / packaged rooftop unit",
    start: "start",
    nodes: {
      start: { text: "Packaged rooftop unit. Lock out and use the unit's wiring diagram and the plate for every value. What is the complaint?", options: [
        { label: "No cooling / compressor not running", next: "cool-call" },
        { label: "Poor cooling", next: "poor-airflow" },
        { label: "No heat — gas heat", next: "gas-call" },
        { label: "No heat — electric heat", next: "elec-call" },
        { label: "Indoor blower not running", next: "blower" },
        { label: "Economizer / outdoor air problem", next: "econ" },
        { label: "Short cycling", next: "short" },
        { label: "Frozen evaporator", next: "frozen" },
        { label: "Condensate / float switch trips", next: "condensate" },
        { label: "Safety lockout / flash code", next: "lockout" },
      ] },

      "cool-call": { text: "Is there a cooling call (Y, plus second-stage Y on two-stage units) at the unit's low-voltage terminal board or controller?", tools: ["electrical"], options: [
        { label: "Yes", next: "cool-safeties" }, { label: "No", next: "cool-nocall" },
      ] },
      "cool-nocall": { end: true, text: "No call reaching the unit: check the thermostat or BAS/controller output and schedule, the low-voltage wiring, transformer and fuse. If a unit controller or DDC board is fitted, read its status per the OEM manual.", tools: ["electrical"] },
      "cool-safeties": { text: "Call present. Are the safeties in the compressor circuit closed (high- and low-pressure switches, freeze stat, condensate float, any lockout on the unit control board)?", tools: ["electrical"], options: [
        { label: "Yes, all closed", next: "cool-contactor" }, { label: "One is open / locked out", next: "cool-safety-open" },
      ] },
      "cool-safety-open": { end: true, text: "Find why it opened before resetting: high pressure → condenser coil, condenser fans, overcharge; low pressure → low charge, low indoor airflow, frozen coil; float → condensate (see that branch). Record any flash code and look it up in the OEM manual.", tools: ["superheat-subcool", "airflow-delta-t", "nameplate-faults"] },
      "cool-contactor": { text: "Compressor contactor pulled in, with line voltage on the load side on all legs (check phase balance on 3-phase units)?", tools: ["electrical"], options: [
        { label: "Yes", next: "cool-comp" }, { label: "No", next: "cool-fix-contactor" },
      ] },
      "cool-fix-contactor": { end: true, text: "Check supply at the disconnect and line side, fuses/breaker against the plate MOP, the contactor coil voltage and contacts, and any compressor time-delay or lockout on the control board.", tools: ["electrical", "nameplate-faults"] },
      "cool-comp": { text: "Voltage reaches the compressor but it, or the condenser fans, won't run.", tools: ["electrical"], options: [
        { label: "Compressor: go to the compressor tree", tree: "compressor" },
        { label: "Condenser fan(s) not running", next: "cool-fan" },
      ] },
      "cool-fan": { end: true, text: "Check each condenser fan motor: supply, capacitor (if fitted) against its printed rating, windings, amps against the OD FAN FLA on the plate, and any fan-cycling or head-pressure control.", tools: ["electrical"] },

      "poor-airflow": { text: "Indoor airflow first: filters, belt and sheave, blower wheel, evaporator coil, return/outside air dampers. Measure ΔT and external static. Airflow OK?", tools: ["airflow-delta-t", "duct-static", "psychrometrics"], options: [
        { label: "Airflow problem found", next: "poor-fix-airflow" }, { label: "Airflow OK", next: "poor-charge" },
      ] },
      "poor-fix-airflow": { end: true, text: "Correct the airflow problem (filters, belt tension/alignment, blower speed setting, dirty coil, stuck damper), then re-measure after it stabilizes.", tools: ["airflow-delta-t", "duct-static"] },
      "poor-charge": { text: "Read each refrigerant circuit separately (multi-circuit units have one per compressor). Superheat and subcooling after 15+ minutes running?", tools: ["superheat-subcool", "txv-eev"], options: [
        { label: "High superheat, low subcool", next: "poor-leak" },
        { label: "High superheat, high subcool", next: "poor-restriction" },
        { label: "Low superheat, high subcool / high head", next: "poor-high" },
        { label: "Both normal", next: "poor-other" },
      ] },
      "poor-leak": { end: true, text: "Undercharge on that circuit: leak search and repair, evacuate, then weigh in the charge printed on the plate for that system.", tools: ["leak-rate", "vacuum-coach", "charge-recovery", "a2l-checklist"] },
      "poor-restriction": { end: true, text: "Restriction or metering fault: TXV bulb and equalizer, liquid-line drier pressure drop, kinked or crushed tubing.", tools: ["txv-eev"] },
      "poor-high": { end: true, text: "Check the condenser coil (clean it through), condenser fans, and hot-air recirculation on the roof; if still high, recover and weigh in the plate charge.", tools: ["superheat-subcool", "charge-recovery", "electrical"] },
      "poor-other": { end: true, text: "Charge and airflow OK: check that every compressor stage runs (second-stage Y call, second contactor), economizer not bringing in hot outside air while cooling, compressor efficiency, and the building load.", tools: ["compressor-diag", "electrical", "psychrometrics"] },

      "gas-call": { text: "Gas heat. Is there a heat call (W, plus second-stage W on two-stage units) at the unit, and does the inducer motor start?", tools: ["electrical"], options: [
        { label: "No heat call", next: "gas-nocall" },
        { label: "Call present, inducer doesn't start", next: "gas-inducer" },
        { label: "Inducer runs", next: "gas-ps" },
      ] },
      "gas-nocall": { end: true, text: "No heat call: thermostat/controller, low-voltage wiring, transformer and fuse. Check that a limit or rollout switch is not holding the control board out (see that step).", tools: ["electrical"] },
      "gas-inducer": { end: true, text: "Check the control board's inducer output and the inducer motor: supply, capacitor if fitted, windings, wheel free and not blocked. Follow the OEM ignition-control sequence of operation.", tools: ["electrical"] },
      "gas-ps": { text: "Inducer running: does the pressure switch close (check across it with the inducer running)?", tools: ["electrical"], options: [
        { label: "Yes, it closes", next: "gas-ign" }, { label: "No, stays open", next: "gas-ps-open" },
      ] },
      "gas-ps-open": { end: true, text: "Pressure switch not proving: check the tubing and port for water, cracks or blockage, flue/vent and combustion-air openings (birds, debris, ice), the inducer wheel and speed, and a blocked heat exchanger or condensate. Test the switch against the setpoint printed on it; never jumper it.", tools: ["electrical"] },
      "gas-ign": { text: "Pressure switch proved. Does the igniter glow / spark and the gas valve open (burners light)?", tools: ["electrical"], options: [
        { label: "No ignition", next: "gas-no-ign" },
        { label: "Lights, then drops out after a few seconds", next: "gas-flame" },
        { label: "Lights and stays lit, but trips off later", next: "gas-limit" },
        { label: "Lights and runs but heat is weak", next: "gas-pressure" },
      ] },
      "gas-no-ign": { end: true, text: "Check the igniter (resistance or spark gap per OEM), the board's igniter output, 24 V to the gas valve during the trial, gas supply on and the manual valve open. Record any flash code and use the OEM manual.", tools: ["electrical", "nameplate-faults"] },
      "gas-flame": { end: true, text: "Flame not proving: clean the flame sensor, check its lead and the burner ground, measure flame current against the OEM ignition-control spec, and confirm polarity and a solid ground on the unit supply.", tools: ["electrical"] },
      "gas-limit": { text: "Is the high limit or the rollout switch opening?", tools: ["electrical"], options: [
        { label: "High limit", next: "gas-highlimit" }, { label: "Rollout switch", next: "gas-rollout" },
      ] },
      "gas-highlimit": { end: true, text: "High limit trips are usually airflow: blower running at the heat speed, belt, filters, closed dampers or supply registers. Measure the temperature rise and compare to the rise range printed on the plate. Check gas input too (next step).", tools: ["airflow-delta-t", "duct-static", "electrical"] },
      "gas-rollout": { end: true, text: "Flame rollout is a safety event: inspect for a blocked flue/heat exchanger, cracked heat exchanger, wrong orifices or over-firing before any reset. Follow the OEM manual; do not bypass the switch.", tools: ["electrical"] },
      "gas-pressure": { end: true, text: "Measure inlet and manifold gas pressure with a manometer, on low and high fire, and compare to the gas type and the manifold/supply pressures printed on the plate (and the OEM manual). Then check the temperature rise against the plate's rise range.", tools: ["airflow-delta-t"] },

      "elec-call": { text: "Electric heat. Heat call present (W, and second-stage W if used) and the heater contactor(s) or sequencers pulled in?", tools: ["electrical"], options: [
        { label: "Yes", next: "elec-elements" }, { label: "No", next: "elec-nocall" },
      ] },
      "elec-nocall": { end: true, text: "Check the heat call from the thermostat/controller, heater contactor coil voltage and the heat kit's low-voltage wiring and any outdoor-air lockout setting.", tools: ["electrical"] },
      "elec-elements": { end: true, text: "With power locked out, check each element and its limits/fusible links for continuity; with power on, measure amps per element against the heater data on the plate or heater label. Confirm the blower runs during heat.", tools: ["electrical"] },

      blower: { text: "Is the indoor blower belt drive or direct drive (ECM / VFD)?", options: [
        { label: "Belt drive", next: "blower-belt" }, { label: "Direct drive ECM / VFD", next: "blower-ecm" },
      ] },
      "blower-belt": { end: true, text: "Check for a fan call (G) and the blower contactor, then the belt (broken, loose, glazed), sheave alignment and set screws, bearings, and motor amps against the plate indoor blower FLA. Overload tripped? Find the cause before resetting.", tools: ["electrical"] },
      "blower-ecm": { end: true, text: "ECM: check line voltage to the motor and the control signal from the board/thermostat. VFD: read the drive's display/fault history and look it up in the drive or OEM manual; check the drive's enable/run input and the motor. Compare amps to the plate indoor blower FLA.", tools: ["electrical", "nameplate-faults"] },

      econ: { text: "Economizer: what are you seeing?", options: [
        { label: "Damper stuck / not moving", next: "econ-actuator" },
        { label: "Bringing in outside air when it shouldn't (hot/humid air in cooling)", next: "econ-control" },
        { label: "Controller alarm / fault", next: "econ-alarm" },
      ] },
      "econ-actuator": { end: true, text: "Check the actuator supply and control signal, the linkage and blades for binding, and that minimum position is set as designed. Stroke it with the controller's test mode if the OEM manual has one.", tools: ["electrical"] },
      "econ-control": { end: true, text: "Check the outside-air/return-air sensors (location, wiring, reading against a reference thermometer), the changeover setpoint, and that free cooling is disabled when outdoor conditions are unsuitable. Settings come from the OEM economizer manual.", tools: ["psychrometrics", "electrical"] },
      "econ-alarm": { end: true, text: "Record the alarm exactly from the economizer controller display and look it up in that controller's manual (Manuals on the call card). This app doesn't carry codes.", tools: ["nameplate-faults", "job-log"] },

      short: { end: true, text: "Check thermostat/sensor location and the control's anti-short-cycle delay, pressure switches tripping (high: condenser/fan/overcharge; low: charge, airflow, frozen coil), the compressor overload, and an oversized unit or stage cycling on a light load.", tools: ["electrical", "superheat-subcool", "compressor-diag"] },

      frozen: { end: true, text: "Shut cooling off and thaw the coil (blower only). Then check airflow (filters, belt, blower, dampers), low charge on that circuit, a restriction, and running in cooling at low outdoor temperatures without low-ambient control. Re-check superheat after it runs.", tools: ["airflow-delta-t", "superheat-subcool", "txv-eev"] },

      condensate: { end: true, text: "Clear the drain pan, trap and drain line (RTU traps must be sized and primed for the negative pressure in the cabinet; check the OEM installation manual), check pan slope and the float switch wiring. A frozen or overflowing coil points back to airflow or charge.", tools: ["airflow-delta-t"] },

      lockout: { end: true, text: "Record the flash code or controller display exactly (count and colour of LED flashes), the unit model and serial. Look the code up only in the OEM manual or the code label inside the unit's control panel door; this app doesn't carry brand codes. Fix the cause before resetting the lockout.", tools: ["nameplate-faults", "job-log", "electrical"] },
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
  if (eq === "rtu" || ut === "packaged rooftop") return "rtu";
  if (eq === "split" || ut === "indoor" || ut === "outdoor" || ut === "packaged") return "split-ac-hp";
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
