# Core integration — displaying these screenshots (deferred batch)

This documents the **future** work needed to make the VCTRbase app actually show
the screenshots hosted in this repo. It is intentionally **not done yet**: it was
split out to avoid touching core while other work is in flight there (no
merge-conflict risk with in-flight plugin/manifest changes). Nothing in core has
been changed by the screenshot work.

## How core surfaces screenshots today (no change)

`app/Http/Controllers/Plugins/MarketplaceController.php`:

- `show($slug)` sets `$screenshots` from the plugin's **local** manifest
  (`$manifest->raw['screenshots']`), falling back to the resolved catalog
  entry's `screenshots`.
- `index()` renders each `CatalogEntry->toArray()`, whose `screenshots` come from
  whatever the active `MarketplaceRegistry` driver sourced.

`resources/js/Pages/Marketplace/Index.tsx` renders `plugin.screenshots[0]` per
card; `Show.tsx` renders the full array. Both already exist — no UI work is
needed. The gap is purely **data**: for the 20 in-tree plugins, `screenshots` is
empty, so the marketplace shows the blank `ScreenshotThumb` "No preview" tile.

## Prerequisite

Merge this branch to `main` and push, so the raw URLs in
[`screenshots/index.json`](../screenshots/index.json) resolve:

```
https://raw.githubusercontent.com/VCTRSio/marketplace-repository/main/screenshots/<slug>/01-<page>.png
```

## Options for the deferred batch (pick one)

### Option A — data-only, in-tree manifests (recommended, zero core code)

Add a `screenshots` array to each core `plugins/<slug>/manifest.json` pointing at
its raw URL from `index.json`. This works in the app's **default local marketplace
mode** and needs no code change — `MarketplaceController::show()` already reads
`$manifest->raw['screenshots']`, and the local catalog entry picks it up for the
index cards.

This is mechanical: read `screenshots/index.json` (slug → [url]) and append a
`screenshots` key to each matching core manifest (append-only, key order + 2-space
indent preserved). Skip `partner-hub` (no asset). ~19 one-key edits. Do it in a
core branch **after** the in-flight core work lands, to avoid conflicts.

Trade-off: the images then load cross-origin from GitHub raw. If that is undesirable
for the in-app experience, prefer Option B/C or mirror the assets onto the app's
own `public/`.

### Option B — remote / composite registry

If/when the in-tree plugins gain per-plugin catalog entries in this repo
(`plugins/<slug>/manifest.json` with a `screenshots` array — the native
marketplace-repository shape, as `vb-vendor-manager` already has minus screenshots)
and the app runs in `marketplace.driver=remote` (or composite), `RemoteRegistry`
surfaces the screenshots automatically. This is the "real" long-term path but
requires the plugins to be catalogued here and the app configured for remote mode.

### Option C — registry merge by slug (small core code change)

Teach `MarketplaceRegistry` / `CatalogEntry` to merge a screenshots source (e.g.
fetch this repo's `screenshots/index.json` and key by slug) onto local catalog
entries, so in-tree plugins get screenshots without editing each manifest and
without full remote mode. Localizes the change to the registry layer.

## Recommendation

Ship **Option A** as the near-term batch (fastest, no code, works in the default
running app), then migrate to **Option B** as plugins are extracted/catalogued
here. Whichever path: land it on a fresh core branch after the current in-flight
core work merges, so the 19 manifest edits don't conflict.
