# BUS 410 – Transit Equity Research

Two loosely coupled pieces: a Python data pipeline that produces static route/tract JSON, and a Vite/React site that renders the story plus a live Muni tracker. USF BUS 410 group project.

## Repo layout

- `pipeline/` – numbered ETL scripts (`01_download_data.py` → `08_export_site_data.py`). `run_pipeline.py` orchestrates them. Outputs land in `site/public/data/` and `site/src/data/`.
- `analysis/notebooks/` – exploratory notebooks.
- `data/` – raw + intermediate artifacts consumed by the pipeline.
- `site/` – Vite + React 19 + Tailwind 4 frontend, deployed to Vercel project **slpwlk/site**.
- `scripts/` – ad-hoc helpers (currently empty).

## Site (`site/`)

Pages: `Home` (investigation story), `Live` (real-time Muni tracker), `Explorer`, `Rankings`, `Methodology`. Routing via `react-router-dom`. Mapbox GL for maps.

### Live tracker
`src/pages/Live.jsx` polls `/api/vehicles` every 90 s and renders vehicles as colored dots on Mapbox. Clicking a vehicle calls `/api/predictions?stopId=…` for arrival estimates at its next stop. Auto-refresh cadence matches the serverless cache header (`s-maxage=90`).

### Backend (serverless)
- `site/api/vehicles.js` – proxies 511.org `VehicleMonitoring` SIRI feed, normalizes to flat JSON, splits in-service vs deadheading.
- `site/api/predictions.js` – proxies 511.org `StopMonitoring` for a given stop code, computes `minutesAway`.

Both need `API_KEY_511` in Vercel env (Production only). The browser-side Mapbox token is `VITE_MAPBOX_TOKEN` (public `pk.*`, baked into the Vite bundle at build time — also set in Vercel env).

### Running
```bash
cd site
npm install
npm run dev            # Vite only (no /api/* routes)
vercel dev             # full stack locally, including /api/*
npm run build          # production build
vercel --prod --yes    # deploy to prod (from site/ dir)
```

`/api/*` requires `vercel dev`; plain `npm run dev` will 404 those endpoints, so the Live tab won't fetch data in that mode.

### Deployment
Vercel project `slpwlk/site`. Production URL gated by Vercel SSO at `site-slpwlk.vercel.app`; public alias `site-gamma-olive.vercel.app` serves the same build. `vercel.json` rewrites SPA routes to `index.html` while preserving `/api/*` and `/data/*`.

## Branches

- `master` – current working branch, full version with Live tab.
- `full-version` – frozen snapshot of the complete build (commit `d032efe`). Kept as a reference; master was reset to this on 2026-04-22 after an earlier "simplification" commit removed the Live tab.

## Pipeline

```bash
cd pipeline
pip install -r requirements.txt
python run_pipeline.py
```

Sources: 511.org historic GTFS archives (Dec 2025 – Feb 2026), Census ACS 5-Year Estimates (2020–2024, variable B19013_001E), TIGER/Line 2024 tract shapes. Outputs: `routes.json` (per-route stats + delay histograms), `tracts.geojson` (with median income), model summaries under `site/public/data/models/`.

## Conventions

- Copy avoids em-dashes and double-dashes — the site uses plain words for ranges ("Dec 2025 through Feb 2026", "Q1 (Lowest)") instead. Compound adjectives with hyphens ("on-time", "5-year") are fine; em-dashes in running text are not.
- Scroll animations (`anim-ready` → `anim-in`) are gated by `IntersectionObserver`; the CSS respects `prefers-reduced-motion` so content is always rendered.
- When committing Claude-assisted work, append `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
