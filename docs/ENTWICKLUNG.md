[English](DEVELOPMENT.en.md) | **Deutsch**

# Entwicklungsablauf

## Repository und Branches

- Repository: `renfie/fielanzen-android-offline`
- `main`: zuletzt ausdrücklich übernommener Android-Projektstand; die aktuelle Versionsnummer steht in `package.json` .
- `developer`: fortlaufender Entwicklungszweig für neue Funktionen und Debug-Test-APKs ; die Freigabe auf `main` ist ein eigener Schritt.
- Bei größeren Änderungen einen kurzlebigen Feature-Branch und einen Pull Request verwenden.
- `renfie/financisto-dashboard` wird separat gepflegt. Keine Dashboard-Serverdateien in diesem Repository.

## Releases

- Reguläre Android-Versionen folgen SemVer, derzeit `0.2.0`; passende Git-Tags heißen `v0.2.0`, `v0.2.1` usw. Die früheren `0.1.0-alpha.N`-Versionen bleiben historisch erhalten. Ein Dokumentationscommit ohne Versionswechsel erzeugt keinen neuen signierten Release.
- `developer` baut Debug-Test-APKs; ein Versionsanstieg auf `main` fordert automatisch einen **regulären signierten Release** samt Änderungsnotizen an. Vor der Übernahme nach `main` den nativen Build und möglichst den Gerätetest durchführen.
- In diesem Repository wird der **Quellcode** versioniert. `android/`, `node_modules/`, Debug-/Release-APKs, lokale Schlüssel, Finanzdaten und generierte SDK-Dateien werden nicht eingecheckt.

## Anforderungen an Änderungen

1. Auf dem letzten freigegebenen Android-Projektstand aufbauen.
2. App-ID `de.fielanzen.offline`, Datenbankschema, Restore- und Exportpfade auf Rückwärtskompatibilität prüfen.
3. Vor Änderungen der API die Serverfelder mit dem Dashboard-Projekt abstimmen.
4. Manuelle und automatische Sicherungen prüfen: wiederkehrende Regeln dürfen niemals stillschweigend fehlen.
5. `npm run build`, Vorschau-Tests und anschließend APK-Build/Android-Gerätetest.
6. Changelog und README für die tatsächlich implementierte Version aktualisieren.

## Fachliche Leitlinien

- Lokale SQLite-Buchungen und serverseitige Finanzdaten bleiben strikt getrennt; die Datenquelle darf nicht heimlich wechseln oder Daten synchronisieren.
- Einnahmen, Ausgaben, Salden und prognostizierte künftige Buchungen nicht vermischen; Umbuchungen und Saldoabgleiche gehören nicht ungeprüft in reguläre Finanzstatistiken.
- Dieselbe mobile Oberfläche verwenden, soweit Daten und Server-Rechte es ermöglichen. Bei fehlender Capability Funktionen deaktivieren, niemals lokale Einträge als Serverdaten ausgeben.
- Server-Schreiboperationen mit unveränderlicher UUID sicher aufbewahren. Bei Netzwerkabbruch keinen neuen Schreibauftrag blind senden; bei Konflikten neu lesen und bewusste Bestätigung verlangen.
- Aktuelle API-Verträge liegen im [Finanzdashboard](https://github.com/renfie/financisto-dashboard/tree/develop/package/docs), nicht in historischen Android-Übergabedateien.

## Bekannte Grenzen

- Die Server-Suche lädt nur ausdrücklich angeforderte Seiten der Mobile-API nach; sie ist noch keine globale serverseitige Suche.
- Die volle Sammlung historischer Alpha-Tests enthält veraltete Versionsannahmen; gezielte aktuelle Tests dürfen nicht als vollständige Freigabe ausgegeben werden.
- Biometrie und Systemleisten-Verhalten benötigen eine Prüfung auf einem echten Android-Gerät.
