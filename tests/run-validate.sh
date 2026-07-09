#!/usr/bin/env bash
# Self-test for tools/validate.php against the four bundled fixtures.
# Exit 0 only if declarative-ok + signed-ok PASS and unsigned-provider +
# declarative-with-keyid FAIL.
set -eu
cd "$(dirname "$0")/.."

php tools/validate.php tests/fixtures/declarative-ok  --artifact-dir tests/fixtures/declarative-ok  && echo "declarative-ok PASS(expected)"
php tools/validate.php tests/fixtures/signed-ok       --artifact-dir tests/fixtures/signed-ok       && echo "signed-ok PASS(expected)"
# A first-party PHP provider plugin omits uiMode (the in-tree convention) — must PASS.
# Use ||-exit so a pass→fail regression actually fails the self-test (set -e exempts the
# left side of &&, so `validate && echo` alone would silently continue on failure).
php tools/validate.php tests/fixtures/provider-no-uimode || { echo "BUG: provider-no-uimode (server-code, no uiMode) failed validation"; exit 1; }
echo "provider-no-uimode PASS(expected)"
if php tools/validate.php tests/fixtures/unsigned-provider --artifact-dir tests/fixtures/unsigned-provider; then
  echo "BUG: unsigned provider passed"; exit 1
else
  echo "unsigned-provider FAIL(expected)"
fi
# §2.3: a declarative manifest (no provider) must NOT carry a trusted keyId/signature —
# otherwise the app would render a false "Verified · by …" badge pre-install.
if php tools/validate.php tests/fixtures/declarative-with-keyid; then
  echo "BUG: declarative manifest with keyId passed"; exit 1
else
  echo "declarative-with-keyid FAIL(expected)"
fi
