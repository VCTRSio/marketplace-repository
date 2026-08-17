// Pure-logic tests for the screenshot tool. No browser is launched:
// importing plugin-screenshots.mjs never runs capture().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageFromHref, screenshotUrl, resolveTargets, normalizeSlug, externalTarget } from '../plugin-screenshots.mjs';

test('pageFromHref uses the last path segment', () => {
    assert.equal(pageFromHref('/dashboard/gamification'), 'gamification');
    assert.equal(pageFromHref('/dashboard/google-business-profile'), 'google-business-profile');
    assert.equal(pageFromHref('/dashboard/certifications'), 'certifications');
    assert.equal(pageFromHref('/dashboard/vendor/'), 'vendor'); // trailing slash tolerated
});

test('screenshotUrl builds the served raw URL', () => {
    assert.equal(
        screenshotUrl('gamification', 'gamification', 'https://host/screenshots'),
        'https://host/screenshots/gamification/01-gamification.png'
    );
    assert.equal(
        screenshotUrl('oem-cert', 'certifications', 'https://host/screenshots/'),
        'https://host/screenshots/oem-cert/01-certifications.png'
    );
});

test('resolveTargets keeps dashboard navs, skips opt-outs and no-nav plugins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shots-'));
    const mk = (slug, body) => {
        const d = join(dir, slug);
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, 'manifest.json'), JSON.stringify(body, null, 2) + '\n');
    };
    mk('feed', { slug: 'feed', nav: [{ href: '/dashboard/feed' }] }); // no enabledByDefault -> kept
    mk('gamification', { slug: 'gamification', enabledByDefault: true, nav: [{ href: '/dashboard/gamification' }] });
    mk('hello', { slug: 'hello', enabledByDefault: false, nav: [{ href: '/dashboard/hello' }] }); // opted out
    mk('sample-esm', { slug: 'sample-esm', nav: [] }); // no dashboard nav

    const slugs = resolveTargets(dir).map((t) => t.slug).sort();
    assert.deepEqual(slugs, ['feed', 'gamification']);

    const feed = resolveTargets(dir).find((t) => t.slug === 'feed');
    assert.equal(feed.page, 'feed');
    assert.ok(feed.outFile.endsWith('screenshots/feed/01-feed.png'));
    assert.ok(feed.url.endsWith('/screenshots/feed/01-feed.png'));
    assert.ok(feed.appUrl.endsWith('/dashboard/feed'));
});

test('normalizeSlug strips one leading vb- (mirrors app-side ScreenshotRegistry)', () => {
    assert.equal(normalizeSlug('vb-gratitude'), 'gratitude');
    assert.equal(normalizeSlug('vendor-manager'), 'vendor-manager'); // core dir names pass through
    assert.equal(normalizeSlug('gratitude'), 'gratitude'); // already normalized
    assert.equal(normalizeSlug('vb-vb-x'), 'vb-x'); // only ONE prefix stripped
});

test('externalTarget captures an opt-out marketplace plugin under its normalized slug', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shots-ext-'));
    const plugin = join(dir, 'vb-gratitude');
    mkdirSync(plugin, { recursive: true });
    writeFileSync(
        join(plugin, 'manifest.json'),
        JSON.stringify(
            {
                slug: 'vb-gratitude',
                enabledByDefault: false, // extracted marketplace plugins ship opt-in; NOT filtered here
                nav: [{ href: '/dashboard/plugins/vb-gratitude/view' }],
            },
            null,
            2
        ) + '\n'
    );

    const t = externalTarget(plugin);
    assert.equal(t.slug, 'gratitude'); // normalized so the app-side resolver matches
    assert.equal(t.page, 'view'); // last segment of the nav href
    assert.ok(t.outFile.endsWith('screenshots/gratitude/01-view.png'));
    assert.ok(t.url.endsWith('/screenshots/gratitude/01-view.png'));
    assert.ok(t.appUrl.endsWith('/dashboard/plugins/vb-gratitude/view'));
});

test('externalTarget rejects a plugin with no /dashboard/ nav', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shots-bad-'));
    const plugin = join(dir, 'headless');
    mkdirSync(plugin, { recursive: true });
    writeFileSync(join(plugin, 'manifest.json'), JSON.stringify({ slug: 'vb-headless', nav: [] }) + '\n');

    assert.throws(() => externalTarget(plugin), /no \/dashboard\/ nav/);
});
