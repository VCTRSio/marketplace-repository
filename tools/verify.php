<?php
// marketplace-repository/tools/verify.php — Ed25519 detached verifier.
// BYTE-COMPATIBLE with app/Plugins/ArtifactSigning.php::verifyBytes in vctrbase-php,
// and with its app test-fixture copy tests/fixtures/marketplace-tools/sign.php. Keep in lockstep.
// Usage: php verify.php <zip> <sig-file-or-b64> <pubkey.b64>  -> exit 0 valid / 1 invalid.
if ($argc < 4) { fwrite(STDERR, "usage: verify.php <zip> <sig> <pubkey.b64>\n"); exit(2); }
[$zip, $sigArg, $pubPath] = [$argv[1], $argv[2], $argv[3]];
$bytes = file_get_contents($zip);
if ($bytes === false) { fwrite(STDERR, "cannot read $zip\n"); exit(2); }
$sigB64 = trim(is_file($sigArg) ? (string) file_get_contents($sigArg) : $sigArg);
$pubB64 = trim(is_file($pubPath) ? (string) file_get_contents($pubPath) : $pubPath);
$sig = base64_decode($sigB64, true);
$pub = base64_decode($pubB64, true);
if ($sig === false || $pub === false
    || strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES
    || strlen($pub) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) { fwrite(STDERR, "malformed sig/key\n"); exit(1); }
exit(sodium_crypto_sign_verify_detached($sig, $bytes, $pub) ? 0 : 1);
