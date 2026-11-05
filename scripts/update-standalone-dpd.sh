#!/usr/bin/env bash
# Locally generates the reader's standalone dictionary files from the DPD database (SBS fork for RU).
# Transfered from dictPlugin/GitHub Actions to local server.
#
# Usage: ./scripts/update-standalone-dpd.sh [--install]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="/tmp/dpd_gen"
mkdir -p "$TMP_DIR"
cd "$TMP_DIR"

# 1. Get the latest DPD database from sasanarakkha/dpd-db-sbs (contains Russian table)
DB_URL=$(curl -s https://api.github.com/repos/sasanarakkha/dpd-db-sbs/releases/latest | grep "browser_download_url.*dpd.db.tar.xz" | cut -d '"' -f 4)

if [ -z "$DB_URL" ]; then
    echo "Error: Could not find latest DPD database URL."
    exit 1
fi

echo "Latest DPD DB URL: $DB_URL"
# Download only if different or not present
if [ ! -f "dpd.db" ]; then
    echo "Downloading and extracting DPD database..."
    curl -fsSL "$DB_URL" -o dpd.db.tar.xz
    tar -xJf dpd.db.tar.xz
    rm dpd.db.tar.xz
fi

# 2. Run the generator
echo "Generating standalone DPD files..."
# Pass the repo root so it can find sutta_words.txt
python3 "$REPO_ROOT/scripts/build-standalone-dpd.py" "$REPO_ROOT" "$TMP_DIR/output"

# 3. Installation
if [ "${1:-}" = "--install" ]; then
    DST="$REPO_ROOT/public/overrides/js/standalone-dpd"
    echo "Installing files to $DST..."
    mkdir -p "$DST/ru"
    cp -v "$TMP_DIR/output/dpd_i2h.js" "$DST/"
    cp -v "$TMP_DIR/output/dpd_ebts.js" "$DST/"
    cp -v "$TMP_DIR/output/ru/dpd_ebts.js" "$DST/ru/"
    cp -v "$TMP_DIR/output/dpd_deconstructor.js" "$DST/"
    echo "Successfully installed."
else
    echo "Done. Files are in $TMP_DIR/output. Run with --install to update production files."
fi
