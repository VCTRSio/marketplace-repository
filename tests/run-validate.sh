#!/usr/bin/env bash
# Self-test for tools/validate.php against the three bundled fixtures.
# Exit 0 only if declarative-ok + signed-ok PASS and unsigned-provider FAILs.
set -eu
cd "$(dirname "$0")/.."

php tools/validate.php tests/fixtures/declarative-ok  --artifact-dir tests/fixtures/declarative-ok  && echo "declarative-ok PASS(expected)"
php tools/validate.php tests/fixtures/signed-ok       --artifact-dir tests/fixtures/signed-ok       && echo "signed-ok PASS(expected)"
if php tools/validate.php tests/fixtures/unsigned-provider --artifact-dir tests/fixtures/unsigned-provider; then
  echo "BUG: unsigned provider passed"; exit 1
else
  echo "unsigned-provider FAIL(expected)"
fi
