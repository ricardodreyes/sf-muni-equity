"""
Script 08: Export data from DuckDB to frontend-ready JSON and GeoJSON files.
Generates routes.json, tracts.geojson, and route-shapes.geojson.
Also copies model results to site/public/data/models/.
"""

import os
import json
import ast
import shutil
import duckdb
import pandas as pd
import numpy as np

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')
PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(PIPELINE_DIR, '..', 'site')
RESULTS_DIR = os.path.join(PIPELINE_DIR, 'data', 'model_results')

# Output directories
SRC_DATA_DIR = os.path.join(SITE_DIR, 'src', 'data')
PUBLIC_DATA_DIR = os.path.join(SITE_DIR, 'public', 'data')
PUBLIC_MODELS_DIR = os.path.join(PUBLIC_DATA_DIR, 'models')


def safe_parse_list(val):
    """Parse a string representation of a list back to a Python list."""
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return ast.literal_eval(val)
        except (ValueError, SyntaxError):
            return []
    return []


def safe_parse_dict(val):
    """Parse a string representation of a dict back to a Python dict."""
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = ast.literal_eval(val)
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, SyntaxError):
            pass
    return {}


def build_routes_json(con):
    """Build routes.json from route_stats table."""
    print("  Building routes.json...")

    df = con.execute("SELECT * FROM route_stats").fetchdf()

    routes = []
    for _, row in df.iterrows():
        route = {
            "route_id": str(row.get('route_id', '')),
            "route_name": str(row.get('route_name', row.get('route_id', ''))),
            "route_type": str(row.get('route_type_str', 'bus')),
            "avg_delay_min": round(float(row.get('avg_delay_min', 0)), 1),
            "median_delay_min": round(float(row.get('median_delay_min', 0)), 1),
            "pct_on_time": round(float(row.get('pct_on_time', 0)), 1),
            "total_observations": int(row.get('total_observations', 0)),
            "weighted_median_income": round(float(row.get('weighted_median_income', 0)), 0),
            "income_quartile": int(row.get('income_quartile', 1)),
            "num_stops": int(row.get('num_stops', 0)),
            "equity_route": bool(row.get('equity_route', False)),
            "delay_by_hour": safe_parse_list(row.get('delay_by_hour', '[]')),
            "delay_by_day": safe_parse_dict(row.get('delay_by_day', '{}')),
            "rank": int(row.get('rank', 0)),
        }
        routes.append(route)

    # Sort by rank
    routes.sort(key=lambda r: r['rank'])

    return routes


def build_tracts_geojson(con):
    """Build tracts.geojson from stops_with_tracts, tract_income, and delay data."""
    print("  Building tracts.geojson...")

    # Get tract-level delay stats
    tract_delay_sql = """
        SELECT
            swt.GEOID AS geoid,
            AVG(d.delay_seconds) / 60.0 AS avg_delay_min,
            COUNT(DISTINCT d.route_id) AS num_routes
        FROM delays d
        JOIN stops_with_tracts swt ON d.stop_id = swt.stop_id
        GROUP BY swt.GEOID
    """

    try:
        tract_delays = con.execute(tract_delay_sql).fetchdf()
    except Exception as e:
        print(f"    Warning: Could not compute tract delays ({e}).")
        tract_delays = pd.DataFrame(columns=['geoid', 'avg_delay_min', 'num_routes'])

    # Get tract income
    tract_income = con.execute("""
        SELECT geoid, name, median_household_income
        FROM tract_income
    """).fetchdf()

    # Merge
    tracts = tract_income.merge(tract_delays, on='geoid', how='left')
    tracts['avg_delay_min'] = tracts['avg_delay_min'].fillna(0).round(1)
    tracts['num_routes'] = tracts['num_routes'].fillna(0).astype(int)

    # Try to load TIGER shapefile for tract geometries
    features = []
    tiger_loaded = False

    # Check for cached shapefile in pipeline/data
    shapefile_candidates = [
        os.path.join(PIPELINE_DIR, 'data', 'tl_2023_06_tract', 'tl_2023_06_tract.shp'),
        os.path.join(PIPELINE_DIR, 'data', 'tl_2022_06_tract', 'tl_2022_06_tract.shp'),
        os.path.join(PIPELINE_DIR, 'data', 'tiger', 'tl_2023_06_tract.shp'),
    ]

    for shp_path in shapefile_candidates:
        if os.path.exists(shp_path):
            try:
                import geopandas as gpd
                print(f"    Loading shapefile: {shp_path}")
                gdf = gpd.read_file(shp_path)
                # Filter to San Francisco County (FIPS 06075)
                sf_tracts = gdf[gdf['COUNTYFP'] == '075'].copy()
                sf_tracts = sf_tracts.to_crs(epsg=4326)

                # Merge with income and delay data
                sf_tracts = sf_tracts.merge(
                    tracts,
                    left_on='GEOID',
                    right_on='geoid',
                    how='left'
                )

                for _, row in sf_tracts.iterrows():
                    geom = row.geometry.__geo_interface__
                    feature = {
                        "type": "Feature",
                        "geometry": geom,
                        "properties": {
                            "name": str(row.get('name', row.get('NAMELSAD', ''))),
                            "median_income": (
                                round(float(row['median_household_income']), 0)
                                if pd.notna(row.get('median_household_income'))
                                else None
                            ),
                            "avg_delay_min": (
                                round(float(row['avg_delay_min']), 1)
                                if pd.notna(row.get('avg_delay_min'))
                                else 0
                            ),
                            "num_routes": (
                                int(row['num_routes'])
                                if pd.notna(row.get('num_routes'))
                                else 0
                            ),
                            "geoid": str(row.get('GEOID', '')),
                            "population": (
                                int(row.get('ALAND', 0))
                                if pd.notna(row.get('ALAND'))
                                else 0
                            ),
                        }
                    }
                    features.append(feature)

                tiger_loaded = True
                print(f"    Loaded {len(features)} SF tract geometries from shapefile.")
                break
            except ImportError:
                print("    geopandas not available. Falling back to point-based tracts.")
            except Exception as e:
                print(f"    Error loading shapefile: {e}")

    if not tiger_loaded:
        # Fallback: create point features from stops_with_tracts centroids
        print("    Creating point-based tract features from stop coordinates...")
        tract_centroids = con.execute("""
            SELECT
                GEOID AS geoid,
                AVG(stop_lat) AS lat,
                AVG(stop_lon) AS lon
            FROM stops_with_tracts
            GROUP BY GEOID
        """).fetchdf()

        merged = tract_centroids.merge(tracts, on='geoid', how='left')

        for _, row in merged.iterrows():
            if pd.notna(row.get('lat')) and pd.notna(row.get('lon')):
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [round(float(row['lon']), 6),
                                        round(float(row['lat']), 6)]
                    },
                    "properties": {
                        "name": str(row.get('name', '')),
                        "median_income": (
                            round(float(row['median_household_income']), 0)
                            if pd.notna(row.get('median_household_income'))
                            else None
                        ),
                        "avg_delay_min": round(float(row['avg_delay_min']), 1) if pd.notna(row.get('avg_delay_min')) else 0,
                        "num_routes": int(row['num_routes']) if pd.notna(row.get('num_routes')) else 0,
                        "geoid": str(row['geoid']),
                        "population": 0,
                    }
                }
                features.append(feature)

        print(f"    Created {len(features)} point-based tract features.")

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    return geojson


def build_route_shapes_geojson(con):
    """Build route-shapes.geojson from GTFS shapes table."""
    print("  Building route-shapes.geojson...")

    # Find the shape_id with the most trips for each route
    shape_sql = """
        SELECT
            t.route_id,
            t.shape_id,
            COUNT(*) AS trip_count
        FROM trips t
        WHERE t.shape_id IS NOT NULL
        GROUP BY t.route_id, t.shape_id
        ORDER BY t.route_id, trip_count DESC
    """
    shape_counts = con.execute(shape_sql).fetchdf()

    # Pick top shape per route
    best_shapes = shape_counts.groupby('route_id').first().reset_index()
    print(f"    Found {len(best_shapes)} routes with shape data.")

    # Get route stats for properties
    try:
        route_stats = con.execute("""
            SELECT route_id, route_name, avg_delay_min, pct_on_time
            FROM route_stats
        """).fetchdf()
    except Exception:
        route_stats = pd.DataFrame(columns=['route_id', 'route_name',
                                             'avg_delay_min', 'pct_on_time'])

    features = []

    for _, row in best_shapes.iterrows():
        route_id = row['route_id']
        shape_id = row['shape_id']

        # Get shape points ordered by sequence
        pts = con.execute("""
            SELECT shape_pt_lon, shape_pt_lat
            FROM shapes
            WHERE shape_id = ?
            ORDER BY shape_pt_sequence
        """, [shape_id]).fetchdf()

        if len(pts) < 2:
            continue

        # Build LineString coordinates [lon, lat]
        coordinates = [
            [round(float(r['shape_pt_lon']), 6), round(float(r['shape_pt_lat']), 6)]
            for _, r in pts.iterrows()
        ]

        # Get route properties
        rs = route_stats[route_stats['route_id'] == route_id]
        if len(rs) > 0:
            rs_row = rs.iloc[0]
            avg_delay = round(float(rs_row.get('avg_delay_min', 0)), 1)
            pct_on_time = round(float(rs_row.get('pct_on_time', 0)), 1)
            route_name = str(rs_row.get('route_name', route_id))
        else:
            avg_delay = 0.0
            pct_on_time = 0.0
            route_name = str(route_id)

        # Performance classification
        if pct_on_time >= 80:
            performance = "good"
        elif pct_on_time >= 60:
            performance = "fair"
        else:
            performance = "poor"

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates
            },
            "properties": {
                "route_id": str(route_id),
                "route_name": route_name,
                "avg_delay_min": avg_delay,
                "pct_on_time": pct_on_time,
                "performance": performance
            }
        }
        features.append(feature)

    print(f"    Built {len(features)} route shape features.")

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    return geojson


def write_json(data, filepath):
    """Write data to a JSON file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    size_kb = os.path.getsize(filepath) / 1024
    print(f"    Wrote {filepath} ({size_kb:.1f} KB)")


def main():
    print("Step 8: Exporting site data...")

    con = duckdb.connect(DB_PATH, read_only=True)

    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    print(f"  Available tables: {tables}")

    # Ensure output directories exist
    for d in [SRC_DATA_DIR, PUBLIC_DATA_DIR, PUBLIC_MODELS_DIR]:
        os.makedirs(d, exist_ok=True)

    # ----------------------------------------------------------------
    # 1. routes.json
    # ----------------------------------------------------------------
    if 'route_stats' in tables:
        routes = build_routes_json(con)
        routes_path = os.path.join(SRC_DATA_DIR, 'routes.json')
        write_json(routes, routes_path)
        print(f"    {len(routes)} routes exported.")
    else:
        print("  WARNING: route_stats table not found. Skipping routes.json.")

    # ----------------------------------------------------------------
    # 2. tracts.geojson
    # ----------------------------------------------------------------
    if 'tract_income' in tables and 'stops_with_tracts' in tables:
        tracts_geojson = build_tracts_geojson(con)
        # Write to both src/data and public/data
        for dest_dir in [SRC_DATA_DIR, PUBLIC_DATA_DIR]:
            tracts_path = os.path.join(dest_dir, 'tracts.geojson')
            write_json(tracts_geojson, tracts_path)
        print(f"    {len(tracts_geojson['features'])} tract features exported.")
    else:
        print("  WARNING: tract_income or stops_with_tracts not found. "
              "Skipping tracts.geojson.")

    # ----------------------------------------------------------------
    # 3. route-shapes.geojson
    # ----------------------------------------------------------------
    if 'shapes' in tables and 'trips' in tables:
        shapes_geojson = build_route_shapes_geojson(con)
        # Write to both src/data and public/data
        for dest_dir in [SRC_DATA_DIR, PUBLIC_DATA_DIR]:
            shapes_path = os.path.join(dest_dir, 'route-shapes.geojson')
            write_json(shapes_geojson, shapes_path)
        print(f"    {len(shapes_geojson['features'])} route shapes exported.")
    else:
        print("  WARNING: shapes or trips table not found. "
              "Skipping route-shapes.geojson.")

    con.close()

    # ----------------------------------------------------------------
    # 4. Copy model results to site/public/data/models/
    # ----------------------------------------------------------------
    print("  Copying model results to site...")

    if os.path.isdir(RESULTS_DIR):
        model_files = [f for f in os.listdir(RESULTS_DIR) if f.endswith('.json')]
        for fname in model_files:
            src = os.path.join(RESULTS_DIR, fname)
            dst = os.path.join(PUBLIC_MODELS_DIR, fname)
            shutil.copy2(src, dst)
            size_kb = os.path.getsize(dst) / 1024
            print(f"    Copied {fname} ({size_kb:.1f} KB)")
    else:
        print("  WARNING: No model results directory found. "
              "Run 07_ml_models.py first.")

    # ----------------------------------------------------------------
    # Summary
    # ----------------------------------------------------------------
    print("\n  Export Summary:")
    for label, path in [
        ("routes.json", os.path.join(SRC_DATA_DIR, 'routes.json')),
        ("tracts.geojson (src)", os.path.join(SRC_DATA_DIR, 'tracts.geojson')),
        ("tracts.geojson (public)", os.path.join(PUBLIC_DATA_DIR, 'tracts.geojson')),
        ("route-shapes.geojson (src)", os.path.join(SRC_DATA_DIR, 'route-shapes.geojson')),
        ("route-shapes.geojson (public)", os.path.join(PUBLIC_DATA_DIR, 'route-shapes.geojson')),
    ]:
        if os.path.exists(path):
            size_kb = os.path.getsize(path) / 1024
            print(f"    {label}: {size_kb:.1f} KB")
        else:
            print(f"    {label}: NOT FOUND")

    print("\nStep 8 complete.")


if __name__ == '__main__':
    main()
