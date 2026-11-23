# Signed Android releases (GitHub Actions)

**English** | [Deutsch](RELEASES.de.md)

## Automated build

Each push to `main` builds a debug APK as a GitHub Actions artifact. The CI-generated **debug signing certificate is temporary**, so do not rely on it for updates. A version increase on `main` (or a matching tag, or a manually requested signed run) builds and signs an APK using your own keystore stored in GitHub repository secrets. A release is published only after signing verification succeeds. Every release includes a SHA256 file, and GitHub provides the source-code archive for the tagged commit. This workflow does not alter the separate Docker dashboard.

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

## Automatic signed releases on version bumps

Once the four secrets are configured, **no personal access token or Linux VM is needed for routine releases**. Increasing the application version in `package.json` on `main` (for example from Alpha 29 to Alpha 30) automatically triggers the Android signed-release build. After all tests and signature verification succeed, the workflow creates the matching Git tag and publishes the APK and SHA256 checksum under [Releases](https://github.com/renfie/fielanzen-android-offline/releases).

Ordinary source and documentation commits **without** a version increase produce a debug test artifact only, not a new release.

### Optional manual release

1. Open [Actions → Android APK – build and signed prerelease](https://github.com/renfie/fielanzen-android-offline/actions/workflows/android-apk.yml).
2. Select **Run workflow**, choose the **main** branch.
3. Enable **Publish signed prerelease for package.json version** and start the run.
4. Do not publish a separate GitHub "Draft a new release" – the workflow creates the tag and release and refuses duplicate version releases.

For later versions, update `package.json`, app source and version-specific tests consistently. Signed builds always use the existing protected secrets. Pushing a matching Git version tag remains an optional alternative.

## Existing installs

The signing identity must match for Android to update in place. APKs previously built with a different debug key **cannot** be updated directly with the new release key. Uninstalling can erase private finance data. Back up and verify recovery **before** attempting any key migration. Do not publish releases signed with an easily shared debug key. These are alpha builds and require device testing.
