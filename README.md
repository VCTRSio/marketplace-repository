# VCTRbase Marketplace Repository

The public, GitHub-backed **plugin registry** for [VCTRbase](https://vctrs.io). It is a
static, dependency-free data repo: a running VCTRbase app fetches these JSON files over HTTPS
to render its marketplace and to admit plugins for installation.

This repo holds **metadata and trust anchors only** — it does not host plugin code artifacts.
Each catalog entry points at an artifact ZIP hosted elsewhere (e.g. a GitHub Release asset),
identified by a sha256 `digest` and, for trusted publishers, a detached Ed25519 `signature`.

## What's here

| Path | Purpose |
| --- | --- |
| `index.json` | The catalog: `{ version, plugins: [{ slug, featured, order }] }` — ordering + featuring for the app's browse view. |
| `plugins/<slug>/manifest.json` | One manifest per plugin (display metadata + `artifact` pointer). Validated against `schema/manifest.schema.json`. |
| `trusted-keys.json` | The trusted-publisher **keyring**: `{ version, keys: [{ publisher, keyId, algo, publicKey, url, addedAt }], revocations: [] }`. Consumed by the app's `Keyring`. |
| `schema/manifest.schema.json` | JSON Schema (draft 2020-12) — the published manifest contract. |
| `tools/sign.php` | Standalone Ed25519 detached signer (`ext-sodium`, no deps). |
| `tools/verify.php` | Standalone Ed25519 detached verifier. |
| `tools/validate.php` | Review-CI validator: schema + slug/index consistency + §3.2 signature admission. |
| `tests/` | Self-test fixtures (`declarative-ok`, `signed-ok`, `unsigned-provider`) + `run-validate.sh`. |
| `.github/workflows/review.yml` | PR CI that runs the validator on every submission. |

## Trust model (the §3.2 admission rule)

- A manifest **without** a `provider` field is **declarative-only**: the app installs it
  without requiring a signature (unsigned archives are accepted). Lowest privilege.
- A manifest **with** a `provider` field claims trusted-publisher status and MUST carry
  `artifact.signature` + `artifact.keyId`. The `keyId` must exist in `trusted-keys.json`,
  must **not** appear in `revocations`, and the signature must verify against that key's
  `publicKey` over the artifact ZIP bytes. Otherwise the submission is rejected.

## Signing format (load-bearing)

Detached Ed25519 over the **raw ZIP bytes**:
`base64_encode(sodium_crypto_sign_detached($bytes, $priv))`. Digest is `hash('sha256', $bytes)`
hex. Keys are **base64-encoded raw** bytes (not DER/PEM). This is byte-identical to the app's
`app/Plugins/ArtifactSigning.php`; `tools/sign.php` and `tools/verify.php` must stay in lockstep
with it.

## Sign an artifact

```bash
php tools/sign.php my-plugin.zip /path/to/your.privkey.b64   # writes my-plugin.zip.sig, prints sha256
php tools/verify.php my-plugin.zip my-plugin.zip.sig your.pubkey.b64 && echo OK
```

See [CONTRIBUTING.md](CONTRIBUTING.md) to publish a plugin or onboard a publisher key.
