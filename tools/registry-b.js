/** registry part B */
export const PART = [
  {
    id: "box-load",
    title: "Box load sizer",
    useWhen: "Rough walk-in cooler/freezer load",
    repo: "commercial-box-load-sizer",
    group: "Commercial / rack",
    kind: "compute",
    disclaimer: "Educational only — not for stamped bids. Use manufacturer software and ASHRAE for real design.",
    fields: [
      { name: "L", label: "Length (ft)", type: "number", step: "0.1", value: "10" },
      { name: "W", label: "Width (ft)", type: "number", step: "0.1", value: "8" },
      { name: "H", label: "Height (ft)", type: "number", step: "0.1", value: "8" },
      { name: "box", label: "Box type", type: "select", options: [["cooler","Cooler (~35°F)"],["freezer","Freezer (~-10°F)"],["custom","Custom"]], value: "cooler" },
      { name: "target", label: "Target °F (custom)", type: "number", step: "0.1", value: "35" },
      { name: "ambient", label: "Ambient °F", type: "number", step: "0.1", value: "95" },
      { name: "wallR", label: "Wall/ceiling R", type: "number", step: "0.1", value: "28" },
      { name: "floorR", label: "Floor R", type: "number", step: "0.1", value: "28" },
      { name: "doorA", label: "Door area (ft²)", type: "number", step: "0.1", value: "21" },
      { name: "opens", label: "Openings/day", type: "number", step: "1", value: "50" },
      { name: "acpd", label: "ACPD", type: "number", step: "0.1", value: "8" },
      { name: "lbs", label: "Product lb/day", type: "number", step: "1", value: "200" },
      { name: "enter", label: "Entering product °F", type: "number", step: "0.1", value: "50" },
      { name: "cp", label: "Product cp", type: "number", step: "0.01", value: "0.75" },
      { name: "lightsW", label: "Lights (W)", type: "number", step: "1", value: "100" },
      { name: "fansW", label: "Evap fans (W)", type: "number", step: "1", value: "200" },
      { name: "safety", label: "Safety factor %", type: "number", step: "1", value: "15" }
    ]
  },
  {
    id: "defrost-checklist",
    title: "Defrost checklist",
    useWhen: "Time clock vs demand defrost path",
    repo: "hvac-defrost-controls-checklist",
    group: "Commercial / rack",
    kind: "checklist",
    disclaimer: "Educational only — OEM defrost controls vary. Verify against the equipment manual.",
    fields: [
      { name: "box", label: "Box type", type: "select", options: [["cooler","Cooler"],["freezer","Freezer"]], value: "freezer" },
      { name: "mode", label: "Defrost mode", type: "select", options: [["time-clock","Time clock"],["demand","Demand"],["unknown","Unknown"]], value: "time-clock" }
    ]
  },
  {
    id: "oil-rack",
    title: "Oil / rack",
    useWhen: "Separator, filters, oil logging",
    repo: "hvac-oil-rack-checklist",
    group: "Commercial / rack",
    kind: "checklist",
    disclaimer: "Educational only — OEM rack oil controls vary. Verify against rack drawings.",
    fields: [
      { name: "symptom", label: "Symptom", type: "select", options: [["low-oil-alarm","Low oil alarm"],["high-separator-dp","High separator DP"],["oil-logging","Oil logging"],["unstable-epr","Unstable EPR"],["general","General"]], value: "general" }
    ]
  },
  {
    id: "case-controller",
    title: "Case controller",
    useWhen: "Probes first, defrost history, EEV hunt",
    repo: "hvac-case-controller-playbook",
    group: "Commercial / rack",
    kind: "checklist",
    disclaimer: "Educational high-level playbook — not OEM manuals. Verify with manufacturer docs/apps.",
    fields: [
      { name: "focus", label: "Focus", type: "select", options: [["full","Full"],["order-of-ops","Order of ops"],["probes","Probes"],["defrost-history","Defrost history"],["eev-hunting","EEV hunting"]], value: "full" }
    ]
  },
  {
    id: "electrical",
    title: "Electrical helper",
    useWhen: "Voltage, amps, FLA / MCA checks",
    repo: "hvac-electrical-helper",
    group: "Electrical & notes",
    kind: "compute",
    disclaimer: "Educational only — not a substitute for OEM data, a calibrated meter, or LOTO. Live electrical work kills.",
    fields: [
      { name: "tool", label: "Tool", type: "select", options: [["amps","Amps vs FLA/RLA"],["capacitor","Capacitor µF"],["imbalance","Voltage imbalance"],["lra-notes","LRA / running notes"]], value: "amps" },
      { name: "measured", label: "Measured amps", type: "number", step: "0.01" },
      { name: "fla", label: "FLA", type: "number", step: "0.01" },
      { name: "rla", label: "RLA", type: "number", step: "0.01" },
      { name: "ratedMfd", label: "Rated µF", type: "number", step: "0.1" },
      { name: "measuredMfd", label: "Measured µF", type: "number", step: "0.1" },
      { name: "phases", label: "Phases", type: "select", options: [["1","1φ"],["3","3φ"]], value: "3" },
      { name: "v1", label: "Voltage 1 / Vab", type: "number", step: "0.1" },
      { name: "v2", label: "Voltage 2 / Vbc", type: "number", step: "0.1" },
      { name: "v3", label: "Voltage 3 / Vca", type: "number", step: "0.1" },
      { name: "lraMode", label: "Notes mode", type: "select", options: [["locked-rotor","Locked-rotor"],["running","Running"]], value: "locked-rotor" }
    ]
  },
  {
    id: "nameplate-faults",
    title: "Nameplate / codes",
    useWhen: "Capture plate + stub fault codes",
    repo: "hvac-nameplate-fault-codes",
    group: "Electrical & notes",
    kind: "checklist",
    disclaimer: "Educational only — fault stubs are incomplete. Verify every code with the OEM manual.",
    fields: [
      { name: "brand", label: "Brand", type: "text", value: "" },
      { name: "model", label: "Model", type: "text" },
      { name: "serial", label: "Serial", type: "text" },
      { name: "voltage", label: "Voltage", type: "text" },
      { name: "refrigerant", label: "Refrigerant", type: "text" },
      { name: "chargeLbs", label: "Charge (lb)", type: "text" },
      { name: "faultCode", label: "Fault / blink code", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" }
    ]
  },
  {
    id: "job-log",
    title: "Job log notes",
    useWhen: "Structured field job notes",
    repo: "hvac-job-log-notes",
    group: "Electrical & notes",
    kind: "checklist",
    disclaimer: "Educational record-keeping aid only — NOT legal advice or an EPA compliance system.",
    fields: [
      { name: "date", label: "Date", type: "text" },
      { name: "technician", label: "Technician", type: "text" },
      { name: "customer", label: "Customer", type: "text" },
      { name: "site", label: "Site address", type: "text" },
      { name: "equipment", label: "Equipment", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "serial", label: "Serial", type: "text" },
      { name: "refrigerant", label: "Refrigerant", type: "text", value: "R-410A" },
      { name: "systemCharge", label: "System charge (lb)", type: "text" },
      { name: "lbsAdded", label: "Lbs added", type: "text", value: "0" },
      { name: "lbsRecovered", label: "Lbs recovered", type: "text", value: "0" },
      { name: "leakFound", label: "Leak found", type: "select", options: [["N","N"],["Y","Y"]], value: "N" },
      { name: "leakRepaired", label: "Leak repaired", type: "select", options: [["N","N"],["Y","Y"]], value: "N" },
      { name: "work", label: "Work performed", type: "textarea" },
      { name: "parts", label: "Parts used", type: "textarea" },
      { name: "followUps", label: "Follow-ups", type: "textarea" }
    ]
  },
  {
    id: "duct-static",
    title: "Duct / static",
    useWhen: "Velocity and ESP reminders",
    repo: "hvac-duct-static-helper",
    group: "Electrical & notes",
    kind: "compute",
    disclaimer: "Educational only — NOT Manual D / NOT a ductulator. Use ACCA Manual D and OEM blower tables.",
    fields: [
      { name: "shape", label: "Shape", type: "select", options: [["rect","Rect"],["round","Round"]], value: "rect" },
      { name: "width", label: "Width (in) / diameter", type: "number", step: "0.1", value: "12" },
      { name: "height", label: "Height (in)", type: "number", step: "0.1", value: "8" },
      { name: "cfm", label: "CFM", type: "number", step: "1", value: "800" },
      { name: "ductType", label: "Duct type", type: "select", options: [["supply-main","Supply main"],["supply-branch","Supply branch"],["return-main","Return main"],["return-branch","Return branch"],["flex","Flex"]], value: "supply-main" },
      { name: "filterDp", label: "Filter ΔP (in.wc)", type: "number", step: "0.01" },
      { name: "coilDp", label: "Coil ΔP (in.wc)", type: "number", step: "0.01" },
      { name: "otherDp", label: "Other ΔP (in.wc)", type: "number", step: "0.01", value: "0" }
    ]
  }
];
