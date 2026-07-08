<?php
// marketplace-repository/tools/sign.php — Ed25519 detached signer.
// BYTE-COMPATIBLE with app/Plugins/ArtifactSigning.php (signBytes/digestBytes)
// in vctrbase-php, and with its app test-fixture copy tests/fixtures/marketplace-tools/sign.php.
// Keep all three identical: detached Ed25519 over raw ZIP bytes, base64 sig; digest = sha256 hex; keys = base64 raw.
// Usage: php sign.php <zip> <privkey.b64>  -> writes <zip>.sig, prints sha256 hex.
if ($argc < 3) { fwrite(STDERR, "usage: sign.php <zip> <privkey.b64>\n"); exit(2); }
[$zip, $keyPath] = [$argv[1], $argv[2]];
$bytes = file_get_contents($zip);
if ($bytes === false) { fwrite(STDERR, "cannot read $zip\n"); exit(2); }
$privB64 = trim(is_file($keyPath) ? (string) file_get_contents($keyPath) : $keyPath);
$priv = base64_decode($privB64, true);
if ($priv === false || strlen($priv) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) { fwrite(STDERR, "bad private key\n"); exit(2); }
$sig = base64_encode(sodium_crypto_sign_detached($bytes, $priv));
file_put_contents($zip . '.sig', $sig);
echo hash('sha256', $bytes) . "\n";
exit(0);
