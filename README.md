# Service Tech UI (field MVP)

Phone-first static site for HVAC/R field calls: **New call** wizard with clipboard call-card, **interactive Toolkit** (17 in-app educational tools), and **Docs** / OEM map Notion links.

> Educational helper only — verify with OEM literature and your AHJ. No login in v1.

## Screens

| Page | Purpose |
|------|---------|
| `index.html` | Home — New call CTA, Toolkit, Docs, OEM map |
| `call.html` | Wizard: Open → Readings → Mid → Close + **Copy for Service Tech** |
| `toolkit.html` | Searchable grouped tiles → in-app `tool.html?id=…` |
| `tool.html` | Generic interactive tool shell (`?id=` mounts fields + logic) |
| `docs.html` | Field Docs, Call card, Manuals, OEM map |

Draft call data is saved in `localStorage` on the device.

## Interactive tools (`tool.html?id=`)

Architecture:

- `tools/registry.js` — tool metadata, fields, disclaimer, `kind` (`compute` \| `checklist`)
- `tools/logic.js` — dispatcher; pure functions return `{ lines }`
- `tools/tool-app.js` — reads `?id=`, renders form, Calculate / Generate, Copy result
- Each tool page also links to the educational **CLI on GitHub**

| id | CLI repo |
|----|----------|
| `superheat-subcool` | hvac-superheat-subcool |
| `airflow-delta-t` | hvac-airflow-delta-t |
| `psychrometrics` | hvac-psychrometrics |
| `compressor-diag` | hvac-compressor-diag-tree |
| `txv-eev` | hvac-txv-eev-path |
| `charge-recovery` | hvac-charge-recovery-estimator |
| `vacuum-coach` | hvac-vacuum-evacuation-coach |
| `leak-rate` | hvac-leak-rate-helper |
| `a2l-checklist` | hvac-a2l-field-checklist |
| `box-load` | commercial-box-load-sizer |
| `defrost-checklist` | hvac-defrost-controls-checklist |
| `oil-rack` | hvac-oil-rack-checklist |
| `case-controller` | hvac-case-controller-playbook |
| `electrical` | hvac-electrical-helper |
| `nameplate-faults` | hvac-nameplate-fault-codes |
| `job-log` | hvac-job-log-notes |
| `duct-static` | hvac-duct-static-helper |

## Open locally

No build step:

```bash
cd service-tech-ui
python3 -m http.server 8080
```

Then open `http://localhost:8080` (ES modules need a local server — do not rely on `file://`).

## GitHub Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder `/ (root)`
4. Site: `https://aburcham110.github.io/service-tech-ui/`

## Out of scope (v1)

Login, Bluetooth, embedded PDFs, Linear API, service worker / full PWA.
