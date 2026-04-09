"""
03_spatial_join.py
Maps each Muni stop to its census tract using point-in-polygon spatial join
with the TIGER/Line shapefile.
"""

import os, sys
import duckdb
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')
RAW_DIR = os.path.join(os.path.dirname(__file__), 'data', 'raw')
TIGER_DIR = os.path.join(RAW_DIR, 'tiger')


def load_sf_tracts():
    """Load TIGER shapefile and filter to San Francisco County (FIPS 075)."""
    # Find the .shp file in the tiger directory
    shp_files = [f for f in os.listdir(TIGER_DIR) if f.endswith('.shp')]
    if not shp_files:
        print("ERROR: No .shp file found in tiger directory.")
        sys.exit(1)

    shp_path = os.path.join(TIGER_DIR, shp_files[0])
    print(f"  Loading shapefile: {shp_path}")

    tracts = gpd.read_file(shp_path)
    print(f"  Total California tracts: {len(tracts)}")

    # Filter to San Francisco (county FIPS = 075)
    sf_tracts = tracts[tracts['COUNTYFP'] == '075'].copy()
    print(f"  San Francisco tracts: {len(sf_tracts)}")

    # Ensure CRS is EPSG:4326 (geographic coordinates)
    if sf_tracts.crs is None:
        sf_tracts = sf_tracts.set_crs('EPSG:4326')
    elif sf_tracts.crs.to_epsg() != 4326:
        sf_tracts = sf_tracts.to_crs('EPSG:4326')

    return sf_tracts


def load_stops():
    """Load stop locations from DuckDB."""
    con = duckdb.connect(DB_PATH, read_only=True)

    try:
        stops_df = con.execute(
            "SELECT stop_id, stop_lat, stop_lon FROM stops"
        ).fetchdf()
    except Exception as e:
        print(f"ERROR: Could not read stops table: {e}")
        print("Make sure 02_parse_and_filter.py has been run first.")
        sys.exit(1)
    finally:
        con.close()

    # Convert lat/lon to numeric
    stops_df['stop_lat'] = pd.to_numeric(stops_df['stop_lat'], errors='coerce')
    stops_df['stop_lon'] = pd.to_numeric(stops_df['stop_lon'], errors='coerce')

    # Drop rows with missing coordinates
    before = len(stops_df)
    stops_df = stops_df.dropna(subset=['stop_lat', 'stop_lon'])
    after = len(stops_df)
    if before != after:
        print(f"  Dropped {before - after} stops with missing coordinates")

    print(f"  Loaded {len(stops_df)} stops from DuckDB")
    return stops_df


def spatial_join_stops(stops_df, sf_tracts):
    """Join stops to census tracts using point-in-polygon, with nearest fallback."""
    # Create GeoDataFrame from stops
    geometry = [Point(lon, lat) for lon, lat in zip(stops_df['stop_lon'], stops_df['stop_lat'])]
    stops_gdf = gpd.GeoDataFrame(
        stops_df,
        geometry=geometry,
        crs='EPSG:4326'
    )

    # Primary join: point-in-polygon (within)
    print("  Running spatial join (within)...")
    joined = gpd.sjoin(
        stops_gdf,
        sf_tracts[['GEOID', 'geometry']],
        how='left',
        predicate='within'
    )

    # Count matches vs. misses
    matched_mask = joined['GEOID'].notna()
    n_matched = matched_mask.sum()
    n_missing = (~matched_mask).sum()
    print(f"  Matched within tract: {n_matched}")
    print(f"  No direct match: {n_missing}")

    if n_missing > 0:
        # Fallback: nearest join for unmatched stops
        print("  Running nearest-join fallback for unmatched stops...")
        unmatched_gdf = stops_gdf[
            stops_gdf['stop_id'].isin(joined.loc[~matched_mask, 'stop_id'])
        ].copy()

        # Project to a metric CRS for accurate nearest distance
        unmatched_proj = unmatched_gdf.to_crs('EPSG:3857')
        tracts_proj = sf_tracts[['GEOID', 'geometry']].to_crs('EPSG:3857')

        nearest = gpd.sjoin_nearest(
            unmatched_proj,
            tracts_proj,
            how='left',
            distance_col='_dist'
        )

        # Drop duplicate joins (keep closest)
        nearest = nearest.sort_values('_dist').drop_duplicates(subset=['stop_id'], keep='first')

        # Merge nearest results into the main joined DataFrame
        # First, keep only matched rows from the original join
        result_matched = joined.loc[matched_mask, ['stop_id', 'stop_lat', 'stop_lon', 'GEOID']].copy()

        # Then add nearest-matched rows
        result_nearest = nearest[['stop_id', 'stop_lat', 'stop_lon', 'GEOID']].copy()

        result = pd.concat([result_matched, result_nearest], ignore_index=True)
        print(f"  After nearest fallback: {len(result_nearest)} stops assigned by proximity")
    else:
        result = joined[['stop_id', 'stop_lat', 'stop_lon', 'GEOID']].copy()

    # Drop any duplicate stop_ids (from overlapping polygons, etc.)
    result = result.drop_duplicates(subset=['stop_id'], keep='first')

    # Final check for any remaining nulls
    still_null = result['GEOID'].isna().sum()
    if still_null > 0:
        print(f"  Warning: {still_null} stops still have no tract assignment (likely outside SF)")

    return result


def save_to_duckdb(result_df):
    """Save the stops-with-tracts table to DuckDB."""
    con = duckdb.connect(DB_PATH)

    # Ensure columns are the right types
    result_df = result_df[['stop_id', 'stop_lat', 'stop_lon', 'GEOID']].copy()
    result_df['stop_lat'] = result_df['stop_lat'].astype(float)
    result_df['stop_lon'] = result_df['stop_lon'].astype(float)
    result_df['GEOID'] = result_df['GEOID'].astype(str)

    con.execute("DROP TABLE IF EXISTS stops_with_tracts")
    con.execute("CREATE TABLE stops_with_tracts AS SELECT * FROM result_df")

    count = con.execute("SELECT COUNT(*) FROM stops_with_tracts").fetchone()[0]
    print(f"\n  Saved stops_with_tracts: {count} rows")

    # Show sample
    sample = con.execute(
        "SELECT stop_id, stop_lat, stop_lon, GEOID FROM stops_with_tracts LIMIT 5"
    ).fetchdf()
    print("\n  Sample rows:")
    print(sample.to_string(index=False))

    con.close()


def main():
    print("=== Step 3: Spatial Join - Stops to Census Tracts ===\n")

    sf_tracts = load_sf_tracts()
    stops_df = load_stops()
    result = spatial_join_stops(stops_df, sf_tracts)
    save_to_duckdb(result)

    print("\nStep 3 complete.")


if __name__ == '__main__':
    main()
