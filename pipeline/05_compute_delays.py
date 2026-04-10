"""
Script 05: Compute delays from stop_observations.
The 511.org stop_observations already contains scheduled_arrival_time and
observed_arrival_time, plus route_id and service_date, so we compute delays
directly without joining to stop_times.
"""

import os
import duckdb

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')


def main():
    print("Step 5: Computing delays from stop observations...")

    con = duckdb.connect(DB_PATH)

    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    print(f"  Available tables: {tables}")

    if 'stop_observations' not in tables:
        print("  WARNING: stop_observations table not found. Skipping.")
        con.close()
        return

    obs_count = con.execute("SELECT COUNT(*) FROM stop_observations").fetchone()[0]
    print(f"  stop_observations rows: {obs_count:,}")

    if obs_count == 0:
        print("  No observations to process. Exiting.")
        con.close()
        return

    # The stop_observations table already has:
    #   trip_id, route_id, stop_sequence, from_stop_id, to_stop_id,
    #   scheduled_arrival_time, observed_arrival_time, service_date
    # So we can compute delays directly in SQL.

    print("  Computing delays directly from stop_observations...")

    con.execute("DROP TABLE IF EXISTS delays")
    con.execute("""
        CREATE TABLE delays AS
        WITH parsed AS (
            SELECT
                trip_id,
                route_id,
                COALESCE(to_stop_id, from_stop_id) AS stop_id,
                CAST(stop_sequence AS INTEGER) AS stop_sequence,
                scheduled_arrival_time,
                observed_arrival_time,
                service_date,
                month,

                -- Parse scheduled time to seconds
                CAST(SPLIT_PART(scheduled_arrival_time, ':', 1) AS INTEGER) * 3600
                + CAST(SPLIT_PART(scheduled_arrival_time, ':', 2) AS INTEGER) * 60
                + CAST(SPLIT_PART(scheduled_arrival_time, ':', 3) AS INTEGER) AS sched_secs,

                -- Parse observed time to seconds
                CAST(SPLIT_PART(observed_arrival_time, ':', 1) AS INTEGER) * 3600
                + CAST(SPLIT_PART(observed_arrival_time, ':', 2) AS INTEGER) * 60
                + CAST(SPLIT_PART(observed_arrival_time, ':', 3) AS INTEGER) AS obs_secs

            FROM stop_observations
            WHERE scheduled_arrival_time IS NOT NULL
              AND observed_arrival_time IS NOT NULL
              AND LENGTH(scheduled_arrival_time) >= 7
              AND LENGTH(observed_arrival_time) >= 7
        )
        SELECT
            trip_id,
            route_id,
            stop_id,
            stop_sequence,
            sched_secs AS scheduled_seconds,
            obs_secs AS observed_seconds,
            (obs_secs - sched_secs) AS delay_seconds,
            CASE WHEN (obs_secs - sched_secs) >= -60
                  AND (obs_secs - sched_secs) <= 300
                 THEN TRUE ELSE FALSE END AS on_time,
            (sched_secs / 3600) % 24 AS hour_of_day,
            -- day_of_week from service_date: 0=Mon ... 6=Sun
            CASE
                WHEN service_date IS NOT NULL AND LENGTH(service_date) = 8 THEN
                    (EXTRACT(DOW FROM CAST(
                        SUBSTR(service_date, 1, 4) || '-' ||
                        SUBSTR(service_date, 5, 2) || '-' ||
                        SUBSTR(service_date, 7, 2) AS DATE
                    )) + 6) % 7
                ELSE 0
            END AS day_of_week,
            month
        FROM parsed
        WHERE (obs_secs - sched_secs) >= -600   -- filter: no more than 10 min early
          AND (obs_secs - sched_secs) <= 3600    -- filter: no more than 60 min late
    """)

    row_count = con.execute("SELECT COUNT(*) FROM delays").fetchone()[0]
    print(f"  Created delays table: {row_count:,} records")

    # Summary stats
    stats = con.execute("""
        SELECT
            COUNT(*) AS total,
            AVG(delay_seconds) AS mean_delay,
            MEDIAN(delay_seconds) AS median_delay,
            STDDEV(delay_seconds) AS std_delay,
            100.0 * SUM(CASE WHEN on_time THEN 1 ELSE 0 END) / COUNT(*) AS pct_on_time,
            COUNT(DISTINCT route_id) AS num_routes
        FROM delays
    """).fetchone()

    print(f"\n  Summary:")
    print(f"    Total delay observations: {stats[0]:,}")
    print(f"    Mean delay: {stats[1]:.0f} seconds ({stats[1]/60:.1f} minutes)")
    print(f"    Median delay: {stats[2]:.0f} seconds ({stats[2]/60:.1f} minutes)")
    print(f"    On-time rate (-1min to +5min): {stats[4]:.1f}%")
    print(f"    Routes with data: {stats[5]}")

    con.close()
    print("\nStep 5 complete.")


if __name__ == '__main__':
    main()
