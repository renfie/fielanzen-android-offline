# Development workflow

**English** | [Deutsch](ENTWICKLUNG.md)

- This repository contains **only** the Android app. Server/API changes belong to [financisto-dashboard](https://github.com/renfie/financisto-dashboard).
- `main` contains the latest deliberately adopted Android source snapshot; `developer` contains evolving debug-test features. Do not merge the latter or bump `main`'s version as a side effect of documentation maintenance.
- Use short-lived feature branches and review changes before merging.
- Regular Android versions follow SemVer (starting with `0.2.0`); historic `0.1.0-alpha.N` versions remain. Dashboard versions are independent. Regular tags use `v0.2.0`, `v0.2.1` etc. A version increase on `main` requests a signed regular release with bilingual notes; documentation-only commits do not.
- Do not change package ID `de.fielanzen.offline`, Android signing identity or persistent SQLite schema without a backward-compatibility plan.
- Never silently omit recurring rules from an exported backup. Test both manual and automatic backup paths.
- Run source build, current regression tests, then a native APK build and real-device tests before advertising a tested release.
- The server search only searches loaded Mobile API pages and can fetch more; it is not a global remote search.
- Historical alpha tests contain outdated version assumptions; report the actual passing/failing status instead of saying all checks passed.

## Data-source and API invariants

Local SQLite and server bookings/rules must remain isolated. Never show partially fetched server bookings as a complete monthly report. Keep current balances separate from projections, and exclude internal adjustment categories and transfers from ordinary income/expense totals according to backend rules. Feature-gate server workflows by capability and authenticated permissions. Preserve a pending write's exact UUID and body across uncertain network outcomes; conflicts require explicit review. Current API documentation is maintained in [the Dashboard repository](https://github.com/renfie/financisto-dashboard/tree/develop/package/docs), not in obsolete Android handoff notes.
