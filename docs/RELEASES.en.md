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

## Publish a signed release from GitHub Actions – without local Git authentication

The four signing secrets are configured once. **No Personal Access Token or Linux VM is required for subsequent releases.**

1. Open [**Actions → Android APK – build and signed prerelease**](https://github.com/renfie/fielanzen-android-offline/actions/workflows/android-apk.yml).
2. Click **Run workflow**.
3. Select **main** under **Use workflow from**.
4. Enable **Publish signed prerelease for package.json version (main branch only)**.
5. Click **Run workflow**.
6. Monitor the build and signing verification in Actions. On success, GitHub creates the matching version tag and publishes the signed APK with its SHA256 checksum under [Releases](https://github.com/renfie/fielanzen-android-offline/releases).

**Unchecked** means a debug-test APK only. Do **not** separately click GitHub's **Draft a new release** button: the workflow publishes the tag and prerelease itself and prevents duplicate version releases.

For later versions, update the version consistently in `package.json`, app source and tests first. The release builds from `main`, not a local checkout.

Pushing a matching `v0.1.0-alpha.N` tag remains an optional alternative if Git authentication is available.

## Existing installs

The signing identity must match for Android to update in place. APKs previously built with a different debug key **cannot** be updated directly with the new release key. Uninstalling can erase private finance data. Back up and verify recovery **before** attempting any key migration. Do not publish releases signed with an easily shared debug key. These are alpha builds and require device testing.
