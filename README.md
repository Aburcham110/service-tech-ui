# Service Tech UI (field MVP)

Phone-first static site for HVAC/R field calls: **New call** wizard with clipboard call-card, **Toolkit** links to educational GitHub CLIs, and **Docs** / OEM map Notion links.

> Educational helper only — verify with OEM literature and your AHJ. No login in v1.

## Screens

| Page | Purpose |
|------|---------|
| `index.html` | Home — New call CTA, Toolkit, Docs, OEM map |
| `call.html` | Wizard: Open → Readings → Mid → Close + **Copy for Service Tech** |
| `toolkit.html` | Searchable grouped tool tiles → GitHub repos |
| `docs.html` | Field Docs, Call card, Manuals, OEM map |

Draft call data is saved in `localStorage` on the device.

## Open locally

No build step:

```bash
cd service-tech-ui
python3 -m http.server 8080
```

Then open `http://localhost:8080` on your phone (same Wi‑Fi) or desktop.

Or open `index.html` directly in a browser (clipboard may need a local server in some browsers).

## GitHub Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` (or this PR branch), folder `/ (root)`
4. Save — site URL will be `https://<user>.github.io/service-tech-ui/`

## Out of scope (v1)

Login, Bluetooth, embedded PDFs, Linear API, service worker / full PWA.
