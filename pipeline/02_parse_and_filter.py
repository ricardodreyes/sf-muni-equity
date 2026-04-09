"""
02_parse_and_filter.py
Reads downloaded GTFS CSVs, filters to SFMTA/Muni routes only,
and loads everything into a DuckDB database.
"""

import os, sys, glob
import pandas as pd
import duckdb

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')
RAW_DIR = os.path.join(os.path.dirname(__file__), 'data', 'raw')
MONTHS = ['2025-12', '2026-01', '2026-02']

# GTFS route_type mapping for Muni modes
ROUTE_TYPE_MAP = {
    0: 'light_rail',
    3: 'bus',
    5: 'cable_car',
    7: 'streetcar',   # funicular mapped to streetcar
}


def read_gtfs_csv(directory, filename):
    """Read a GTFS CSV file from a directory, returning a DataFrame or None."""
    path = os.path.join(directory, filename)
    if not os.path.exists(path):
        return None
    try:
        return pd.read_csv(path, dtype=str, keep_default_na=False)
    except Exception as e:
        print(f"  Warning: could not read {path}: {e}")
        return None


def find_sfmta_agency_id(agency_df):
    """Find the SFMTA agency_id from an agency.txt DataFrame."""
    if agency_df is None or agency_df.empty:
        return None

    for _, row in agency_df.iterrows():
        name = row.get('agency_name', '')
        if 'SFMTA' in name.upper() or 'SAN FRANCISCO MUNICIPAL' in name.upper():
            return row.get('agency_id', None)
    return None


def classify_route(row):
    """Add mode and is_rapid columns to a route row."""
    rt = int(row.get('route_type', 3)) if row.get('route_type', '') != '' else 3
    mode = ROUTE_TYPE_MAP.get(rt, 'bus')

    short_name = str(row.get('route_short_name', ''))
    is_rapid = short_name.upper().endswith('R')

    return mode, is_rapid


def process_month(month, data_dir):
    """Process one month of GTFS data. Returns dict of DataFrames or None."""
    print(f"\n  Processing {month} from {data_dir}...")

    agency_df = read_gtfs_csv(data_dir, 'agency.txt')
    routes_df = read_gtfs_csv(data_dir, 'routes.txt')
    trips_df = read_gtfs_csv(data_dir, 'trips.txt')
    stops_df = read_gtfs_csv(data_dir, 'stops.txt')
    stop_times_df = read_gtfs_csv(data_dir, 'stop_times.txt')
    shapes_df = read_gtfs_csv(data_dir, 'shapes.txt')
    stop_obs_df = read_gtfs_csv(data_dir, 'stop_observations.txt')

    if routes_df is None or trips_df is None:
        print(f"  Warning: missing routes.txt or trips.txt in {data_dir}")
        return None

    # Find SFMTA agency_id
    sfmta_id = find_sfmta_agency_id(agency_df)

    if sfmta_id:
        print(f"  Found SFMTA agency_id: {sfmta_id}")
        if 'agency_id' in routes_df.columns:
            routes_df = routes_df[routes_df['agency_id'] == sfmta_id].copy()
        else:
            print("  Warning: routes.txt has no agency_id column, using all routes")
    else:
        # Fallback: if this is an SFMTA-only feed, use all routes
        print("  SFMTA agency_id not found - assuming single-agency feed, using all routes")

    if routes_df.empty:
        print(f"  No SFMTA routes found for {month}")
        return None

    # Classify routes
    modes = []
    rapids = []
    for _, row in routes_df.iterrows():
        mode, is_rapid = classify_route(row)
        modes.append(mode)
        rapids.append(is_rapid)
    routes_df['mode'] = modes
    routes_df['is_rapid'] = rapids

    route_ids = set(routes_df['route_id'].unique())
    print(f"  Found {len(route_ids)} SFMTA routes")

    # Filter trips to SFMTA routes
    if 'route_id' in trips_df.columns:
        trips_df = trips_df[trips_df['route_id'].isin(route_ids)].copy()
    trip_ids = set(trips_df['trip_id'].unique())
    print(f"  Found {len(trip_ids)} trips")

    # Filter stop_times
    if stop_times_df is not None and not stop_times_df.empty:
        if 'trip_id' in stop_times_df.columns:
            stop_times_df = stop_times_df[stop_times_df['trip_id'].isin(trip_ids)].copy()
        # Collect stop_ids referenced in stop_times
        stop_ids_used = set(stop_times_df['stop_id'].unique()) if 'stop_id' in stop_times_df.columns else set()
    else:
        stop_times_df = pd.DataFrame()
        stop_ids_used = set()

    # Filter stop_observations
    if stop_obs_df is not None and not stop_obs_df.empty:
        if 'trip_id' in stop_obs_df.columns:
            stop_obs_df = stop_obs_df[stop_obs_df['trip_id'].isin(trip_ids)].copy()
        if 'stop_id' in stop_obs_df.columns:
            stop_ids_used = stop_ids_used | set(stop_obs_df['stop_id'].unique())
        print(f"  Found {len(stop_obs_df)} stop observations")
    else:
        stop_obs_df = pd.DataFrame()
        print("  No stop_observations.txt found (fallback feed)")

    # Filter stops to those actually used
    if stops_df is not None and not stops_df.empty and stop_ids_used:
        if 'stop_id' in stops_df.columns:
            stops_df = stops_df[stops_df['stop_id'].isin(stop_ids_used)].copy()
    elif stops_df is None:
        stops_df = pd.DataFrame()

    # Filter shapes to those referenced by trips
    if shapes_df is not None and not shapes_df.empty:
        shape_ids = set(trips_df['shape_id'].unique()) if 'shape_id' in trips_df.columns else set()
        if shape_ids and 'shape_id' in shapes_df.columns:
            shapes_df = shapes_df[shapes_df['shape_id'].isin(shape_ids)].copy()
    else:
        shapes_df = pd.DataFrame()

    # Add month column
    for df in [routes_df, trips_df, stops_df, stop_times_df, stop_obs_df, shapes_df]:
        if not df.empty:
            df['month'] = month

    return {
        'routes': routes_df,
        'trips': trips_df,
        'stops': stops_df,
        'stop_times': stop_times_df,
        'shapes': shapes_df,
        'stop_observations': stop_obs_df,
    }


def load_to_duckdb(all_data):
    """Load all processed DataFrames into DuckDB."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = duckdb.connect(DB_PATH)

    tables = ['routes', 'trips', 'stops', 'stop_times', 'shapes', 'stop_observations']

    for table_name in tables:
        # Collect data from all months
        frames = []
        for month_data in all_data:
            if month_data and table_name in month_data:
                df = month_data[table_name]
                if not df.empty:
                    frames.append(df)

        if frames:
            combined = pd.concat(frames, ignore_index=True)
            # Drop duplicates on key columns if applicable
            if table_name == 'stops' and 'stop_id' in combined.columns:
                combined = combined.drop_duplicates(subset=['stop_id'], keep='first')

            con.execute(f"DROP TABLE IF EXISTS {table_name}")
            con.execute(f"CREATE TABLE {table_name} AS SELECT * FROM combined")
            print(f"  Loaded {table_name}: {len(combined)} rows")
        else:
            print(f"  Skipped {table_name}: no data")

    con.close()


def print_summary():
    """Print summary statistics from the database."""
    con = duckdb.connect(DB_PATH, read_only=True)

    print("\n--- Summary ---")

    try:
        count = con.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
        print(f"  Routes: {count}")
        modes = con.execute(
            "SELECT mode, COUNT(*) as cnt FROM routes GROUP BY mode ORDER BY cnt DESC"
        ).fetchall()
        for mode, cnt in modes:
            print(f"    {mode}: {cnt}")
        rapids = con.execute(
            "SELECT COUNT(*) FROM routes WHERE is_rapid = 'True'"
        ).fetchone()[0]
        print(f"    Rapid routes: {rapids}")
    except Exception:
        print("  Routes table not available")

    for table_name in ['trips', 'stops', 'stop_times', 'stop_observations', 'shapes']:
        try:
            count = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"  {table_name}: {count} rows")
        except Exception:
            print(f"  {table_name}: not available")

    con.close()


def main():
    print("=== Step 2: Parse and Filter GTFS to SFMTA/Muni ===")

    all_data = []

    # Try historic monthly feeds first
    for month in MONTHS:
        data_dir = os.path.join(RAW_DIR, month)
        if os.path.isdir(data_dir) and os.listdir(data_dir):
            result = process_month(month, data_dir)
            if result:
                all_data.append(result)

    # Fallback: SFMTA static feed
    if not all_data:
        static_dir = os.path.join(RAW_DIR, 'sfmta-static')
        if os.path.isdir(static_dir) and os.listdir(static_dir):
            print("\n  Using SFMTA static feed as fallback")
            result = process_month('static', static_dir)
            if result:
                all_data.append(result)

    if not all_data:
        print("\nERROR: No GTFS data found. Run 01_download_data.py first.")
        sys.exit(1)

    print("\n  Loading into DuckDB...")
    load_to_duckdb(all_data)

    print_summary()
    print("\nStep 2 complete.")


if __name__ == '__main__':
    main()
