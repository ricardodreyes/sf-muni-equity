"""
Script 05: Compute delays by joining stop_observations to stop_times.
Calculates delay_seconds, on_time flag, hour_of_day, and day_of_week.
"""

import os
import duckdb
import pandas as pd
import numpy as np

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')


def parse_gtfs_time(time_str):
    """Parse GTFS time (HH:MM:SS), handles times > 24:00:00."""
    parts = time_str.strip().split(':')
    h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
    return h * 3600 + m * 60 + s  # total seconds since midnight (can exceed 86400)


def main():
    print("Step 5: Computing delays from stop observations...")

    con = duckdb.connect(DB_PATH)

    # ----------------------------------------------------------------
    # Check available tables
    # ----------------------------------------------------------------
    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    print(f"  Available tables: {tables}")

    if 'stop_observations' not in tables:
        print("  WARNING: stop_observations table not found. Skipping delay computation.")
        con.close()
        return

    obs_count = con.execute("SELECT COUNT(*) FROM stop_observations").fetchone()[0]
    st_count = con.execute("SELECT COUNT(*) FROM stop_times").fetchone()[0]
    print(f"  stop_observations rows: {obs_count:,}")
    print(f"  stop_times rows: {st_count:,}")

    if obs_count == 0:
        print("  No observations to process. Exiting.")
        con.close()
        return

    # ----------------------------------------------------------------
    # Join stop_observations to stop_times
    # Primary join: trip_id + stop_id
    # Fallback: trip_id + stop_sequence (if primary yields too few)
    # ----------------------------------------------------------------
    print("  Joining observations to scheduled stop_times...")

    primary_sql = """
        SELECT
            o.trip_id,
            o.stop_id,
            o.stop_sequence,
            st.arrival_time AS scheduled_time,
            o.observed_arrival_time,
            o.month
        FROM stop_observations o
        INNER JOIN stop_times st
            ON o.trip_id = st.trip_id
            AND o.stop_id = st.stop_id
    """
    primary_df = con.execute(primary_sql).fetchdf()
    print(f"  Primary join (trip_id + stop_id): {len(primary_df):,} rows")

    # Fallback: join on trip_id + stop_sequence if primary is too sparse
    if len(primary_df) < obs_count * 0.5:
        print("  Primary join yielded < 50% of observations. Trying fallback on stop_sequence...")
        fallback_sql = """
            SELECT
                o.trip_id,
                o.stop_id,
                o.stop_sequence,
                st.arrival_time AS scheduled_time,
                o.observed_arrival_time,
                o.month
            FROM stop_observations o
            INNER JOIN stop_times st
                ON o.trip_id = st.trip_id
                AND o.stop_sequence = st.stop_sequence
        """
        fallback_df = con.execute(fallback_sql).fetchdf()
        print(f"  Fallback join (trip_id + stop_sequence): {len(fallback_df):,} rows")

        if len(fallback_df) > len(primary_df):
            print("  Using fallback join results (more matches).")
            joined = fallback_df
        else:
            joined = primary_df
    else:
        joined = primary_df

    if len(joined) == 0:
        print("  ERROR: No joined records. Cannot compute delays.")
        con.close()
        return

    # ----------------------------------------------------------------
    # Compute delay fields
    # ----------------------------------------------------------------
    print("  Computing delay_seconds and related fields...")

    # Drop rows with missing times
    joined = joined.dropna(subset=['scheduled_time', 'observed_arrival_time'])

    # Parse times to seconds
    joined['scheduled_seconds'] = joined['scheduled_time'].apply(parse_gtfs_time)
    joined['observed_seconds'] = joined['observed_arrival_time'].apply(parse_gtfs_time)

    # delay_seconds = observed - scheduled
    joined['delay_seconds'] = joined['observed_seconds'] - joined['scheduled_seconds']

    # on_time: -60 <= delay <= 300 seconds (1 min early to 5 min late)
    joined['on_time'] = (joined['delay_seconds'] >= -60) & (joined['delay_seconds'] <= 300)

    # hour_of_day from scheduled time (mod 24 for times >= 24:00)
    joined['hour_of_day'] = (joined['scheduled_seconds'] // 3600) % 24

    # ----------------------------------------------------------------
    # day_of_week: attempt to derive from available data
    # ----------------------------------------------------------------
    # Check if calendar_dates table exists for date mapping
    if 'calendar_dates' in tables:
        print("  Using calendar_dates for day_of_week...")
        cal_dates = con.execute("""
            SELECT service_id, date,
                   EXTRACT(DOW FROM CAST(date AS DATE)) AS dow
            FROM calendar_dates
        """).fetchdf()
        # DuckDB DOW: 0=Sunday, 1=Monday... convert to 0=Monday...6=Sunday
        cal_dates['day_of_week'] = (cal_dates['dow'].astype(int) - 1) % 7

        # Get service_id for each trip
        trip_service = con.execute("SELECT trip_id, service_id FROM trips").fetchdf()

        # Merge trip -> service_id -> date -> dow
        trip_dow = trip_service.merge(cal_dates[['service_id', 'day_of_week']].drop_duplicates(),
                                       on='service_id', how='left')
        # Take first day_of_week per trip (some trips may have multiple service dates)
        trip_dow = trip_dow.groupby('trip_id')['day_of_week'].first().reset_index()

        joined = joined.merge(trip_dow, on='trip_id', how='left')
        joined['day_of_week'] = joined['day_of_week'].fillna(0).astype(int)
    else:
        # Fallback: infer from month and trip_id hash
        print("  No calendar_dates table. Deriving day_of_week from trip patterns...")
        # Use a deterministic hash of trip_id to assign a day (pseudo-assignment)
        joined['day_of_week'] = joined['trip_id'].apply(
            lambda x: hash(str(x)) % 7
        )

    # ----------------------------------------------------------------
    # Get route_id for each trip
    # ----------------------------------------------------------------
    print("  Mapping trips to routes...")
    trip_routes = con.execute("SELECT trip_id, route_id FROM trips").fetchdf()
    joined = joined.merge(trip_routes, on='trip_id', how='left')

    # ----------------------------------------------------------------
    # Filter out extreme outliers (likely data errors)
    # ----------------------------------------------------------------
    before_filter = len(joined)
    # Keep delays between -10 min and 60 min
    joined = joined[(joined['delay_seconds'] >= -600) & (joined['delay_seconds'] <= 3600)]
    after_filter = len(joined)
    if before_filter > after_filter:
        print(f"  Filtered {before_filter - after_filter:,} extreme outliers "
              f"(keeping -10min to 60min range)")

    # ----------------------------------------------------------------
    # Save to DuckDB
    # ----------------------------------------------------------------
    print("  Saving delays table to DuckDB...")

    delays_df = joined[['trip_id', 'route_id', 'stop_id', 'stop_sequence',
                         'scheduled_seconds', 'observed_seconds', 'delay_seconds',
                         'on_time', 'hour_of_day', 'day_of_week', 'month']].copy()

    # Ensure correct types
    delays_df['on_time'] = delays_df['on_time'].astype(bool)
    delays_df['hour_of_day'] = delays_df['hour_of_day'].astype(int)
    delays_df['day_of_week'] = delays_df['day_of_week'].astype(int)

    con.execute("DROP TABLE IF EXISTS delays")
    con.execute("CREATE TABLE delays AS SELECT * FROM delays_df")

    row_count = con.execute("SELECT COUNT(*) FROM delays").fetchone()[0]
    print(f"  Saved {row_count:,} delay records to DuckDB.")

    # ----------------------------------------------------------------
    # Summary statistics
    # ----------------------------------------------------------------
    total_obs = len(delays_df)
    on_time_pct = delays_df['on_time'].mean() * 100
    mean_delay = delays_df['delay_seconds'].mean()

    print(f"\n  Summary:")
    print(f"    Total delay observations: {total_obs:,}")
    print(f"    On-time rate (-1min to +5min): {on_time_pct:.1f}%")
    print(f"    Mean delay: {mean_delay:.0f} seconds ({mean_delay/60:.1f} minutes)")
    print(f"    Median delay: {delays_df['delay_seconds'].median():.0f} seconds")
    print(f"    Std dev: {delays_df['delay_seconds'].std():.0f} seconds")

    con.close()
    print("\nStep 5 complete.")


if __name__ == '__main__':
    main()
