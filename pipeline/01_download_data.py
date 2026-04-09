"""
01_download_data.py
Downloads 3 months of historic GTFS with stop observations from 511.org,
plus TIGER/Line census tract shapefiles for California.
"""

import os, sys, requests, zipfile, time

API_KEY = os.environ.get('API_KEY_511')
RAW_DIR = os.path.join(os.path.dirname(__file__), 'data', 'raw')
MONTHS = ['2025-12', '2026-01', '2026-02']


def download_historic_gtfs(month, api_key):
    """Download historic regional GTFS with stop observations for a month."""
    url = (
        f"https://api.511.org/transit/datafeeds"
        f"?api_key={api_key}&operator_id=RG&historic={month}-so"
    )
    out_zip = os.path.join(RAW_DIR, f'historic-{month}-so.zip')
    out_dir = os.path.join(RAW_DIR, month)

    if os.path.exists(out_dir) and os.listdir(out_dir):
        print(f"  {month}: already downloaded, skipping")
        return out_dir

    print(f"  Downloading {month}...")
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(out_zip, 'wb') as f:
        f.write(resp.content)
    print(f"  Downloaded {len(resp.content) / 1024 / 1024:.1f} MB")

    os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(out_zip, 'r') as zf:
        zf.extractall(out_dir)
    print(f"  Extracted to {out_dir}")

    return out_dir


def download_tiger():
    """Download TIGER/Line census tract shapefile for California."""
    url = "https://www2.census.gov/geo/tiger/TIGER2024/TRACT/tl_2024_06_tract.zip"
    out_zip = os.path.join(RAW_DIR, 'tl_2024_06_tract.zip')
    out_dir = os.path.join(RAW_DIR, 'tiger')

    if os.path.exists(out_dir) and os.listdir(out_dir):
        print("  TIGER: already downloaded, skipping")
        return out_dir

    print("  Downloading TIGER shapefile...")
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(out_zip, 'wb') as f:
        f.write(resp.content)
    print(f"  Downloaded {len(resp.content) / 1024 / 1024:.1f} MB")

    os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(out_zip, 'r') as zf:
        zf.extractall(out_dir)
    print(f"  Extracted to {out_dir}")

    return out_dir


def download_sfmta_fallback():
    """Fallback: download static SFMTA GTFS (no stop observations)."""
    url = "https://gtfs.sfmta.com/transitdata/google_transit.zip"
    out_zip = os.path.join(RAW_DIR, 'sfmta_static.zip')
    out_dir = os.path.join(RAW_DIR, 'sfmta-static')

    if os.path.exists(out_dir) and os.listdir(out_dir):
        print("  SFMTA static: already downloaded, skipping")
        return out_dir

    print("  Downloading SFMTA static GTFS (fallback, no stop observations)...")
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(out_zip, 'wb') as f:
        f.write(resp.content)

    os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(out_zip, 'r') as zf:
        zf.extractall(out_dir)
    print(f"  Extracted to {out_dir}")

    return out_dir


def main():
    print("=== Step 1: Download Data ===\n")
    os.makedirs(RAW_DIR, exist_ok=True)

    if not API_KEY:
        print("WARNING: API_KEY_511 not set.")
        print("Downloading SFMTA static GTFS as fallback (no stop observation data).")
        print("To get real delay data, register at https://511.org/open-data/transit\n")
        download_sfmta_fallback()
    else:
        for month in MONTHS:
            download_historic_gtfs(month, API_KEY)
            time.sleep(2)  # respect rate limits

    download_tiger()
    print("\nStep 1 complete.")


if __name__ == '__main__':
    main()
