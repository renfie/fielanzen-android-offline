# FieLanzen Offline · Change log

[Deutsch](CHANGELOG-OFFLINE.md) | **English**

The German change log contains the detailed historical alpha notes. The highlights below describe current version milestones rather than claiming all older tests pass.

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
