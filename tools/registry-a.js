/** registry part A */
export const PART = [
  {
    id: "superheat-subcool",
    title: "SH / Subcool",
    useWhen: "When charging or verifying capacity",
    repo: "hvac-superheat-subcool",
    group: "Diagnostics",
    kind: "compute",
    disclaimer: "Educational PT tables (approx). Real jobs need a manufacturer PT chart / rated manifold. Verify with OEM / AHJ.",
    fields: [
      { name: "mode", label: "Mode", type: "select", options: [["both","Both"],["superheat","Superheat"],["subcooling","Subcooling"]], value: "both" },
      { name: "refrigerant", label: "Refrigerant", type: "select", options: [["R-410A","R-410A"],["R-22","R-22"],["R-134a","R-134a"],["R-404A","R-404A"],["R-407C","R-407C"],["R-32","R-32"],["R-454B","R-454B"]], value: "R-410A" },
      { name: "suctionPsig", label: "Suction pressure (psig)", type: "number", step: "0.1" },
      { name: "suctionTemp", label: "Suction line temp (°F)", type: "number", step: "0.1" },
      { name: "liquidPsig", label: "Liquid pressure (psig)", type: "number", step: "0.1" },
      { name: "liquidTemp", label: "Liquid line temp (°F)", type: "number", step: "0.1" }
    ]
  },
  {
    id: "airflow-delta-t",
    title: "ΔT / Airflow",
    useWhen: "Supply/return split and rough CFM",
    repo: "hvac-airflow-delta-t",
    group: "Diagnostics",
    kind: "compute",
    disclaimer: "Educational only — NOT Manual D / NOT a substitute for anemometer or OEM CFM charts.",
    fields: [
      { name: "system", label: "System", type: "select", options: [["res-ac","Res AC"],["hp-cool","HP cool"],["hp-heat","HP heat"],["furnace","Furnace"],["commercial-rtu","Commercial RTU"]], value: "res-ac" },
      { name: "supply", label: "Supply air °F", type: "number", step: "0.1" },
      { name: "returnTemp", label: "Return air °F", type: "number", step: "0.1" },
      { name: "btuh", label: "Heat input BTU/h (optional)", type: "number", step: "1" },
      { name: "kw", label: "Heat input kW (optional)", type: "number", step: "0.1" }
    ]
  },
  {
    id: "psychrometrics",
    title: "Psychrometrics",
    useWhen: "DB + RH/WB dew point & enthalpy",
    repo: "hvac-psychrometrics",
    group: "Diagnostics",
    kind: "compute",
    disclaimer: "Educational I-P approximations. Not a substitute for a calibrated psychrometer or OEM psych apps.",
    fields: [
      { name: "db", label: "Dry-bulb °F", type: "number", step: "0.1" },
      { name: "inputMode", label: "Humidity input", type: "select", options: [["rh","RH %"],["wb","Wet-bulb °F"]], value: "rh" },
      { name: "rh", label: "RH %", type: "number", step: "0.1" },
      { name: "wb", label: "Wet-bulb °F", type: "number", step: "0.1" },
      { name: "psia", label: "Barometric psia", type: "number", step: "0.01", value: "14.696" }
    ]
  },
  {
    id: "compressor-diag",
    title: "Compressor diag",
    useWhen: "High DLT, floodback, LRA, high amps",
    repo: "hvac-compressor-diag-tree",
    group: "Diagnostics",
    kind: "checklist",
    disclaimer: "Educational incomplete stubs. Follow LOTO, PPE, and OEM procedures.",
    fields: [
      { name: "symptom", label: "Symptom", type: "select", options: [["high-discharge-temp","High discharge temp"],["floodback","Floodback"],["short-cycle","Short cycle"],["locked-rotor","Locked rotor"],["high-amps","High amps"]], value: "high-amps" },
      { name: "sh", label: "SH °F (optional)", type: "number", step: "0.1" },
      { name: "sc", label: "SC °F (optional)", type: "number", step: "0.1" }
    ]
  },
  {
    id: "txv-eev",
    title: "TXV / EEV path",
    useWhen: "Hunting, high/low SH metering issues",
    repo: "hvac-txv-eev-path",
    group: "Diagnostics",
    kind: "checklist",
    disclaimer: "Educational only — OEM SH targets and EEV logic vary. Verify with manuals.",
    fields: [
      { name: "valve", label: "Valve", type: "select", options: [["txv","TXV"],["eev","EEV"],["unknown","Unknown"]], value: "txv" },
      { name: "symptom", label: "Symptom", type: "select", options: [["hunting","Hunting"],["high-sh","High SH"],["low-sh","Low SH"],["general","General"]], value: "general" },
      { name: "sh", label: "SH °F (optional)", type: "number", step: "0.1" },
      { name: "sc", label: "SC °F (optional)", type: "number", step: "0.1" }
    ]
  },
  {
    id: "charge-recovery",
    title: "Charge / recover",
    useWhen: "Line-set add vs recover estimate",
    repo: "hvac-charge-recovery-estimator",
    group: "Charge & evacuate",
    kind: "compute",
    disclaimer: "Educational only — not an OEM charge procedure. Use manufacturer charts and weighed charge.",
    fields: [
      { name: "system", label: "System type", type: "select", options: [["split-ac","Split AC"],["package","Package"],["walk-in","Walk-in"],["custom","Custom"]], value: "split-ac" },
      { name: "refrigerant", label: "Refrigerant", type: "select", options: [["R-410A","R-410A"],["R-22","R-22"],["R-134a","R-134a"],["R-404A","R-404A"],["R-407C","R-407C"],["R-32","R-32"],["R-454B","R-454B"]], value: "R-410A" },
      { name: "factoryLbs", label: "Factory charge (lb)", type: "number", step: "0.01", value: "6" },
      { name: "liquidFt", label: "Liquid line (ft)", type: "number", step: "0.1", value: "50" },
      { name: "liquidOd", label: "Liquid OD", type: "select", options: [["1/4","1/4"],["3/8","3/8"],["1/2","1/2"],["5/8","5/8"]], value: "3/8" },
      { name: "suctionFt", label: "Suction line (ft)", type: "number", step: "0.1", value: "50" },
      { name: "suctionOd", label: "Suction OD", type: "select", options: [["1/4","1/4"],["3/8","3/8"],["1/2","1/2"],["5/8","5/8"]], value: "5/8" },
      { name: "includedFt", label: "Included factory ft (blank=preset)", type: "number", step: "0.1" },
      { name: "receiverLbs", label: "Receiver extra (lb)", type: "number", step: "0.01", value: "0" },
      { name: "extraLbs", label: "Other extra (lb)", type: "number", step: "0.01", value: "0" },
      { name: "currentLbs", label: "Current charge lb (optional)", type: "number", step: "0.01" }
    ]
  },
  {
    id: "vacuum-coach",
    title: "Vacuum coach",
    useWhen: "Microns, hold/decay, pre-charge",
    repo: "hvac-vacuum-evacuation-coach",
    group: "Charge & evacuate",
    kind: "checklist",
    disclaimer: "Educational only — not a substitute for a calibrated micron gauge or OEM evacuation procedures.",
    fields: [
      { name: "mode", label: "Mode", type: "select", options: [["coach","Coach"],["interpret-decay","Interpret decay"],["pre-charge","Pre-charge"]], value: "coach" },
      { name: "startMicron", label: "Start microns", type: "number", step: "1" },
      { name: "afterMicron", label: "After-hold microns", type: "number", step: "1" },
      { name: "minutes", label: "Hold minutes", type: "number", step: "0.1" }
    ]
  },
  {
    id: "leak-rate",
    title: "Leak rate practice",
    useWhen: "Practice annualized % (NOT compliance)",
    repo: "hvac-leak-rate-helper",
    group: "Charge & evacuate",
    kind: "compute",
    disclaimer: "!!! NOT A COMPLIANCE SYSTEM — NOT LEGAL ADVICE !!! Educational practice only. Real AIM Act / 608 audits need dedicated tools.",
    hardDisclaimer: true,
    fields: [
      { name: "fullCharge", label: "Full charge (lb)", type: "number", step: "0.01" },
      { name: "added", label: "Added over period (lb)", type: "number", step: "0.01" },
      { name: "days", label: "Period (days)", type: "number", step: "1", value: "365" },
      { name: "category", label: "Category", type: "select", options: [["comfort-cooling","Comfort cooling"],["commercial-refrigeration","Commercial refrigeration"],["industrial","Industrial"],["transport","Transport"]], value: "commercial-refrigeration" },
      { name: "chem", label: "Chem class", type: "select", options: [["hfc","HFC"],["hcfc","HCFC"],["other","Other"]], value: "hfc" }
    ]
  },
  {
    id: "a2l-checklist",
    title: "A2L checklist",
    useWhen: "R-454B / R-32 field service & install",
    repo: "hvac-a2l-field-checklist",
    group: "Charge & evacuate",
    kind: "checklist",
    disclaimer: "Educational only — NOT code or legal advice. Follow OEM literature and your AHJ for A2L work.",
    fields: [
      { name: "refrigerant", label: "Refrigerant", type: "select", options: [["R-454B","R-454B"],["R-32","R-32"],["A2L-other","A2L other"]], value: "R-454B" },
      { name: "job", label: "Job type", type: "select", options: [["service","Service"],["install","Install"],["both","Both"]], value: "both" }
    ]
  }
];
