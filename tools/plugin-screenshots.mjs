// plugin-screenshots.mjs
//
// Captures one DARK-MODE hero screenshot per shipping VCTRbase plugin from a
// running dev app, and stores the images in THIS marketplace-repository as a
// flat asset store:  screenshots/<slug>/01-<page>.png  plus a machine-readable
// screenshots/index.json  ({ "<slug>": ["<served-url>"] }).
//
// The images are meant to be served over HTTPS from this GitHub-backed repo
// (raw.githubusercontent.com). The running VCTRbase app does NOT yet consume
// them — wiring core to surface these URLs is a separate, documented batch of
// work (see docs/core-integration.md). This tool only produces the assets.
//
// It reads each plugin's nav landing page from the core checkout's plugin
// manifests (VB_PLUGINS_DIR) and drives the live app (BASE_URL) as a logged-in
// user. Capture is READ-ONLY browsing; it mutates no app state and writes
// nothing into core.
//
// Usage (via the wrapper): tools/plugin-screenshots.sh [slug]
//   no arg  -> all shipping plugins
//   <slug>  -> just that plugin
//
// Env overrides:
//   BASE_URL             dev app base (default http://127.0.0.1:8080)
//   VB_EMAIL / VB_PASSWORD   login (default owner@demo.co / password123)
//   VB_PLUGINS_DIR       core plugins/ dir (default <repo>/../vctrbase-php/plugins)
//   SCREENSHOTS_DIR      output dir (default <repo>/screenshots)
//   SCREENSHOT_BASE_URL  served URL prefix (default the VCTRSio raw main URL)
//
// CAVEAT: capture only gates on HTTP status + landed URL. A 200 page that
// renders blank, or whose cross-origin embed fails to load (e.g. looker-studio's
// Google report needs an authenticated session), is still saved as a "real"
// hero. This tool is human-run — EYEBALL the outputs; do not commit blind.
//
// Importing this module (e.g. for unit tests) never launches a browser.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const EMAIL = process.env.VB_EMAIL ?? 'owner@demo.co';
const PASSWORD = process.env.VB_PASSWORD ?? 'password123';
const PLUGINS_DIR = process.env.VB_PLUGINS_DIR ?? join(REPO_ROOT, '..', 'vctrbase-php', 'plugins');
const OUT_DIR = process.env.SCREENSHOTS_DIR ?? join(REPO_ROOT, 'screenshots');
const SCREENSHOT_BASE_URL =
    process.env.SCREENSHOT_BASE_URL ??
    'https://raw.githubusercontent.com/VCTRSio/marketplace-repository/main/screenshots';

const VIEWPORT = { width: 1440, height: 900 };

/** Last path segment of a nav href, used for the <page> filename token. */
export function pageFromHref(href) {
    return String(href).replace(/\/+$/, '').split('/').filter(Boolean).pop();
}

/** Served HTTPS URL for a plugin's hero, as referenced from manifests later. */
export function screenshotUrl(slug, page, base = SCREENSHOT_BASE_URL) {
    return `${base.replace(/\/+$/, '')}/${slug}/01-${page}.png`;
}

/**
 * Strip a single leading `vb-` publisher prefix so an external (extracted)
 * plugin's slug lands under the same index key the app-side resolver looks up.
 * Mirrors App\Plugins\Marketplace\ScreenshotRegistry::normalize exactly, so
 * `vb-gratitude` → `gratitude`. Un-prefixed slugs (and core plugin dir names,
 * which are already un-prefixed) pass through unchanged.
 */
export function normalizeSlug(slug) {
    const s = String(slug);
    return s.startsWith('vb-') ? s.slice(3) : s;
}

/** Assemble a capture target from a normalized slug + its /dashboard/ nav href. */
function buildTarget(slug, href) {
    const page = pageFromHref(href);
    return {
        slug,
        href,
        page,
        outFile: join(OUT_DIR, slug, `01-${page}.png`),
        url: screenshotUrl(slug, page),
        appUrl: `${BASE_URL}${href}`,
    };
}

/**
 * Build a capture target from an EXTERNAL plugin directory — one containing a
 * manifest.json that lives OUTSIDE the core plugins/ tree (an extracted
 * marketplace plugin such as vb-gratitude, which ships from its own repo).
 *
 * Two deliberate differences from resolveTargets:
 *   - it does NOT apply the `enabledByDefault: false` filter. Extracted
 *     marketplace plugins are opt-in by design and ship that flag false; naming
 *     one explicitly (via VB_EXTERNAL_PLUGINS) IS the operator opt-in.
 *   - the slug is normalized (leading `vb-` stripped) so the output folder,
 *     index key, and served URL match the app-side ScreenshotRegistry lookup.
 *
 * The plugin must still be installed AND enabled in the running app for its page
 * to render — this only tells the capturer WHERE to point the browser.
 *
 * @param {string} pluginDir absolute path to a dir containing manifest.json
 * @returns {{slug:string, href:string, page:string, outFile:string, url:string, appUrl:string}}
 */
export function externalTarget(pluginDir) {
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'));
    } catch (e) {
        throw new Error(`External plugin dir "${pluginDir}" has no readable manifest.json: ${e.message}`);
    }

    const slug = normalizeSlug(manifest.slug ?? manifest.id ?? '');
    if (!slug) throw new Error(`External plugin at "${pluginDir}" declares no slug/id`);

    const navEntry = Array.isArray(manifest.nav)
        ? manifest.nav.find((n) => typeof n?.href === 'string' && n.href.startsWith('/dashboard/'))
        : undefined;
    if (!navEntry) throw new Error(`External plugin "${slug}" has no /dashboard/ nav href to capture`);

    return buildTarget(slug, navEntry.href);
}

/**
 * Resolve the shipping plugin set from the on-disk core manifests.
 *
 * Shipping = a manifest that (a) has a nav[] entry whose href starts with
 * `/dashboard/` AND (b) is not opted out via `enabledByDefault: false`.
 * `feed` has no enabledByDefault key (kept), `hello` is false (skipped),
 * `sample-esm` has no /dashboard nav (skipped).
 *
 * @param {string} pluginsDir absolute path to the core plugins/ dir
 * @returns {{slug:string, href:string, page:string, outFile:string, url:string, appUrl:string}[]}
 */
export function resolveTargets(pluginsDir) {
    const targets = [];

    for (const slug of readdirSync(pluginsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()) {
        const manifestPath = join(pluginsDir, slug, 'manifest.json');
        let manifest;
        try {
            manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        } catch {
            continue; // no/invalid manifest -> not a plugin dir
        }

        if (manifest.enabledByDefault === false) continue;

        const navEntry = Array.isArray(manifest.nav)
            ? manifest.nav.find((n) => typeof n?.href === 'string' && n.href.startsWith('/dashboard/'))
            : undefined;
        if (!navEntry) continue;

        targets.push(buildTarget(slug, navEntry.href));
    }

    return targets;
}

async function login(page) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email', { state: 'visible', timeout: 30000 });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([
        page.waitForURL(/\/dashboard(\b|\/|$)/, { timeout: 30000 }),
        page.click('button[type="submit"]'),
    ]);
    if (!/\/dashboard/.test(page.url())) {
        throw new Error(`Login did not reach /dashboard (landed on ${page.url()})`);
    }
}

async function capture(slugFilter) {
    const { chromium } = await import('playwright');

    let targets = resolveTargets(PLUGINS_DIR);

    // Append explicitly-listed external plugins — extracted marketplace plugins
    // that live outside the core plugins/ tree (e.g. vb-gratitude). Comma- or
    // colon-separated absolute dirs, each containing a manifest.json. These
    // bypass the enabledByDefault:false filter (naming one IS the opt-in) and are
    // normalized so their folder/index key match the app-side resolver.
    const externalDirs = (process.env.VB_EXTERNAL_PLUGINS ?? '')
        .split(/[,:]/)
        .map((s) => s.trim())
        .filter(Boolean);
    for (const dir of externalDirs) {
        targets.push(externalTarget(dir));
    }

    if (slugFilter) {
        // Match on the raw filter or its normalized form, so both `vb-gratitude`
        // and `gratitude` select the external target keyed as `gratitude`.
        const wanted = normalizeSlug(slugFilter);
        targets = targets.filter((t) => t.slug === slugFilter || t.slug === wanted);
        if (targets.length === 0) throw new Error(`No shipping plugin matched slug "${slugFilter}"`);
    }

    const browser = await chromium.launch({ headless: true });
    // Dark mode: the app applies <html class="dark"> from localStorage['theme']
    // in an inline bootstrap before paint. Seed it before any page script runs,
    // and set colorScheme as a belt-and-suspenders for the no-theme path.
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: 'dark',
    });
    await context.addInitScript(() => {
        try {
            localStorage.setItem('theme', 'dark');
        } catch {
            /* ignore */
        }
    });
    const page = await context.newPage();

    const skipped = [];
    const index = {};
    try {
        await login(page);
        console.log(`Logged in as ${EMAIL}; capturing ${targets.length} plugin(s) in dark mode.`);

        for (const t of targets) {
            const resp = await page.goto(t.appUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(1200); // settle async widgets/charts

            const status = resp ? resp.status() : 0;
            const lostSession = /\/login(\b|\/|$)/.test(page.url());
            if (lostSession || !page.url().includes(t.href) || status >= 400) {
                const reason = lostSession
                    ? `redirected to /login (session lost)`
                    : status >= 400
                      ? `HTTP ${status}`
                      : `landed on ${page.url()}`;
                skipped.push({ slug: t.slug, reason, hard: lostSession });
                console.warn(`  ! ${t.slug}: ${reason} — skipped`);
                continue;
            }

            mkdirSync(dirname(t.outFile), { recursive: true });
            await page.screenshot({ path: t.outFile, fullPage: false });
            index[t.slug] = [t.url];
            console.log(`  ✓ ${t.slug} -> screenshots/${t.slug}/01-${t.page}.png`);
        }
    } finally {
        await browser.close();
    }

    // Merge into the existing index (so a per-slug run does not drop others).
    const indexPath = join(OUT_DIR, 'index.json');
    let existing = {};
    try {
        existing = JSON.parse(readFileSync(indexPath, 'utf8'));
    } catch {
        /* first run */
    }
    const merged = { ...existing, ...index };
    const ordered = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(indexPath, JSON.stringify(ordered, null, 2) + '\n');
    console.log(`\nindex.json: ${Object.keys(ordered).length} plugin(s) mapped.`);

    if (skipped.length > 0) {
        console.error(
            `${skipped.length} plugin(s) skipped: ` +
                skipped.map((b) => `${b.slug} (${b.reason})`).join(', ')
        );
        if (skipped.some((b) => b.hard)) process.exitCode = 1;
    }
}

// Run capture only when executed directly, never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    capture(process.argv[2]).catch((err) => {
        console.error(err.message ?? err);
        process.exit(1);
    });
}
