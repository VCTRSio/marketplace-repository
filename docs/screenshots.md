# Plugin screenshots — asset store

This repo hosts the plugin marketing screenshots for VCTRbase as a flat, static
asset store, served over HTTPS from GitHub raw:

```
screenshots/
  index.json                     # { "<slug>": ["<served-url>"], ... }
  <slug>/01-<page>.png           # one dark-mode hero per shipping plugin
```

Each PNG is a **dark-mode** (VCTRbase's default/preferred theme) hero of a
plugin's primary page, at 1440×900 @2x (2880×1800). The served URL for a file is:

```
https://raw.githubusercontent.com/VCTRSio/marketplace-repository/main/screenshots/<slug>/01-<page>.png
```

`screenshots/index.json` is the machine-readable map from core plugin slug to its
served URL(s) — the artifact the core-integration batch consumes (see
[core-integration.md](core-integration.md)).

> **These assets are not yet displayed by the app.** Wiring core to surface them
> is deliberately deferred to a separate batch — this repo only produces and hosts
> the images. The raw URLs above resolve only **after this branch is merged to
> `main` and pushed** (they reference the `main` ref).

## Regenerating

`tools/plugin-screenshots.sh` (a Playwright driver) captures every shipping
plugin from a **running** VCTRbase dev app and writes the PNGs + `index.json`
here. It reads each plugin's nav landing page from the core checkout's manifests
and writes **nothing** into core.

```bash
# one-time: install the tool's dependency (chromium downloads separately)
npm --prefix tools install
npx --prefix tools playwright install chromium     # if chromium isn't cached

# capture (dev app must be up; use a login that can reach /dashboard/*)
VB_EMAIL=you@example.com VB_PASSWORD=… tools/plugin-screenshots.sh          # all
VB_EMAIL=you@example.com VB_PASSWORD=… tools/plugin-screenshots.sh vault    # one
```

Re-running overwrites the PNG(s) and merges `index.json` (a per-slug run does not
drop other slugs).

**Env overrides:** `BASE_URL` (default `http://127.0.0.1:8080`),
`VB_EMAIL`/`VB_PASSWORD`, `VB_PLUGINS_DIR` (default `<repo>/../vctrbase-php/plugins`
— i.e. a core checkout sibling to this repo), `SCREENSHOTS_DIR`,
`SCREENSHOT_BASE_URL`, `VB_EXTERNAL_PLUGINS` (see below).

### External (extracted) plugins

The scan above only sees plugins in the **core** `plugins/` tree, and skips any
with `enabledByDefault: false`. An **extracted marketplace plugin** — one that ships
from its own repo, like `vb-gratitude` — is neither: it lives outside core and ships
`enabledByDefault: false` by design. Point the tool at it explicitly with
`VB_EXTERNAL_PLUGINS`, a comma- (or colon-) separated list of absolute plugin
directories, each containing a `manifest.json`:

```bash
VB_EXTERNAL_PLUGINS=/home/you/Work/VCTRS/vctrbase-plugins/vb-gratitude \
  VB_EMAIL=you@example.com VB_PASSWORD=… \
  tools/plugin-screenshots.sh gratitude
```

Naming a plugin here IS the opt-in, so the `enabledByDefault: false` filter does
not apply to it. Its slug is **normalized** (a leading `vb-` is stripped, matching
the app-side `ScreenshotRegistry`), so `vb-gratitude` is written to
`screenshots/gratitude/01-view.png` and keyed as `gratitude` in `index.json`. The
optional slug arg accepts either `gratitude` or `vb-gratitude`.

**Prerequisite:** the plugin must be **installed AND enabled in the running app**
for the target tenant, with enough data that the page isn't a blank hero.
`VB_EXTERNAL_PLUGINS` only tells the capturer where to point the browser — it does
not install, enable, or seed anything.

## Scope of a capture

The tool captures the shipping set = every core manifest with a `/dashboard/` nav
href **and** not opted out via `enabledByDefault: false`. That is the 20 first-party
in-tree plugins; `sample-esm` (no nav) and `hello` (`enabledByDefault:false`, a
demo) are excluded. Derived programmatically, not hardcoded.

### Known gaps in the current set (19 of 20)

- **`partner-hub` — no screenshot.** Its page 403s for the capture account (needs
  `partner-hub.room.read` in the active tenant). The tool detects the 403 and
  leaves it out (soft skip). Re-run `tools/plugin-screenshots.sh partner-hub` with
  a permitted account to add it.
- **`looker-studio`** — renders the real plugin chrome, but the embedded Google
  Data Studio report is gated by Google's "allow third-party cookies" screen (the
  report needs an authenticated Google session, which a headless browser can't
  supply). Reshoot against a public report / authenticated session for a stronger
  hero.
- **Empty-state heroes** (honest renders, correct pages, little data):
  `google-business-profile` (not connected), `vault` (no documents), `training`
  (no modules), `warranty-recall` (no active recalls/campaigns). Seeded data would
  make these richer.

### Caveat

Capture only gates on HTTP status + landed URL. A 200 page that renders blank or
whose cross-origin embed fails to load is still saved as a "real" hero. This tool
is human-run — **eyeball the outputs**; don't commit blind.
