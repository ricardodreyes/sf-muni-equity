"""
Script 06: Build route-level statistics by aggregating delay data
and merging with income/equity information.
"""

import os
import duckdb
import pandas as pd
import numpy as np

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')

# SF Muni Equity Strategy routes
EQUITY_ROUTES = [
    '8', '9', '9R', '14', '14R', '15', '22', '23', '24', '27', '29',
    '44', '48', '54', '56', 'T'
]

# GTFS route_type mapping
ROUTE_TYPE_MAP = {
    0: 'light_rail',
    3: 'bus',
    5: 'cable_car',
}


def main():
    print("Step 6: Building route-level statistics...")

    con = duckdb.connect(DB_PATH)

    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    print(f"  Available tables: {tables}")

    if 'delays' not in tables:
        print("  WARNING: delays table not found. Cannot build route stats.")
        con.close()
        return

    # ----------------------------------------------------------------
    # 1. Aggregate delay stats per route
    # ----------------------------------------------------------------
    print("  Aggregating delay statistics per route...")

    route_agg_sql = """
        SELECT
            route_id,
            ROUND(AVG(delay_seconds) / 60.0, 1) AS avg_delay_min,
            ROUND(MEDIAN(delay_seconds) / 60.0, 1) AS median_delay_min,
            ROUND(100.0 * SUM(CASE WHEN on_time THEN 1 ELSE 0 END)
                  / COUNT(*), 1) AS pct_on_time,
            COUNT(*) AS total_observations,
            COUNT(DISTINCT stop_id) AS num_stops
        FROM delays
        GROUP BY route_id
        ORDER BY avg_delay_min DESC
    """
    route_stats = con.execute(route_agg_sql).fetchdf()
    print(f"  Found {len(route_stats)} routes with delay data.")

    if len(route_stats) == 0:
        print("  No route stats to build. Exiting.")
        con.close()
        return

    # ----------------------------------------------------------------
    # 2. Delay by hour (hours 5-23)
    # ----------------------------------------------------------------
    print("  Computing delay by hour of day...")

    hour_sql = """
        SELECT
            route_id,
            hour_of_day,
            ROUND(AVG(delay_seconds) / 60.0, 2) AS avg_delay
        FROM delays
        WHERE hour_of_day BETWEEN 5 AND 23
        GROUP BY route_id, hour_of_day
        ORDER BY route_id, hour_of_day
    """
    hour_df = con.execute(hour_sql).fetchdf()

    # Build dict: route_id -> list of 19 values (hours 5-23)
    delay_by_hour_map = {}
    for rid in route_stats['route_id']:
        route_hours = hour_df[hour_df['route_id'] == rid]
        hour_vals = []
        for h in range(5, 24):
            match = route_hours[route_hours['hour_of_day'] == h]
            if len(match) > 0:
                hour_vals.append(round(float(match['avg_delay'].iloc[0]), 2))
            else:
                hour_vals.append(0.0)
        delay_by_hour_map[rid] = hour_vals

    route_stats['delay_by_hour'] = route_stats['route_id'].map(delay_by_hour_map)

    # ----------------------------------------------------------------
    # 3. Delay by day of week
    # ----------------------------------------------------------------
    print("  Computing delay by day of week...")

    day_sql = """
        SELECT
            route_id,
            day_of_week,
            ROUND(AVG(delay_seconds) / 60.0, 2) AS avg_delay
        FROM delays
        GROUP BY route_id, day_of_week
        ORDER BY route_id, day_of_week
    """
    day_df = con.execute(day_sql).fetchdf()

    day_names = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun'}
    delay_by_day_map = {}
    for rid in route_stats['route_id']:
        route_days = day_df[day_df['route_id'] == rid]
        day_vals = {}
        for dow in range(7):
            match = route_days[route_days['day_of_week'] == dow]
            if len(match) > 0:
                day_vals[day_names[dow]] = round(float(match['avg_delay'].iloc[0]), 2)
            else:
                day_vals[day_names[dow]] = 0.0
        delay_by_day_map[rid] = day_vals

    route_stats['delay_by_day'] = route_stats['route_id'].map(delay_by_day_map)

    # ----------------------------------------------------------------
    # 4. Weighted median income per route
    # ----------------------------------------------------------------
    print("  Computing weighted median income per route...")

    # Join routes -> trips -> stop_times -> stops_with_tracts -> tract_income
    income_sql = """
        SELECT
            r.route_id,
            swt.GEOID AS geoid,
            ti.median_household_income,
            COUNT(*) AS stop_count
        FROM routes r
        JOIN trips t ON r.route_id = t.route_id
        JOIN stop_times st ON t.trip_id = st.trip_id
        JOIN stops_with_tracts swt ON st.stop_id = swt.stop_id
        JOIN tract_income ti ON swt.GEOID = ti.geoid
        WHERE ti.median_household_income IS NOT NULL
            AND ti.median_household_income > 0
        GROUP BY r.route_id, swt.GEOID, ti.median_household_income
    """

    try:
        income_df = con.execute(income_sql).fetchdf()
    except Exception as e:
        print(f"  Warning: Income join failed ({e}). Trying simplified join...")
        # Simplified: go through delays table stops directly
        income_sql_alt = """
            SELECT
                d.route_id,
                swt.GEOID AS geoid,
                ti.median_household_income,
                COUNT(*) AS stop_count
            FROM delays d
            JOIN stops_with_tracts swt ON d.stop_id = swt.stop_id
            JOIN tract_income ti ON swt.GEOID = ti.geoid
            WHERE ti.median_household_income IS NOT NULL
                AND ti.median_household_income > 0
            GROUP BY d.route_id, swt.GEOID, ti.median_household_income
        """
        income_df = con.execute(income_sql_alt).fetchdf()

    # Weighted income: sum(income * count) / sum(count) per route
    if len(income_df) > 0:
        income_df['weighted'] = (income_df['median_household_income']
                                  * income_df['stop_count'])
        weighted_income = (income_df.groupby('route_id')
                           .apply(lambda g: g['weighted'].sum() / g['stop_count'].sum(),
                                  include_groups=False)
                           .reset_index()
                           .rename(columns={0: 'weighted_median_income'}))
        route_stats = route_stats.merge(weighted_income, on='route_id', how='left')
    else:
        print("  Warning: No income data matched. Setting weighted_median_income to NaN.")
        route_stats['weighted_median_income'] = np.nan

    # Fill missing income with median
    median_income = route_stats['weighted_median_income'].median()
    route_stats['weighted_median_income'] = (
        route_stats['weighted_median_income'].fillna(median_income)
    )

    # ----------------------------------------------------------------
    # 5. Income quartile
    # ----------------------------------------------------------------
    print("  Assigning income quartiles...")

    try:
        route_stats['income_quartile'] = pd.qcut(
            route_stats['weighted_median_income'],
            4,
            labels=[1, 2, 3, 4],
            duplicates='drop'
        ).astype(int)
    except ValueError:
        # If not enough unique values for 4 bins
        route_stats['income_quartile'] = pd.qcut(
            route_stats['weighted_median_income'].rank(method='first'),
            4,
            labels=[1, 2, 3, 4],
            duplicates='drop'
        ).astype(int)

    # ----------------------------------------------------------------
    # 6. Route metadata from routes table
    # ----------------------------------------------------------------
    print("  Merging route metadata...")

    route_meta = con.execute("""
        SELECT DISTINCT
            route_id,
            route_short_name,
            route_long_name,
            route_type,
            is_rapid
        FROM routes
    """).fetchdf()

    route_stats = route_stats.merge(route_meta, on='route_id', how='left')

    # route_type string
    route_stats['route_type_str'] = (
        route_stats['route_type']
        .map(ROUTE_TYPE_MAP)
        .fillna('bus')
    )

    # is_rapid flag
    route_stats['is_rapid'] = route_stats['is_rapid'].fillna(False).astype(bool)

    # route_name
    route_stats['route_name'] = route_stats.apply(
        lambda r: (
            f"{r['route_short_name']} {r['route_long_name']}"
            if pd.notna(r['route_short_name']) and pd.notna(r['route_long_name'])
            else str(r.get('route_short_name', r['route_id']))
        ),
        axis=1
    )

    # ----------------------------------------------------------------
    # 7. Equity route flag
    # ----------------------------------------------------------------
    print("  Flagging equity routes...")

    route_stats['equity_route'] = route_stats.apply(
        lambda r: (
            str(r.get('route_short_name', '')).strip() in EQUITY_ROUTES
            or str(r['route_id']).strip() in EQUITY_ROUTES
        ),
        axis=1
    )

    # ----------------------------------------------------------------
    # 8. Rank by avg_delay_min descending (1 = most delayed)
    # ----------------------------------------------------------------
    route_stats['rank'] = (
        route_stats['avg_delay_min']
        .rank(ascending=False, method='min')
        .astype(int)
    )

    # ----------------------------------------------------------------
    # 9. Save to DuckDB
    # ----------------------------------------------------------------
    print("  Saving route_stats to DuckDB...")

    # For DuckDB storage, convert list/dict columns to JSON strings
    save_df = route_stats.copy()
    save_df['delay_by_hour'] = save_df['delay_by_hour'].apply(
        lambda x: str(x) if x is not None else '[]'
    )
    save_df['delay_by_day'] = save_df['delay_by_day'].apply(
        lambda x: str(x) if x is not None else '{}'
    )

    # Select final columns
    final_cols = [
        'route_id', 'route_name', 'route_type_str', 'avg_delay_min',
        'median_delay_min', 'pct_on_time', 'total_observations',
        'weighted_median_income', 'income_quartile', 'num_stops',
        'equity_route', 'is_rapid', 'delay_by_hour', 'delay_by_day', 'rank',
        'route_short_name', 'route_long_name', 'route_type'
    ]
    # Only keep columns that exist
    final_cols = [c for c in final_cols if c in save_df.columns]
    save_df = save_df[final_cols]

    con.execute("DROP TABLE IF EXISTS route_stats")
    con.execute("CREATE TABLE route_stats AS SELECT * FROM save_df")

    row_count = con.execute("SELECT COUNT(*) FROM route_stats").fetchone()[0]
    con.close()

    print(f"  Saved {row_count} routes to route_stats table.")

    # ----------------------------------------------------------------
    # Summary
    # ----------------------------------------------------------------
    print(f"\n  Route Stats Summary:")
    print(f"    Total routes: {len(route_stats)}")
    print(f"    Equity routes flagged: {route_stats['equity_route'].sum()}")
    print(f"    Avg delay range: "
          f"{route_stats['avg_delay_min'].min():.1f} to "
          f"{route_stats['avg_delay_min'].max():.1f} min")
    print(f"    On-time rate range: "
          f"{route_stats['pct_on_time'].min():.1f}% to "
          f"{route_stats['pct_on_time'].max():.1f}%")
    print(f"    Income range: "
          f"${route_stats['weighted_median_income'].min():,.0f} to "
          f"${route_stats['weighted_median_income'].max():,.0f}")

    # Show top 5 most delayed
    print(f"\n  Top 5 Most Delayed Routes:")
    top5 = route_stats.nsmallest(5, 'rank')
    for _, row in top5.iterrows():
        eq_flag = " [EQUITY]" if row['equity_route'] else ""
        print(f"    #{row['rank']}: {row['route_name']} - "
              f"{row['avg_delay_min']:.1f} min avg delay, "
              f"{row['pct_on_time']:.1f}% on-time{eq_flag}")

    print("\nStep 6 complete.")


if __name__ == '__main__':
    main()
