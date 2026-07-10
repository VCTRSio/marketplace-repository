#!/usr/bin/env sh
# plugin-screenshots.sh — capture one DARK-MODE hero screenshot per shipping
# VCTRbase plugin from the live dev app and store them in this repo as a flat
# asset store: screenshots/<slug>/01-<page>.png (+ screenshots/index.json).
#
#   tools/plugin-screenshots.sh            # all shipping plugins
#   tools/plugin-screenshots.sh <slug>     # just that plugin
#
# Requires: node + the `playwright` devDependency (install once with
# `npm --prefix tools install`; chromium downloads via `npx playwright install
# chromium`). The dev app must be up at BASE_URL (default http://127.0.0.1:8080)
# with a logged-in-capable account.
#
# This tool writes ONLY into this repo (screenshots/) — never into core. The
# images are served over HTTPS from GitHub raw; wiring the VCTRbase app to
# surface them is a separate, documented batch (docs/core-integration.md).
#
# Env overrides: BASE_URL, VB_EMAIL, VB_PASSWORD, VB_PLUGINS_DIR,
# SCREENSHOTS_DIR, SCREENSHOT_BASE_URL. See tools/plugin-screenshots.mjs header.
set -eu

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

if ! curl -fsS -o /dev/null "${BASE_URL}/login"; then
    echo "error: dev app not reachable at ${BASE_URL} (is the VCTRbase stack up?)" >&2
    exit 1
fi

exec node "${DIR}/plugin-screenshots.mjs" "$@"
