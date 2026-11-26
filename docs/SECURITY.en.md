# Security and privacy

**English** | [Deutsch](SICHERHEIT.md)

- Never commit `.backup` archives, financial JSON exports, bank statements, databases, real financial screenshots, `.env` files, passwords, API tokens, TLS certificates, private keys or Android signing keys.
- Before each push, review `git status` and `git diff --cached --stat` and run `python3 scripts/check-publication.py`; the path scanner is not a replacement for reviewing source contents and history.
- Keep all actual production finance data outside GitHub. The app-lock screen is not a backup encryption feature; exported JSON and Financisto files need separate protection.
- API keys belong in Android Keystore; never log them. Never put client certificate private keys in JavaScript.
- Publish signed APKs only with protected credentials and a deliberate release workflow after native device testing.
- If the repository is public, its source and all committed files are publicly visible. Do not rely only on `.gitignore`: check source contents and commit history too.

- Secure Android server reconciliation or recurring writes by persisting the exact request and idempotency UUID before transmission; never generate a new key to silently retry an uncertain outcome.
