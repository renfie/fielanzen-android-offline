[English](DEVELOPMENT.en.md) | **Deutsch**

# Entwicklungsablauf

## Repository und Branches

- Repository: `renfie/fielanzen-android-offline`
- `main`: zuletzt freigegebener Android-Projektstand, derzeit Alpha 28.
- Bei größeren Änderungen einen kurzlebigen Feature-Branch und einen Pull Request verwenden.
- `renfie/financisto-dashboard` wird separat gepflegt. Keine Dashboard-Serverdateien in diesem Repository.

## Releases

- Android-Versionen erhalten Kennungen wie `android-v0.1.0-alpha.28` und ihr eigenes Changelog.
- Downloadbare APKs erst veröffentlichen, nachdem ein tatsächlicher Android-Build und Gerätetest erfolgreich waren.
- In diesem Repository wird der **Quellcode** versioniert. `android/`, `node_modules/`, Debug-/Release-APKs, lokale Schlüssel, Finanzdaten und generierte SDK-Dateien werden nicht eingecheckt.

## Anforderungen an Änderungen

1. Auf dem letzten freigegebenen Android-Projektstand aufbauen.
2. App-ID `de.fielanzen.offline`, Datenbankschema, Restore- und Exportpfade auf Rückwärtskompatibilität prüfen.
3. Vor Änderungen der API die Serverfelder mit dem Dashboard-Projekt abstimmen.
4. Manuelle und automatische Sicherungen prüfen: wiederkehrende Regeln dürfen niemals stillschweigend fehlen.
5. `npm run build`, Vorschau-Tests und anschließend APK-Build/Android-Gerätetest.
6. Changelog und README für die tatsächlich implementierte Version aktualisieren.

## Bekannte Grenzen

- Die Server-Suche lädt nur ausdrücklich angeforderte Seiten der Mobile-API nach; sie ist noch keine globale serverseitige Suche.
- Die volle Sammlung historischer Alpha-Tests enthält veraltete Versionsannahmen; gezielte aktuelle Tests dürfen nicht als vollständige Freigabe ausgegeben werden.
- Biometrie und Systemleisten-Verhalten benötigen eine Prüfung auf einem echten Android-Gerät.
