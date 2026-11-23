# Building and installing the Android app

**English** | [Deutsch](INSTALLATION.de.md)

## Requirements
Debian or Ubuntu x86_64, sufficient disk space and Internet access for SDK dependencies. The helper installs missing packages when permitted. Node.js 22+, Java 21 and Android SDK are required.

```bash
bash scripts/build-android-vm.sh
```

If successful, the file is `release/FieLanzen-Offline-0.1.0-alpha.29-debug.apk`. You can install it using Android's package installer or `adb install -r path/to.apk` if signing keys match.

**Before updating:** Save a complete app JSON backup to a safe external location. Never uninstall or erase app data to fix a signature problem. APK updates must retain the package ID `de.fielanzen.offline` and the signing identity used for the currently installed build. Do not use a random new debug signing key on a different machine to overwrite an existing installation.

This is an alpha debug build. A passing source test is not a guarantee of correct native Android behavior.
