<?php
// marketplace-repository/tools/validate.php — review-CI validator for marketplace submissions.
// Dependency-free (ext-sodium only via tools/verify.php). No composer / no JSON-Schema library:
// the schema checks below are hand-rolled to mirror schema/manifest.schema.json (the published
// contract). Enforces §3.2 admission + schema + slug/index consistency + digest/signature match.
//
// Usage:
//   php validate.php <dir> [--artifact-dir <dir>]
//     <dir> is either a single plugin dir containing manifest.json (fixture mode),
//     or a parent dir (e.g. plugins) holding <slug>/manifest.json subdirs (catalog mode).
//   --artifact-dir <dir>: where the artifact ZIP(s) live locally (basename of artifact.url).
//                         When given, digest + signature are cryptographically verified.
// Prints "PASS <slug>" / "FAIL <slug>: <reason>"; exits 1 if any FAIL, else 0.

$root = dirname(__DIR__);

// --- parse args -------------------------------------------------------------
$target = null;
$artifactDir = null;
for ($i = 1; $i < $argc; $i++) {
    if ($argv[$i] === '--artifact-dir') {
        $artifactDir = $argv[++$i] ?? null;
    } elseif ($target === null) {
        $target = $argv[$i];
    }
}
if ($target === null) {
    fwrite(STDERR, "usage: validate.php <dir> [--artifact-dir <dir>]\n");
    exit(2);
}
if (!is_dir($target)) {
    fwrite(STDERR, "not a directory: $target\n");
    exit(2);
}

// --- load trust anchors -----------------------------------------------------
$keyring = json_decode((string) file_get_contents("$root/trusted-keys.json"), true);
$keysById = [];
foreach (($keyring['keys'] ?? []) as $k) {
    if (isset($k['keyId'])) {
        $keysById[$k['keyId']] = $k;
    }
}
$revoked = array_flip($keyring['revocations'] ?? []);

// --- load index -------------------------------------------------------------
$index = json_decode((string) file_get_contents("$root/index.json"), true);
$indexCounts = [];
foreach (($index['plugins'] ?? []) as $p) {
    if (isset($p['slug'])) {
        $indexCounts[$p['slug']] = ($indexCounts[$p['slug']] ?? 0) + 1;
    }
}

$pluginsRoot = realpath("$root/plugins");

// --- collect plugin dirs ----------------------------------------------------
$dirs = [];
if (is_file("$target/manifest.json")) {
    $dirs[] = rtrim($target, '/');
} else {
    foreach (glob("$target/*/manifest.json") as $mf) {
        $dirs[] = dirname($mf);
    }
}
if (!$dirs) {
    // Empty catalog (e.g. plugins/ before the first submission) is not an error.
    echo "no manifests to validate under $target\n";
    exit(0);
}

$anyFail = false;

foreach ($dirs as $dir) {
    $slug = basename($dir);
    $errors = [];

    $raw = file_get_contents("$dir/manifest.json");
    $m = $raw === false ? null : json_decode($raw, true);
    if (!is_array($m)) {
        report($slug, ['manifest.json missing or not valid JSON']);
        $anyFail = true;
        continue;
    }

    // (1) schema: required top-level keys
    foreach (['slug', 'name', 'version', 'uiMode', 'engines', 'artifact'] as $req) {
        if (!array_key_exists($req, $m)) {
            $errors[] = "missing required key '$req'";
        }
    }

    // slug: pattern + matches directory
    if (isset($m['slug'])) {
        if (!is_string($m['slug']) || !preg_match('/^[a-z0-9-]+$/', $m['slug'])) {
            $errors[] = "slug '{$m['slug']}' fails pattern ^[a-z0-9-]+\$";
        } elseif ($m['slug'] !== $slug) {
            $errors[] = "slug '{$m['slug']}' does not match directory '$slug'";
        }
    }

    // version: semver-ish
    if (isset($m['version']) && (!is_string($m['version'])
        || !preg_match('/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/', $m['version']))) {
        $errors[] = "version '" . ($m['version'] ?? '') . "' is not valid semver";
    }

    // uiMode
    if (isset($m['uiMode']) && !in_array($m['uiMode'], ['declarative', 'native', 'hybrid'], true)) {
        $errors[] = "uiMode '{$m['uiMode']}' not one of declarative|native|hybrid";
    }

    // engines.vctrbase
    if (isset($m['engines']) && (!is_array($m['engines']) || !isset($m['engines']['vctrbase']) || !is_string($m['engines']['vctrbase']))) {
        $errors[] = "engines.vctrbase missing or not a string";
    }

    // artifact.url + digest
    $artifact = $m['artifact'] ?? null;
    if (!is_array($artifact)) {
        $errors[] = "artifact object missing";
    } else {
        if (!isset($artifact['url']) || !is_string($artifact['url']) || $artifact['url'] === '') {
            $errors[] = "artifact.url missing";
        }
        if (!isset($artifact['digest']) || !preg_match('/^[a-f0-9]{64}$/', (string) ($artifact['digest'] ?? ''))) {
            $errors[] = "artifact.digest missing or not a sha256 hex";
        }
    }

    // (2) index consistency
    $count = $indexCounts[$slug] ?? 0;
    $inCatalogTree = $pluginsRoot !== false && realpath(dirname($dir)) === $pluginsRoot;
    if ($inCatalogTree && $count !== 1) {
        $errors[] = "slug must appear exactly once in index.json (found $count)";
    } elseif ($count > 1) {
        $errors[] = "slug appears $count times in index.json (must be at most once)";
    }

    // (3) §3.2 admission: provider ⇒ signed + trusted key + verifies
    $hasProvider = array_key_exists('provider', $m) && $m['provider'] !== null && $m['provider'] !== '';
    if ($hasProvider) {
        $sig = $artifact['signature'] ?? null;
        $keyId = $artifact['keyId'] ?? null;
        if (!is_string($sig) || $sig === '') {
            $errors[] = "provider set but artifact.signature missing";
        }
        if (!is_string($keyId) || $keyId === '') {
            $errors[] = "provider set but artifact.keyId missing";
        } elseif (!isset($keysById[$keyId])) {
            $errors[] = "keyId '$keyId' not found in trusted-keys.json";
        } elseif (isset($revoked[$keyId])) {
            $errors[] = "keyId '$keyId' is revoked";
        }

        // cryptographic verification when the artifact is locally available
        if (!$errors && is_string($sig) && is_string($keyId) && isset($keysById[$keyId])) {
            $zip = locate_artifact($artifactDir, $artifact['url'] ?? '');
            if ($zip !== null) {
                $bytes = (string) file_get_contents($zip);
                $digest = hash('sha256', $bytes);
                if (isset($artifact['digest']) && !hash_equals((string) $artifact['digest'], $digest)) {
                    $errors[] = "artifact digest mismatch (manifest={$artifact['digest']} actual=$digest)";
                }
                $pub = $keysById[$keyId]['publicKey'] ?? '';
                $rc = run_verify("$root/tools/verify.php", $zip, $sig, $pub);
                if ($rc !== 0) {
                    $errors[] = "signature does not verify against keyId '$keyId'";
                }
            } elseif ($artifactDir !== null) {
                $errors[] = "artifact ZIP not found in --artifact-dir";
            }
        }
    } else {
        // declarative: no signature required. Verify digest if artifact is present locally.
        if (!$errors && is_array($artifact) && isset($artifact['digest'])) {
            $zip = locate_artifact($artifactDir, $artifact['url'] ?? '');
            if ($zip !== null) {
                $digest = hash('sha256', (string) file_get_contents($zip));
                if (!hash_equals((string) $artifact['digest'], $digest)) {
                    $errors[] = "artifact digest mismatch (manifest={$artifact['digest']} actual=$digest)";
                }
            }
        }
    }

    if ($errors) {
        $anyFail = true;
    }
    report($slug, $errors);
}

exit($anyFail ? 1 : 0);

// --- helpers ----------------------------------------------------------------
function report(string $slug, array $errors): void
{
    if (!$errors) {
        echo "PASS $slug\n";
    } else {
        echo "FAIL $slug: " . implode('; ', $errors) . "\n";
    }
}

function locate_artifact(?string $artifactDir, string $url): ?string
{
    if ($artifactDir === null) {
        return null;
    }
    $base = $url !== '' ? basename(parse_url($url, PHP_URL_PATH) ?: $url) : '';
    foreach ([$base, 'artifact.zip'] as $name) {
        if ($name !== '' && is_file("$artifactDir/$name")) {
            return "$artifactDir/$name";
        }
    }
    return null;
}

function run_verify(string $verifyPhp, string $zip, string $sigB64, string $pubB64): int
{
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($verifyPhp) . ' '
        . escapeshellarg($zip) . ' ' . escapeshellarg($sigB64) . ' ' . escapeshellarg($pubB64);
    $out = [];
    $rc = 0;
    exec($cmd . ' 2>/dev/null', $out, $rc);
    return $rc;
}
