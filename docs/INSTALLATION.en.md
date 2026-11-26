# Building and installing the Android app

**English** | [Deutsch](INSTALLATION.de.md)

## Requirements
Debian or Ubuntu x86_64, sufficient disk space and Internet access for SDK dependencies. The helper installs missing packages when permitted. Node.js 22+, Java 21 and Android SDK are required.

```bash
bash scripts/build-android-vm.sh
```

If successful, the output is `release/FieLanzen-Offline-<version-from-package.json>-debug.apk` (version from the selected branch). You can install it using Android's package installer or `adb install -r path/to.apk` if signing keys match.

**Before updating:** Save a complete app JSON backup to a safe external location. Never uninstall or erase app data to fix a signature problem. APK updates must retain the package ID `de.fielanzen.offline` and the signing identity used for the currently installed build. Do not use a random new debug signing key on a different machine to overwrite an existing installation.

This is a debug-test build, even for the regular **0.2.0** source version. Download the signed regular APK from [GitHub Releases](https://github.com/renfie/fielanzen-android-offline/releases). Source checks do not replace native Android device testing.

The GitHub Actions debug artifact instead contains `FieLanzen-Offline-<version>-debug-UNSTABLE-KEY.apk` in a ZIP file. Signed APKs are generated only through the separate [release workflow](RELEASES.en.md).
