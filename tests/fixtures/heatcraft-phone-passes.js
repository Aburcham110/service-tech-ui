// Replay of Arthur's phone OCR (Brave/Android, v25, 2026-10-26 8:58 PM ET): the key lines of each
// pass as reported (electrical lines from the v25 electrical screenshot: LRA 169 / 189 split, fan '1/3 3.5', 'VR 85')
// pass as reported in heatcraft-lch0055-raw-ocr-phone2.txt. PSM 11 scrambles the header labels.
export const HEATCRAFT_PHONE_PASSES = [
  { name: "gray psm11", confidence: 80, psm: 11, text: `HEATCRAFT
SERIAL NO
PART NO.
MODEL NO.
89074001
LCHO055LBACZA0300 T21C05997
VOLTS
RA04AIRS07A
RA07A/RAOTF
R407C
RA48AIRA49A
LRA
169
RLA
24.7
COND FAN
1 1/3 3.5
DEFROST HEATER MAX AMPS
30` },
  { name: "sauvola psm11", confidence: 74, psm: 11, text: `HEATCRAFT
MODEL NO.
SERIAL NO
3
PART NO
89074001
LCHO0055LBACZA0300 T21C05997
VOLTS
RADAA/RS07A
RAO7AIRAOTE
R4D7C
RAABATRA40A/
LRA
189
RLA
24.7
1 1/3..3.5
DEFROST HEATER MAX AMPS 30` },
  { name: "glare psm11", confidence: 70, psm: 11, text: `HEATCRAFT
PART NO
MODEL NO.
SERIAL NO
89074001
fe
LCHOOSSLEACZA1300 or 121005997
VOLTS
LRA 189
VR 85
DEFROST HEATER MAX AMPS
30` },
  { name: "gray psm6", confidence: 61, psm: 6, text: `HEATCRAFT
PART NO.   MODEL NO.   SERIAL NO.
89074001   LCHO055LBACZA0300 T21C05997   lc
VOLTS PHASE HERTZ
COMPRESSOR   RLA 24.7   LRA 169
COND FAN   1   1/3 3.5
DEFROST HEATER MAX AMPS 30` },
];
