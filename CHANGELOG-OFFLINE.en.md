# FieLanzen Offline · Change log

[Deutsch](CHANGELOG-OFFLINE.md) | **English**

## 0.1.0-alpha.37 (2026-11-26) – Native Dashboard account reconciliation (main)
- Use the existing local-style balance reconciliation form inside Android server mode; remove the link to the web Dashboard. Local SQLite finances and the offline reconciliation routine remain unchanged.
- Require `account_reconciliation: true` together with an authorized write-enabled web-finance session; only eligible active accounts can be selected.
- Signed current and actual balances support 0–3 decimal places. The client previews the delta; the server alone calculates and persists the adjustment.
- Persist the exact request and UUID securely before POST; on unclear replies allow only an explicit identical UUID replay. HTTP 409 refreshes the authoritative balance and requires fresh confirmation.
- Refresh server account, booking and active monthly reports after success. No changes to backup formats, financial schemas or server-write semantics; Alpha 32–37 merged to `main` with the signed-prerelease workflow. Obsolete milestone docs removed from the working tree; history remains accessible in Git. Physical-device testing is still pending.

## 0.1.0-alpha.36 (2026-11-26) – Fix history charts in Android WebView (developer)
- Replace invisible CSS `conic-gradient` category charts with native SVG donut arcs; the app CSP blocks inline `style` attributes.
- Monthly income/expense bars now use proportional SVG rectangles without forbidden inline width styles.
- Improve category legend color swatches, alignment and mobile spacing while retaining all category rows.
- Preserve the strict CSP (no `unsafe-inline`), offline operation, data isolation, backups and Mobile API semantics. On-device visual verification still pending.

## 0.1.0-alpha.35 (2026-11-26) – Historical analysis replaces monthly tab (developer)
- Rename **Monat** to **Historie** and introduce the same historical layout in local and server modes: period KPIs, monthly income/expense bars, and expense/income category donut charts.
- Filter by 2–36 months, account, category and currency. Local figures come exclusively from on-device SQLite.
- Server history and homepage comparisons use authenticated, fully aggregated `/api/mobile/v1/reports/monthly` when `features.monthly_reports: true` is advertised; never mistake partial bookings for full reports.
- The highest individual income/expense highlights in server mode require a backwards-compatible optional `highlights` API extension. Until then, the UI explicitly marks them unavailable; the local mode derives them from the complete local ledger.
- No changes to database schemas, backup formats or server write APIs. Developer debug build only, pending on-device verification.

## 0.1.0-alpha.34 (2026-11-26) – Month comparison, account display and honest partial-trend handling (developer)
- Both home screens share month A/B selection with currency, account and category filters plus comparable income/expense bars.
- Server account list prioritizes active accounts with balances, identifies inactive accounts, and links to Dashboard reconciliation without creating unauthorized or inconsistent API writes.
- Server 12-month trend avoids fabricated zero months and full bars for missing history; partially loaded figures are labelled as provisional and historical API pages can be loaded on explicit request.
- Currency filtering prevents mixing monetary units in server reports. No change to finance databases, API mutations, backups or Dashboard deployment.
- An authenticated server-side monthly summary API is still needed for instant full-history reports; physical-device validation is pending.

## 0.1.0-alpha.33 (2026-11-26) – Keyboard-aware payee and category selection (developer)
- Shared compact, searchable suggestions for **local and server bookings and recurring-rule editors**.
- As in the Dashboard mobile website, lists position themselves above or below each input using the visible viewport with the Android software keyboard. Roughly four rows remain visible at once; additional matches can scroll.
- Suggestions prioritize frequently used names, then prefix matches when typing; existing selections can be replaced easily.
- New payee names remain free text. Categories continue to require explicit selection; local category creation remains available. Local and server financial data are kept separate.
- No changes to Dashboard, API write semantics, finance storage or backups. Debug-test developer build only; on-device verification remains pending.

## 0.1.0-alpha.32 (2026-11-26) – Unified UI and server recurring-rule preparation (developer)
- **Unified interface:** Local and server bookings share cards, colors, status tags, spacing, collapsible details and action sizes.
- **Server overview:** Matches the local section order for accounts, monthly summaries, booking search, filtering and sorting. Reports based on fetched API pages are marked as potentially incomplete.
- **Server recurring rules:** Android UI is prepared to view, create, edit, pause, select Manual/Automatic modes, confirm due postings, and archive rules. Local rules remain separate.
- **API dependency:** These controls stay disabled until the Dashboard exposes the full Mobile API with `features.recurring_rules: true`. The backend contract describes authorization, admin approval, `If-Match` and idempotency; these endpoints are not supplied by this Android change.
- **Safety and compatibility:** Existing permissions, pending-write protections and separate data sources remain intact. No local finance-data migration or changes to backup formats or the Dashboard.
- **Release status:** Developer branch only, debug test APK; no signed release on `main`. Real-device verification is still pending.

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
