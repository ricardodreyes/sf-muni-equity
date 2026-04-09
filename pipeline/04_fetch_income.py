"""
04_fetch_income.py
Fetches median household income from the Census ACS 5-year API
for all San Francisco census tracts, and saves to DuckDB.
"""

import os, sys, json
import requests
import duckdb
import pandas as pd

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')
CENSUS_API_KEY = os.environ.get('CENSUS_API_KEY')

# ACS 5-Year, table B19013_001E = Median Household Income
ACS_URL = (
    "https://api.census.gov/data/2024/acs/acs5"
    "?get=NAME,B19013_001E"
    "&for=tract:*"
    "&in=state:06"
    "&in=county:075"
)


def fetch_income_data():
    """Fetch median household income for all SF census tracts from ACS API."""
    url = ACS_URL
    if CENSUS_API_KEY:
        url += f"&key={CENSUS_API_KEY}"
        print("  Using Census API key from CENSUS_API_KEY env var")
    else:
        print("  No CENSUS_API_KEY set - using keyless access (rate-limited)")

    print(f"  Fetching ACS income data...")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()

    data = resp.json()
    if not data or len(data) < 2:
        print("ERROR: Unexpected API response (no data rows)")
        sys.exit(1)

    headers = data[0]
    rows = data[1:]
    print(f"  Received {len(rows)} tract records")

    return headers, rows


def parse_income_data(headers, rows):
    """Parse Census API response into a clean DataFrame."""
    df = pd.DataFrame(rows, columns=headers)

    # Build GEOID = state + county + tract
    # State = 06, County = 075, tract needs to be 6 digits
    df['tract_padded'] = df['tract'].str.zfill(6)
    df['geoid'] = '06' + '075' + df['tract_padded']

    # Extract income column
    df['income_raw'] = df['B19013_001E']

    # Convert income to numeric, handling nulls
    df['median_household_income'] = pd.to_numeric(df['income_raw'], errors='coerce')

    # Track suppressed and null values before filtering
    total = len(df)
    null_count = df['median_household_income'].isna().sum()
    suppressed_count = (df['median_household_income'] == -666666666).sum()

    # Filter out suppressed data (Census uses -666666666 for suppressed values)
    df = df[df['median_household_income'] != -666666666].copy()

    # Filter out null/NaN values
    df = df.dropna(subset=['median_household_income']).copy()

    valid = len(df)
    print(f"  Total tracts: {total}")
    print(f"  Suppressed (removed): {suppressed_count}")
    print(f"  Null/invalid (removed): {null_count}")
    print(f"  Valid tracts with income data: {valid}")

    # Build final DataFrame
    result = df[['geoid', 'NAME', 'median_household_income']].copy()
    result.columns = ['geoid', 'name', 'median_household_income']

    return result


def save_to_duckdb(income_df):
    """Save tract income data to DuckDB."""
    con = duckdb.connect(DB_PATH)

    con.execute("DROP TABLE IF EXISTS tract_income")
    con.execute("""
        CREATE TABLE tract_income AS
        SELECT
            geoid::TEXT AS geoid,
            name::TEXT AS name,
            median_household_income::DOUBLE AS median_household_income
        FROM income_df
    """)

    count = con.execute("SELECT COUNT(*) FROM tract_income").fetchone()[0]
    print(f"\n  Saved tract_income: {count} rows")

    con.close()


def print_summary():
    """Print income summary statistics."""
    con = duckdb.connect(DB_PATH, read_only=True)

    stats = con.execute("""
        SELECT
            COUNT(*) AS n_tracts,
            MIN(median_household_income) AS min_income,
            MAX(median_household_income) AS max_income,
            MEDIAN(median_household_income) AS median_income,
            AVG(median_household_income) AS mean_income
        FROM tract_income
    """).fetchdf()

    print("\n--- Income Summary for San Francisco Tracts ---")
    print(f"  Tracts with data: {int(stats['n_tracts'].iloc[0])}")
    print(f"  Min income:       ${stats['min_income'].iloc[0]:,.0f}")
    print(f"  Max income:       ${stats['max_income'].iloc[0]:,.0f}")
    print(f"  Median income:    ${stats['median_income'].iloc[0]:,.0f}")
    print(f"  Mean income:      ${stats['mean_income'].iloc[0]:,.0f}")

    # Show a few lowest and highest tracts
    print("\n  Lowest-income tracts:")
    lowest = con.execute("""
        SELECT geoid, name, median_household_income
        FROM tract_income
        ORDER BY median_household_income ASC
        LIMIT 5
    """).fetchdf()
    for _, row in lowest.iterrows():
        print(f"    {row['geoid']}  ${row['median_household_income']:>10,.0f}  {row['name']}")

    print("\n  Highest-income tracts:")
    highest = con.execute("""
        SELECT geoid, name, median_household_income
        FROM tract_income
        ORDER BY median_household_income DESC
        LIMIT 5
    """).fetchdf()
    for _, row in highest.iterrows():
        print(f"    {row['geoid']}  ${row['median_household_income']:>10,.0f}  {row['name']}")

    con.close()


def main():
    print("=== Step 4: Fetch Census Income Data ===\n")

    headers, rows = fetch_income_data()
    income_df = parse_income_data(headers, rows)
    save_to_duckdb(income_df)
    print_summary()

    print("\nStep 4 complete.")


if __name__ == '__main__':
    main()
