# Contributing to the VCTRbase Marketplace

Publishing is a **pull request**. Fork this repo, add your files, open a PR against `main`.
The review CI (`.github/workflows/review.yml`) runs `tools/validate.php` on your submission;
a VCTRSio maintainer reviews and merges. **Merge = published** — the app picks it up on its
next catalog fetch.

## Publish a plugin

1. **Fork** this repository.
2. **Add** `plugins/<slug>/manifest.json` where `<slug>` matches the manifest's `slug`
   (pattern `^[a-z0-9-]+$`). Validate it against `schema/manifest.schema.json`.
   - Required: `slug`, `name`, `version` (semver), `uiMode`, `engines.vctrbase`, and an
     `artifact` object with `url` (the hosted ZIP) and `digest` (its sha256 hex).
   - Host the artifact ZIP yourself (e.g. a GitHub Release asset) at `artifact.url`.
3. **Append** your slug to `index.json` `plugins[]` (`{ slug, featured, order }`). It must
   appear exactly once.
4. **Open a PR.** Fix any CI failures until `tools/validate.php` reports `PASS <slug>`.

### Declarative vs. trusted (signed)

- **Declarative** (no `provider`): no signature needed. Lowest privilege; installed as-is.
- **Trusted** (has `provider`): you must be an onboarded publisher. Add `artifact.signature`
  and `artifact.keyId`, sign the ZIP with your private key:

  ```bash
  php tools/sign.php my-plugin.zip /path/to/your.privkey.b64
  # prints the sha256 -> use it as artifact.digest
  # copy the contents of my-plugin.zip.sig -> artifact.signature
  # your keyId (from trusted-keys.json) -> artifact.keyId
  ```

  CI verifies the signature against your key in `trusted-keys.json` (must be present and not
  revoked). See the §3.2 admission rule in [README.md](README.md).

## Onboard a publisher key

To become a trusted publisher, open a **separate PR** that adds one entry to
`trusted-keys.json` `keys[]`:

```json
{ "publisher": "Your Name", "keyId": "yourname-ed25519-2026", "algo": "ed25519",
  "publicKey": "<base64 raw Ed25519 public key>", "url": "https://your.site", "addedAt": "YYYY-MM-DD" }
```

Generate a keypair with the app's `php artisan plugin:keygen --json` (or any Ed25519 tool
producing base64 raw keys). **Never commit a private key** — `.gitignore` excludes
`*.privkey.b64` and `*.keypair.json`. These PRs get a `publisher-onboarding` label and extra
maintainer scrutiny. To revoke a key, add its `keyId` to `trusted-keys.json` `revocations`.

## Local checks before you PR

```bash
bash tests/run-validate.sh                 # self-test fixtures
php tools/validate.php plugins             # validate all real submissions
```
