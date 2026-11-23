# Signed Android releases (GitHub Actions)

**English** | [Deutsch](RELEASES.de.md)

## Automated build

Each push to `main` builds a debug APK as a GitHub Actions artifact. The CI-generated **debug signing certificate is temporary**, so do not rely on it for updates. A tag matching the current project version, e.g. `v0.1.0-alpha.29`, builds and signs an APK using your own keystore stored in GitHub repository secrets. A release is published only after signing verification succeeds. Every release includes a SHA256 file, and GitHub provides the source-code archive for the tagged commit. This workflow does not alter the separate Docker dashboard.

## One-time signing setup

Generate a long-lived signing key on a trusted machine. **Never commit or share the keystore or passwords.** Back up the key offline, together with recovery instructions and securely stored credentials. Losing it prevents normal updates to apps signed with it.

```bash
mkdir -p "$HOME/.local/share/fielanzen-signing"
chmod 700 "$HOME/.local/share/fielanzen-signing"
keytool -genkeypair -v \
  -keystore "$HOME/.local/share/fielanzen-signing/release.jks" \
  -storetype PKCS12 -alias fielanzen -keyalg RSA -keysize 3072 \
  -validity 10000 -dname 'CN=FieLanzen Offline, O=Private project, C=DE'
chmod 600 "$HOME/.local/share/fielanzen-signing/release.jks"
```

Provide the requested passwords interactively. Under **Repository Settings → Secrets and variables → Actions**, configure:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | One-line Base64 from `base64 -w0 "$HOME/.local/share/fielanzen-signing/release.jks"` (paste directly into GitHub only) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `fielanzen` |
| `ANDROID_KEY_PASSWORD` | Private-key password (often the same as the keystore password for PKCS12) |

To publish the first release after configuring secrets and checking the source, run in a clean checkout:

```bash
git clone https://github.com/renfie/fielanzen-android-offline.git
cd fielanzen-android-offline
git tag -a v0.1.0-alpha.29 -m 'FieLanzen Offline Alpha 29'
git push origin v0.1.0-alpha.29
```

See **Actions** and then **Releases**. For later versions, update `package.json`, `src/main.ts` and use the matching tag. The workflow rejects mismatched tags.

## Existing installs

The signing identity must match for Android to update in place. APKs previously built with a different debug key **cannot** be updated directly with the new release key. Uninstalling can erase private finance data. Back up and verify recovery **before** attempting any key migration. Do not publish releases signed with an easily shared debug key. These are alpha builds and require device testing.
