// Ground truth for the real plate photos in tests/fixtures/plates/ (read by eye from the images).
export const TRUTH = {
  "fujitsu-asug15lzas": { brand: "Fujitsu", unitType: "indoor", model: "ASUG15LZAS", serial: "015057", voltage: "208/230", phase: 1, hz: 60, fanFla: 0.35, outdoorUnit: "AOUG15LZAS1 / AOUG15LZAH1", refrigerant: null, charge: null, rla: null, lra: null, mca: null, mop: null },
  // Second photo of the same plate (rotated 90°, wider frame), verified by eye against the photo.
  "fujitsu-asug15lzas-ocrtest": { brand: "Fujitsu", unitType: "indoor", model: "ASUG15LZAS", serial: "015057", voltage: "208/230", phase: 1, hz: 60, fanFla: 0.35, outdoorUnit: "AOUG15LZAS1 / AOUG15LZAH1", refrigerant: null, charge: null, rla: null, lra: null, compA: null, mca: null, mop: null },
  // Third photo of the same plate (v8 test shot), checked by eye against the photo. "WWB" is label text.
  "fujitsu-asug15lzas-v8test": { brand: "Fujitsu", unitType: "indoor", model: "ASUG15LZAS", serial: "015057", voltage: "208/230", phase: 1, hz: 60, fanFla: 0.35, outdoorUnit: "AOUG15LZAS1 / AOUG15LZAH1", refrigerant: null, charge: null, rla: null, lra: null, compA: null, mca: null, mop: null },
  "unitary-brcs0301bdg-r22": { brand: "Unitary Products Group (York/Coleman)", model: "BRCS0301BDG", serial: "W0A5383402", refrigerant: "R-22", charge: 3.88, designHigh: "350 psig", designLow: "300 psig", voltage: "208/230", phase: 1, hz: 60, rla: 13.6, lra: 73, fanFla: 0.5, mca: 17.5, mop: 30 },
  "copeland-rst64c1e-compressor": { brand: "Emerson / Copeland", unitType: "compressor", model: "RST64C1E-IAV-959", serial: "19F03763E", voltage: "208/230", phase: 1, hz: 60, lra: 43, oil: "15 POE", protection: "thermally protected", rla: null, refrigerant: null, charge: null },
  "fujitsu-aoug15lzah1-outdoor": { brand: "Fujitsu", unitType: "outdoor", model: "AOUG15LZAH1", serial: "002703", voltage: "208/230", phase: 1, hz: 60, capacity: "14500 / 18000", totalA: "9.9 / 14.4", compA: "9.2 / 12.7", fanFla: 0.3, mca: 17.5, mop: 20, refrigerant: "R-410A", charge: 2.98, designHigh: "4.15 MPa (≈602 psig)", designLow: "1.55 MPa (≈225 psig)", indoorUnit: "ASUG15LZAS", rla: null },
  // Heatcraft walk-in condensing unit, gallery screenshot (app UI around the plate), read by eye.
  // The defrost heater cell IS printed: "DEFROST HTR. MAX AMPS 30".
  "heatcraft-lch0055-upload": { brand: "Heatcraft", unitType: "condensing unit", partNo: "89074001", model: "LCH0055LBACZA0300", serial: "T21C05997", voltage: "208/230", phase: 1, hz: 60, mca: 44.3, mop: 60, rla: 24.7, lra: 169, fanQty: 1, fanHp: "1/3", fanFla: 3.5, crankcaseW: 80, designHigh: "450 psig", designLow: "178 psig", evapFanA: 10, defrostA: 30, refrigerant: "R-404A/R-507A, R-407A/R-407F, R-407C, R-448A/R-449A", tempRange: "-40 to 0 °F", awef: 3.15, application: "walk-in freezer, outdoor", charge: null },
  // York (Unitary Products Group) ZS gas/electric RTU, phone photo, read by eye. Charge "SYS #1 R-410A 4 LBS. 4 OZ.";
  // MCA printed "29.9/29.9", fuse and breaker "40/40"; test pressures 445 / 236 PSIG.
  "york-zs04-rtu": { brand: "Unitary Products Group (York/Coleman)", model: "ZS-04N13BTAZZ10001A", serial: "N1D1914801", voltage: "208/230", phase: 3, hz: 60, rla: 16, lra: 120, fanFla: 2.3, mca: 29.9, mop: 40, refrigerant: "R-410A", charge: 4.25, designHigh: "445 psig", designLow: "236 psig" },
  // Arthur's phone2 OCR dump of the same plate.
  "york-zs04-rtu-phone2": { brand: "Unitary Products Group (York/Coleman)", model: "ZS-04N13BTAZZ10001A", serial: "N1D1914801", voltage: "208/230", phase: 3, hz: 60, rla: 16, lra: 120, fanFla: 2.3, mca: 29.9, mop: 40, refrigerant: "R-410A", charge: 4.25, designHigh: "445 psig", designLow: "236 psig" },
  // Same photo, OCR from the live browser pipeline after the square-probe orientation fix.
  "york-zs04-rtu-live": { brand: "Unitary Products Group (York/Coleman)", model: "ZS-04N13BTAZZ10001A", serial: "N1D1914801", voltage: "208/230", phase: 3, hz: 60, rla: 16, lra: 120, fanFla: 2.3, mca: 29.9, mop: 40, refrigerant: "R-410A", charge: 4.25, designHigh: "445 psig", designLow: "236 psig" },
};
