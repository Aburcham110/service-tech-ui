"""Offline synthetic-image e2e: generates rotated/EXIF/glare/low-contrast plates, runs them through
plate_photos.py (offline, real pipeline) and checks key fields. Needs the http.server from plate_photos.py."""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); d = tempfile.mkdtemp()
subprocess.run([sys.executable, os.path.join(HERE, "make_synthetic.py"), d], check=True)
imgs = sorted(os.path.join(d, f) for f in os.listdir(d))
R = json.loads(subprocess.run([sys.executable, os.path.join(HERE, "plate_photos.py"), *imgs], check=True, capture_output=True, text=True).stdout)
WANT = {"model": "AC24B1XA", "voltage": "208/230", "rla": "10.9", "lra": "62.9", "mca": "15", "mop": "25", "refrigerant": "R-410A"}
fails = 0
assert not R["off_origin"], R["off_origin"]
for name, ph in R["photos"].items():
    f = {k: v.replace(" [LOW]", "") for k, v in ph["form"].items()}
    got = {k: (f.get(k, "").startswith(v) or f.get(k, "") == v.rstrip(".0")) for k, v in WANT.items()}
    ok = sum(got.values()); fails += ok < len(WANT) - 1
    print(f"{name:12s} angle={ph['angle']:>3} exif={ph['exif']} {ok}/{len(WANT)}", "" if ok == len(WANT) else [k for k, g in got.items() if not g])

# Manual 4-point crop: keystone the upright plate onto a busy background, then run with the
# corners set through the test hook (same code path as dragging the handles and tapping Use crop).
import numpy as np
from PIL import Image
src = Image.open(os.path.join(d, "upright.jpg")).convert("RGB"); w, h = src.size
W, H = int(w * 1.7), int(h * 1.7)
quad = [(0.22 * W, 0.12 * H), (0.86 * W, 0.22 * H), (0.80 * W, 0.90 * H), (0.12 * W, 0.80 * H)]
A, b = [], []
for (x, y), (u, v) in zip(quad, [(0, 0), (w, 0), (w, h), (0, h)]):
    A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; b += [u, v]
coef = np.linalg.solve(np.array(A, float), np.array(b, float))
warped = src.transform((W, H), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC, fillcolor=(90, 110, 80))
pdir = tempfile.mkdtemp(); pimg = os.path.join(pdir, "keystone.jpg"); warped.save(pimg, quality=90)
crop = ",".join(f"{c:.4f}" for x, y in quad for c in (x / W, y / H))
P = json.loads(subprocess.run([sys.executable, os.path.join(HERE, "plate_photos.py"), pimg, "--crop=" + crop], check=True, capture_output=True, text=True).stdout)
ph = P["photos"]["keystone"]; f = {k: v.replace(" [LOW]", "") for k, v in ph["form"].items()}
got = {k: (f.get(k, "").startswith(v) or f.get(k, "") == v.rstrip(".0")) for k, v in WANT.items()}
ok = sum(got.values()); fails += ok < len(WANT) - 1 or ph["exif"] != "manual-crop"
print(f"{'keystone+crop':12s} exif={ph['exif']} {ok}/{len(WANT)}", "" if ok == len(WANT) else [k for k, g in got.items() if not g])
sys.exit(1 if fails else 0)
