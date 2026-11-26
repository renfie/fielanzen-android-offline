# FieLanzen Offline · Change log

[Deutsch](CHANGELOG-OFFLINE.md) | **English**

## Developer branch (after Alpha 31) – Prepared recurring server-rule API
- Local-style rule controls for server mode: create, edit, Paused/Manual/Automatic status, explicitly confirmed due manual posting, soft-delete request.
- Backward-compatible capability gate keeps these controls inactive until the Dashboard advertises the complete recurring API.
- JSON endpoint, permissions, If-Match, idempotency and admin-only automation contract with backend acceptance tests documented.
- Only in `developer`: no Dashboard changes, signed release or local ledger migration.

## Developer branch (after Alpha 31) – Unified local and server UI
- Local and server bookings share one card renderer, spacing, colors, tags, collapsed details, and action-button sizing.
- Server overview and booking screens follow the local section order, account disclosure, month summary, search, and advanced filter controls.
- Server reports retain the local visual layout while clearly marking totals computed from only fetched API pages as potentially incomplete. The current Mobile API does not provide server recurring rules; the app does not substitute local rules.
- Authenticated server permissions, revision-checked writes, pending-operation protection, and separate local/server ledgers remain intact. No dashboard changes or signed release yet; test APK builds on developer.


## 0.1.0-alpha.31 (2026-11-23) – Copyright and SPDX source headers
- Original TypeScript, Java, scripts, workflows and test sources now carry GPL-2.0-only SPDX and `Copyright (C) 2026 René Fieler (RenFie)` notices with syntax appropriate to each file. Generated code and third-party dependencies remain separately attributed.
- The full copyright holder name appears in Settings → GPLv2 and the offline license dialog in local and server modes. The GPLv2 license text remains unchanged.
- English/German READMEs and NOTICE files updated. Package ID, data schema, backups and Financisto export unchanged.
- A signed APK prerelease is requested automatically by the version bump.
- Removed an obsolete assistant-specific instruction from a historical test checklist; the current repository wording is provider-neutral.

The German change log contains the detailed historical alpha notes. The highlights below describe current version milestones rather than claiming all older tests pass.

## 0.1.0-alpha.30 (2026-11-23) – Android safe areas, GPLv2, automated signed releases
- One native Android content-root inset handler now covers status bar, display cutout, bottom navigation and the on-screen keyboard, avoiding duplicate Capacitor/CSS padding on Android 15/16. Browser/PWA continues to use CSS safe-area variables.
- GPLv2 user rights and redistribution obligations appear directly in Settings; the full GPL and attribution notices remain available offline.
- Updating the application version on GitHub `main` automatically initiates a signed prerelease build with SHA256. Ordinary commits still build test-only debug artifacts.
- Android application ID, personal financial storage and complete Financisto export are unchanged; the separate dashboard is untouched.
- Actual Galaxy S26 rendering and migration from an existing debug signature are not yet device-verified.

## 0.1.0-alpha.28
- Overview and booking list share the 30/50/100 default page size and sorting preferences.
- Both views have search and load-more controls; server search is limited to fetched API pages.
- Android status bar / cutout spacing uses native window insets, with CSS safe-area fallback.
- Existing backup and export functionality stays unchanged.

## 0.1.0-alpha.27
- Compact booking cards with expandable details, transaction badges and search-field alignment.
- Native optional app lock with Android biometrics or device credential.
- Shared booking list preferences.

## 0.1.0-alpha.26
- Complete Financisto export always includes locally stored recurring rules; no extra export toggle.
- Manual and automatic export paths use the same underlying rule inclusion policy.

## 0.1.0-alpha.25
- Adjusted scheduled Financisto records to the dashboard-compatible pattern and validated scheduled records in exported archives.

## 0.1.0-alpha.24
- Improved server-side account defaults and searchable payee/category input fields.

## 0.1.0-alpha.23
- Android Keystore IV handling corrected. The user must explicitly activate the server mode after a successful connection preview.

## Earlier alpha versions
- Offline accounts, SQLite persistence, JSON backup, Financisto import/export, recurring rules, reports, native Android bridge and optional Mobile API client.

See the [full German change log](CHANGELOG-OFFLINE.md) for earlier work.

## 0.1.0-alpha.29 (2026-11-23)
- GPLv2 full text and German rights/obligations summary available offline under More in both data modes; includes German and English attribution notices.
- GitHub Actions now builds a debug APK after each `main` push, and creates signed prereleases only from version tags with user-managed signing secrets.
- Android versionCode is derived from project alpha version; source and Financisto backup format remain unchanged.
