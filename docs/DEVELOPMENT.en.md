# Development workflow

**English** | [Deutsch](ENTWICKLUNG.md)

- This repository contains **only** the Android app. Server/API changes belong to [financisto-dashboard](https://github.com/renfie/financisto-dashboard).
- `main` contains the latest deliberately adopted Android source snapshot. Use short-lived feature branches and review changes before merging.
- Android versions follow `0.1.0-alpha.*`; dashboard versions are independent.
- Do not change package ID `de.fielanzen.offline`, Android signing identity or persistent SQLite schema without a backward-compatibility plan.
- Never silently omit recurring rules from an exported backup. Test both manual and automatic backup paths.
- Run source build, current regression tests, then a native APK build and real-device tests before advertising a tested release.
- The server search only searches loaded Mobile API pages and can fetch more; it is not a global remote search.
- Historical alpha tests contain outdated version assumptions; report the actual passing/failing status instead of saying all checks passed.
