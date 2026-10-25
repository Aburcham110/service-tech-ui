// Made-up nameplate texts in the GENERIC label styles of common brands.
// No real model/serial numbers; layouts and label wording are typical only.
// `expect`: field -> value (charge: lb). `blank`: fields that must NOT be filled.
export const FIXTURES = [
  { name: "carrier-style", text: `CARRIER
MODEL NO. 24XCA636A003   SERIAL NO. 2219E12345
VOLTS-PH-HZ 208/230-1-60
COMPRESSOR RLA 16.7 LRA 79.0
OUTDOOR FAN MOTOR FLA 1.2 HP 1/4
MIN CIRCUIT AMPS 22.0
MAX FUSE/BKR 35
REFRIGERANT R-410A  FACTORY CHARGE 9 LBS 2 OZ
DESIGN PRESSURE HIGH 650 PSIG  LOW 250 PSIG`,
    expect: { brand: "Carrier", model: "24XCA636A003", serial: "2219E12345", voltage: "208/230", phase: 1, hz: 60, rla: 16.7, lra: 79, fanFla: 1.2, mca: 22, mop: 35, refrigerant: "R-410A", charge: 9.13, designHigh: "650 psig", designLow: "250 psig" } },
  { name: "carrier-style messy", text: `CARRlER
MODEL N0. 24XCA636A003
SERIAL NO.
2219E12345
VOLTS-PH-HZ 2O8/23O-1-6O
COMPRESSOR RLA l6.7 LRA 79.O
MIN CIRCUIT AMPS 22.O
MAX FUSE/BKR 3S`,
    expect: { model: "24XCA636A003", serial: "2219E12345", voltage: "208/230", phase: 1, hz: 60, rla: 16.7, lra: 79, mca: 22 }, blank: ["mop", "refrigerant", "charge", "fanFla"] },
  { name: "trane-style", text: `TRANE
MODEL NO: 4TTR4036L1000A
SERIAL NO: 21345ABC1F
ELECTRICAL RATING 208/230 V 1 PH 60 HZ
COMPRESSOR: RLA 14.1 LRA 77.0
OUTDOOR FAN: FLA 1.0
MINIMUM CIRCUIT AMPACITY 19
MAXIMUM OVERCURRENT PROTECTION 30
REFRIGERANT: R-410A 7 LB 6 OZ`,
    expect: { brand: "Trane", model: "4TTR4036L1000A", serial: "21345ABC1F", voltage: "208/230", phase: 1, hz: 60, rla: 14.1, lra: 77, fanFla: 1, mca: 19, mop: 30, refrigerant: "R-410A", charge: 7.38 } },
  { name: "trane-style label-next-line", text: `TRANE
MODEL NO.
4TTR4036L1000A
COMPRESSOR RLA
14.1
LRA
77.0
MIN CIRCUIT AMPACITY
19
MAX OVERCURRENT
30`,
    expect: { model: "4TTR4036L1000A", rla: 14.1, lra: 77, mca: 19, mop: 30 }, blank: ["serial", "charge"] },
  { name: "goodman-style", text: `GOODMAN MANUFACTURING
M/N GSX140361KD   S/N 1906123456
VOLTS 208-230V 1PH 60HZ
COMP RLA 15.4  LRA 83
FAN MOTOR FLA 1.2
MIN CIRCUIT AMPACITY 20.5
MAX FUSE OR HACR TYPE CKT BKR 35
REFRIG R410A  FACTORY CHG 104 OZ`,
    expect: { brand: "Goodman", model: "GSX140361KD", serial: "1906123456", voltage: "208/230", phase: 1, hz: 60, rla: 15.4, lra: 83, fanFla: 1.2, mca: 20.5, mop: 35, refrigerant: "R-410A", charge: 6.5 } },
  { name: "goodman-style messy", text: `G00DMAN
M/N GSX14O361KD
S/N
VOLTS 208-230V 1PH 60HZ
COMP RLA 1S.4 LRA
REFRIG R 410A`,
    expect: { model: "GSX14O361KD", voltage: "208/230", refrigerant: "R-410A" }, blank: ["serial", "lra", "charge", "mca", "mop"], low: ["model"] },
  { name: "lennox-style", text: `LENNOX INDUSTRIES
MODEL ML14XC1-036-230A01
SERIAL 5819A12345
UNIT SUPPLY VOLTAGE 208/230 V 60 HZ 1 PH
COMPRESSOR RLA-C 14.1 LRA 73
OD FAN 0.7
MIN. CIRCUIT AMPACITY 18.4
MAX. FUSE 30
REFRIGERANT HFC-410A  CHARGE 6 LBS 9 OZ`,
    expect: { brand: "Lennox", model: "ML14XC1-036-230A01", serial: "5819A12345", voltage: "208/230", phase: 1, hz: 60, rla: 14.1, lra: 73, mca: 18.4, mop: 30, refrigerant: "R-410A", charge: 6.56 } },
  { name: "rheem-style", text: `RHEEM
MOD. RA1436AJ1NA  SER. W181912345
208/230 VOLTS 1 PH 60 HZ
COMPRESSOR R.L.A. 16.0 L.R.A. 82.0
FAN MOTOR F.L.A. 0.8
M.C.A. 21  M.O.C.P. 35
REFRIGERANT R-410A 8.5 LBS`,
    expect: { brand: "Rheem", model: "RA1436AJ1NA", serial: "W181912345", voltage: "208/230", phase: 1, hz: 60, rla: 16, lra: 82, fanFla: 0.8, mca: 21, mop: 35, refrigerant: "R-410A", charge: 8.5 } },
  { name: "copeland-style compressor table", text: `EMERSON CLIMATE TECHNOLOGIES  COPELAND
MODEL ZP31K5E-PFV-830
SERIAL 21A12345L
VOLTS PH HZ LRA
208-230 1 60 82.0
THERMALLY PROTECTED
OIL 25 POE`,
    expect: { brand: "Emerson / Copeland", unitType: "compressor", model: "ZP31K5E-PFV-830", serial: "21A12345L", voltage: "208/230", phase: 1, hz: 60, lra: 82, oil: "25 POE", protection: "thermally protected" }, blank: ["rla", "refrigerant", "charge", "mca", "mop"] },
  { name: "heatcraft-style 2-compressor", text: `HEATCRAFT REFRIGERATION
MODEL NO. PTN030H2B   SERIAL NO. T19C01234
460/3/60
COMP 1 RLA 7.1 LRA 45
COMP 2 RLA 6.4 LRA 40
FAN MOTOR FLA 0.9
MCA 18  MOP 25
REFRIGERANT R-404A`,
    expect: { brand: "Heatcraft", model: "PTN030H2B", serial: "T19C01234", voltage: "460", phase: 3, hz: 60, rla: 7.1, lra: 45, fanFla: 0.9, mca: 18, mop: 25, refrigerant: "R-404A" }, blank: ["charge"] },
  { name: "daikin-style", text: `DAIKIN
MODEL DX16SA0361AA
SERIAL 1903123456
POWER SUPPLY 208-230V 1PH 60HZ
COMPRESSOR RLA 14.8 LRA 78
FAN MOTOR FLA 1.1
MIN CIRCUIT AMP 20.0
MAX OVERCURRENT 30
REFRIGERANT R-32 CHARGE 2.95 KG`,
    expect: { brand: "Daikin", model: "DX16SA0361AA", serial: "1903123456", voltage: "208/230", phase: 1, hz: 60, rla: 14.8, lra: 78, fanFla: 1.1, mca: 20, mop: 30, refrigerant: "R-32", charge: 6.5 } },
  { name: "mitsubishi-style outdoor (cool/heat, MPa)", text: `MITSUBISHI ELECTRIC
OUTDOOR UNIT
MODEL MUZ-XX12NA
SERIAL No. 1234567
POWER SUPPLY 208/230V 1PH 60HZ
COMPRESSOR A 6.0 7.5
FAN MOTOR 0.4 A
MCA 12 A
MAX. FUSE 15 A
REFRIGERANT R410A 1.10 kg
DESIGN PRESSURE HIGH 4.15 MPa LOW 1.64 MPa
APPLICABLE INDOOR UNIT MSZ-XX12NA`,
    expect: { brand: "Mitsubishi Electric", unitType: "outdoor", model: "MUZ-XX12NA", serial: "1234567", voltage: "208/230", phase: 1, hz: 60, compA: "6 / 7.5", fanFla: 0.4, mca: 12, mop: 15, refrigerant: "R-410A", charge: 2.43, designHigh: "4.15 MPa (≈602 psig)", designLow: "1.64 MPa (≈238 psig)", indoorUnit: "MSZ-XX12NA" }, blank: ["rla", "lra"] },
  { name: "fujitsu-style indoor", text: `FUJITSU
SPLIT TYPE AIR CONDITIONER
MODEL No. ASXX12ABCD
SERIAL No. ABC 012345
ETL LISTED CONFORMS TO UL STD 60335-2-40
Intertek 4000000
SOURCE 208/230 V
60Hz 1-PH
INDOOR FAN MOTOR LOAD 0.25 A
APPLICABLE OUTDOOR UNIT
AOXX12ABCD
Contains FCC ID: XYZ-12345`,
    expect: { brand: "Fujitsu", unitType: "indoor", model: "ASXX12ABCD", serial: "ABC012345", voltage: "208/230", phase: 1, hz: 60, fanFla: 0.25, outdoorUnit: "AOXX12ABCD" }, blank: ["refrigerant", "charge", "rla", "lra", "mca", "mop"] },
  { name: "unitary-style value-first amps", text: `Model No. ABCD0301XYZ    Serial No. W1A2345678
Factory Charge: 4 lbs 2 oz R22
*TOTAL CHARGE ___ lbs ___ oz
Design Press. High Side - 350 PSIG
Low Side - 300 PSIG
Unit Supply 208-230V 1PH 60HZ
Compressor 208-230V 1PH 60HZ 12.8 RLA 64 LRA
Fan Motor 208-230V 1PH 60HZ 0.6 FLA 1/10 HP
Minimum Circuit Ampacity - 16.6
MAX FUSE OR MAX CKT. BKR. (HACR TYPE per NEC) - 25`,
    expect: { model: "ABCD0301XYZ", serial: "W1A2345678", refrigerant: "R-22", charge: 4.13, designHigh: "350 psig", designLow: "300 psig", voltage: "208/230", phase: 1, hz: 60, rla: 12.8, lra: 64, fanFla: 0.6, mca: 16.6, mop: 25 } },
  { name: "rtu 3ph space-separated", text: `PACKAGED UNIT  MOD: XYZ120-3  SER: AB12345
460V 3PH 60HZ
COMP1 RLA 9.6 LRA 70
MCA 22 MOCP 30`,
    expect: { voltage: "460", phase: 3, hz: 60, rla: 9.6, lra: 70, mca: 22, mop: 30 } },
  { name: "lb+oz with g", text: `MODEL X1-2345
REFRIGERANT R-454B
CHARGE 1500 G`,
    expect: { refrigerant: "R-454B", charge: 3.31 } },
  { name: "garbage stays blank", text: `| ¢ ® ~~ 7 i
TATA iw SE ——
EE EE ae 3 1 4`,
    expect: {}, blank: ["model", "serial", "voltage", "rla", "lra", "mca", "mop", "charge", "refrigerant"] },
];
