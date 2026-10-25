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
sys.exit(1 if fails else 0)
