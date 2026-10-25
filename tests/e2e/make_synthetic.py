"""Generate synthetic nameplate photos (rotated, EXIF-rotated, glare, low-contrast) into a temp dir.
Usage: python tests/e2e/make_synthetic.py OUTDIR"""
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
LINES = ["ACME HVAC COMPANY", "MODEL NO. AC24B1XA", "SERIAL NO. 4519X62817",
         "208/230 V  1 PH  60 HZ", "REFRIGERANT R-410A  5 LB 4 OZ", "COMPRESSOR RLA 10.9  LRA 62.9",
         "FAN MOTOR FLA 1.2", "MIN CIRCUIT AMPS 15.0", "MAX FUSE/BREAKER 25"]
try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
except OSError: font = ImageFont.load_default()
def plate():
    im = Image.new("L", (1400, 760), 235); d = ImageDraw.Draw(im)
    for i, t in enumerate(LINES): d.text((60, 40 + i * 76), t, fill=25, font=font)
    return im
base = plate()
def save(im, name, exif=None):
    im = im.convert("RGB")
    if exif: e = Image.Exif(); e[0x0112] = exif; im.save(os.path.join(out, name), quality=90, exif=e.tobytes())
    else: im.save(os.path.join(out, name), quality=90)
save(base, "upright.jpg")
for a in (90, 180, 270): save(base.rotate(a, expand=True, fillcolor=235), f"rot{a}.jpg")
# Pixels stored rotated; EXIF says how to show them upright (6 = rotate 90 CW to view).
save(base.rotate(90, expand=True, fillcolor=235), "exif6.jpg", exif=6)
save(base.rotate(180, expand=True), "exif3.jpg", exif=3)
g = base.copy(); gl = Image.new("L", g.size, 0); ImageDraw.Draw(gl).ellipse((500, 150, 1000, 600), fill=200)
g = Image.composite(Image.new("L", g.size, 255), g, gl.filter(ImageFilter.GaussianBlur(80)).point(lambda v: int(v * 0.85)))
save(g, "glare.jpg")
save(base.point(lambda v: 120 + v * 0.25), "lowcontrast.jpg")
