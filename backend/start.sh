#!/usr/bin/env bash
# start.sh — set up and run the Is There a Dishwasher? backend.
#
# Usage (from the project root OR the backend/ directory):
#   ./backend/start.sh
#
# On first run this script will:
#   1. Create a Python virtual environment at backend/.venv
#   2. Install Python dependencies from backend/requirements.txt
#   3. Install Playwright's Chromium browser (needed for the scraper fallback)
# Subsequent runs skip steps that are already done and go straight to
# starting the server.

set -euo pipefail

# Resolve the directory this script lives in regardless of where it is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

# ── 1. Create virtual environment ────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  echo "Creating virtual environment…"
  python3 -m venv "$VENV"
fi

# ── 2. Activate ───────────────────────────────────────────────────────────────
# shellcheck disable=SC1091
source "$VENV/bin/activate"

# ── 3. Install / update Python dependencies ───────────────────────────────────
echo "Installing Python dependencies…"
pip install -q -r "$SCRIPT_DIR/requirements.txt"

# ── 4. Install Playwright Chromium (skipped if already present) ───────────────
if ! python -c "from playwright.sync_api import sync_playwright; \
    p = sync_playwright().start(); b = p.chromium.launch(); b.close(); p.stop()" \
    2>/dev/null; then
  echo "Installing Playwright Chromium…"
  playwright install chromium --with-deps
fi

# ── 5. Start the server ───────────────────────────────────────────────────────
echo ""
echo "Starting backend on http://localhost:8000"
echo "Press Ctrl+C to stop."
echo ""
cd "$SCRIPT_DIR"
uvicorn main:app --reload
