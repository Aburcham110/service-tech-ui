"""SYNTHETIC gauge-report fixtures (made up for tests; NOT real vendor exports — no header/unit layout
here is claimed to match any brand). Run: python3 tests/fixtures/gauge/make_synthetic.py"""
import os, openpyxl
D = os.path.dirname(os.path.abspath(__file__))

def w(name, text):
    open(os.path.join(D, name), "w", newline="").write(text)

# CSV data log, psig / °F, with a preamble line.
w("synthetic-log-psig-F.csv",
  "SYNTHETIC test file - not a real export\r\n"
  "Time,Low Pressure (psig),High Pressure (psig),T1 (°F),T2 (°F),Refrigerant\r\n"
  "2026-10-26 14:00:00,118.0,330.5,52.1,95.0,R410A\r\n"
  "2026-10-26 14:00:01,118.4,331.0,52.3,94.8,R410A\r\n")
# CSV, semicolon + decimal comma, kPa / °C (European style), units in cells not headers.
w("synthetic-kPa-C.csv",
  "# SYNTHETIC test file - not a real export\n"
  "Date;P low;P high;T suction;T liquid;Gas\n"
  "26.10.2026 14:00;814 kPa;2280 kPa;11,3 °C;35,0 °C;R-410A\n")
# CSV where units are missing entirely (tech must pick).
w("synthetic-no-units.csv", "SYNTHETIC\nA,B,C,D\n1,118,330,52\n")
# XML records with unit attributes.
w("synthetic-session.xml",
  '<?xml version="1.0"?>\n<!-- SYNTHETIC test file - not a real export -->\n<session refrigerant="R-32">\n'
  '  <reading time="2026-10-26T14:00:00"><lp unit="bar">8.1</lp><hp unit="bar">23.0</hp><ts unit="°C">10.5</ts><tl unit="°C">34.2</tl></reading>\n'
  '  <reading time="2026-10-26T14:00:10"><lp unit="bar">8.2</lp><hp unit="bar">23.1</hp><ts unit="°C">10.6</ts><tl unit="°C">34.0</tl></reading>\n</session>\n')
# XLSX with shared strings.
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["SYNTHETIC test file - not a real export"])
ws.append(["Timestamp", "Suction (psig)", "Discharge (psig)", "Suction temp (°F)", "Liquid temp (°F)", "Refrigerant"])
ws.append(["2026-10-26 14:00", 120.2, 335.1, 55.0, 96.1, "R-410A"])
ws.append(["2026-10-26 14:05", 121.0, 336.0, 54.2, 96.0, "R-410A"])
wb.save(os.path.join(D, "synthetic-report.xlsx"))

# Minimal text PDF (Helvetica), label/value lines.
lines = ["SYNTHETIC test report - not a real export", "Date: 2026-10-26 14:00", "Refrigerant: R-410A",
         "Suction pressure 118.4 psig", "Discharge pressure 331.0 psig", "Suction line temperature 52.3 °F", "Liquid line temperature 94.8 °F"]
def esc(s): return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("°", "\\260")
stream = "BT /F1 12 Tf 50 780 Td 16 TL " + " ".join("(" + esc(l) + ") '" for l in lines) + " ET"
objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        "<< /Length %d >>\nstream\n%s\nendstream" % (len(stream.encode("latin-1")), stream),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
out = b"%PDF-1.4\n"; offs = []
for i, o in enumerate(objs, 1):
    offs.append(len(out)); out += ("%d 0 obj\n%s\nendobj\n" % (i, o)).encode("latin-1")
x = len(out)
out += ("xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)).encode() + b"".join(b"%010d 00000 n \n" % o for o in offs)
out += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)).encode()
open(os.path.join(D, "synthetic-report.pdf"), "wb").write(out)
print("ok")
