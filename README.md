# SF Muni Equity Tracker

Does Muni run late more often in San Francisco's poorer neighborhoods? This joins 3 months of observed arrival times for every Muni route to the median household income of the census tracts each route serves, then puts the answer on a map. There's also a live tracker that shows where every bus is right now.

Live at https://sf-muni-equity.vercel.app.

## The numbers

68 routes, 28.7 million stop observations, December 2025 through February 2026. Each route gets a weighted median income from the tracts its stops fall in, then the routes are split into income quartiles of 17.

- Lowest-income quartile: 3.8 min average delay, 47.8% on time
- Highest-income quartile: 1.5 min average delay, 56.2% on time
- All 68 routes: 54.3% on time
- The 16 SFMTA-designated equity routes: 1.5 min average delay, 53.7% on time

On time means between 1 minute early and 5 minutes late, which is the SFMTA standard.

## What holds up and what doesn't

The headline gap is real on the means. The lowest quartile runs about 2.6 times the delay of the highest, and Pearson correlation between income and delay is negative and significant (r = -0.26, p = 0.03). An OLS model with stop count and rapid-route flag as controls keeps income significant (p = 0.04): every $10,000 less in neighborhood income adds about 16 seconds of average delay per route.

It gets weaker once you look past the means though. Spearman rank correlation isn't significant (p = 0.59), and neither Mann-Whitney between the top and bottom quartile (p = 0.13) nor Kruskal-Wallis across all 4 (p = 0.34) reaches significance. The random forest doesn't generalize at all under cross-validation, so its feature importances (income at 74%) shouldn't be read as more than a hint.

The biggest reason is the cable cars. Powell-Hyde, Powell-Mason and California are the 3 most delayed routes in the data at 17, 13 and 12 minutes, and all 3 land in the lowest-income quartile because their tracts are downtown and Chinatown. Drop them and the lowest quartile averages 1.7 minutes against 1.5 for the highest. Still a gap, but a small one. The site's home page table already excludes cable cars for this reason; the quartile stats at the top of it don't, and that's the honest number to argue about.

The other limits are the ones you'd expect: 3 months can't show seasonality, a 5-year ACS estimate blurs neighborhoods that changed, and one route can run through both the richest and poorest tracts in the city, so a route-level income is a blunt instrument. Income also travels with traffic density and ridership, which this doesn't control for.

## How it's built

`pipeline/` is 8 numbered Python scripts run in order by `run_pipeline.py`:

1. Download the 511.org historic GTFS archives for each month (needs `API_KEY_511`).
2. Parse `stop_observations.txt` and keep Muni.
3. Point-in-polygon join of every stop to its TIGER/Line 2024 tract, in DuckDB.
4. Fetch ACS 5-year median household income (B19013_001E) per tract.
5. Compute delay per observation (observed minus scheduled arrival) and the on-time flag.
6. Per-route stats: mean and median delay, percent on time, delay by hour and by weekday, weighted income, quartile, rank.
7. Models: Pearson/Spearman, Mann-Whitney and Kruskal-Wallis, OLS, random forest, and a 4-quadrant classification of routes by income and delay.
8. Export `routes.json`, `tracts.geojson`, the route and stop GeoJSON, and the model summaries into `site/`.

`site/` is Vite, React 19, Tailwind 4 and Mapbox GL. Pages: Home (the story, choropleth, scatter and top delays), Live, Rankings, Methodology. Two Vercel serverless functions in `site/api/` proxy 511.org so the key never reaches the browser: `vehicles.js` wraps the SIRI VehicleMonitoring feed and `predictions.js` wraps StopMonitoring for one stop. The Live page polls `/api/vehicles` every 90 seconds, which matches the `s-maxage=90` cache header on the function.

## Running it

Pipeline:

```
cd pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
API_KEY_511=... python run_pipeline.py
```

Raw downloads land in `pipeline/data/`, which is gitignored. The exported outputs are committed under `site/public/data/` and `site/src/data/`, so the site runs without the pipeline.

Site:

```
cd site
cp .env.example .env    # fill in VITE_MAPBOX_TOKEN
npm ci
npm run dev             # pages only, /api/* 404s
vercel dev              # full stack with the live tracker
```

Deploys are `vercel deploy --prod --yes` from `site/`. `API_KEY_511` and `VITE_MAPBOX_TOKEN` are set in the Vercel project env; nothing is wired to git.

## Data sources

- 511.org Historic Regional GTFS archives with `stop_observations.txt`, December 2025 through February 2026. https://511.org/open-data/transit
- U.S. Census Bureau ACS 5-Year Estimates 2020 through 2024, table B19013 (median household income), tract level, San Francisco County (FIPS 06075).
- Census TIGER/Line 2024 tract shapefiles, California, filtered to COUNTYFP 075.
- SFMTA equity route list and the on-time standard.
- 511.org SIRI VehicleMonitoring and StopMonitoring for the live tracker.

## Affiliation

A BUS 410 (Business Analytics) group project at the University of San Francisco, Spring 2026, by Harrison Ma, Brayden Awaya, Ricardo Reyes and Takehiro Ishiguro. Not an SFMTA or 511.org site.

Pipeline, site and deploy by Ricardo Reyes.

## License

Code is MIT (see LICENSE). The derived data in `site/public/data` and `site/src/data` is CC BY 4.0. The raw 511.org and Census sources keep their own terms.
