# FieLanzen Offline · Android

**English** | [Deutsch](README.de.md)

<p align="center">
  <img src="public/sea-wolves-logo.webp" alt="FieLanzen wolf logo" width="155">
</p>

<p align="center"><strong>A standalone Android personal-finance app — local first, optional dashboard connection.</strong></p>

**Current source version:** `0.1.0-alpha.28` · **Development status:** alpha · **Android package ID:** `de.fielanzen.offline`

FieLanzen Offline is a separate Android application built with **TypeScript, Capacitor and SQLite**. Accounts, payees, categories, bookings, transfers, recurring rules and reports can be managed on the phone without a server. A separately enabled server mode connects to the [FieLanzen/Financisto Dashboard](https://github.com/renfie/financisto-dashboard) through its Mobile API. The two data sources are **not silently merged or synchronized**.

## Preview

> **Illustrative UI mockups with fictional finance data, not real screenshots or user account data.** Actual layouts may differ in alpha builds.

| Overview | Bookings | New booking |
| :---: | :---: | :---: |
| <img src="assets/demo/overview.svg" alt="Illustrative Android overview with demo balances" width="255"> | <img src="assets/demo/bookings.svg" alt="Illustrative searchable booking list with transaction tags" width="255"> | <img src="assets/demo/new-booking.svg" alt="Illustrative new booking form" width="255"> |

## Features

- **Offline-first** accounts, bookings, payees, categories, transfers and recurring transactions.
- **Financisto compatibility:** inspect/import `.backup` files; export bookings and locally available scheduled rules without an extra export toggle.
- **Data recovery:** full application JSON backup/restore, plus on-device backup options. JSON is the lossless format for FieLanzen-specific data.
- **Optional server mode:** explicitly confirm the connection before switching; return to local storage without copying server entries into it.
- **Lists and reports:** search, sorting, 30/50/100 default items and load-more controls. Server searches operate on loaded API pages until more are fetched.
- **Android protection:** optional device biometrics/credential lock, Android Keystore for server credentials and native safe-area handling.

## Build a debug APK on Debian/Ubuntu

Use Node.js 22+, Java 21 and an Android SDK, or let the VM script install missing build tools. From the repository root:

```bash
bash scripts/build-android-vm.sh
```

Expected output: `release/FieLanzen-Offline-0.1.0-alpha.28-debug.apk` (after a successful build). The script does not publish anything to GitHub or update the dashboard.

**Important:** Make an external JSON backup before updating an installed app. Android updates require the **same signing key** and package ID. Do not uninstall the app or clear its data to work around a signature mismatch. See [German VM instructions](ANLEITUNG-ANDROID-DEBIAN.txt) and [installation guide](docs/INSTALLATION.en.md).

## Development and verification

```bash
npm install
npm run build
npx tsc -p tsconfig.preview.json
node --test tests/alpha26-full-backup.test.mjs tests/alpha27-display-lock.test.mjs tests/alpha28-home-search-safearea.test.mjs
```

The focused source checks do not replace a complete Android APK build and a real-device test. Historical regression tests include outdated expectations; their failures must be reviewed separately.

## Separate projects, separate versions

| Android application (this repository) | [Dashboard](https://github.com/renfie/financisto-dashboard) |
| --- | --- |
| Capacitor, SQLite, local backups, Android UI & Mobile API client | Docker web app, server APIs, database and deployment scripts |
| Android versions `0.1.0-alpha.*` | Dashboard versions `1.9.*` |
| Android code changes live **here** | Server changes live **there** |

## Documentation

- [German README / Deutsche Projektübersicht](README.de.md)
- [English development notes](docs/DEVELOPMENT.en.md) · [Deutsch](docs/ENTWICKLUNG.md)
- [English security and privacy](docs/SECURITY.en.md) · [Deutsch](docs/SICHERHEIT.md)
- [Version history (EN)](CHANGELOG-OFFLINE.en.md) · [Version history (DE)](CHANGELOG-OFFLINE.md)
- [Mobile API integration notes (German)](docs/DASHBOARD-MOBILE-API.md)

## Privacy, license and attribution

Never commit real financial exports, databases, `.env` secrets, API keys, client certificates, signing keys or personally identifiable screenshots. Financisto and JSON exports are **not necessarily encrypted** even when the app-lock option is enabled. Sample URLs use `example.org`.

Own project components are licensed under [GPL-2.0-only](LICENSE). See [NOTICE.md](NOTICE.md) for attribution. This is **not** an official Financisto release, fork or continuation. Source publication does not imply a Play Store-ready or fully tested APK.
