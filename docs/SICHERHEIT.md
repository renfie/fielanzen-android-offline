[English](SECURITY.en.md) | **Deutsch**

# Sicherheitsregeln

- Niemals `.backup`-Dateien, JSON-Sicherungen, Bankauszüge, Datenbanken, persönliche Logs, API-Schlüssel, `.env`-Dateien, Token, TLS-Clientzertifikate oder Keystores einchecken.
- Bei lokalen Commits trotz `.gitignore` `git status` und `git diff --cached --stat` prüfen.
- Keine Android-Signaturschlüssel in GitHub Actions oder Issues veröffentlichen. Spätere Release-Signierung nur über geschützte Secrets und dokumentierten Prozess.
- Für echte GitHub-Veröffentlichungen Beispiel-URLs verwenden und Demo-Daten von echten Finanzdaten trennen.
- JSON- und Financisto-Sicherungen sind nicht automatisch verschlüsselt. Das Aktivieren der Android-App-Sperre verschlüsselt solche exportierten Dateien nicht.
- Bei API-Kommunikation Schlüssel möglichst über den Android Keystore sichern. Keine Schlüssel in Crashlogs oder Fehlermeldungen veröffentlichen.
- Das Repository sollte bis zum erfolgreichen Audit zunächst privat bleiben.
