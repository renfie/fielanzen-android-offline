# FieLanzen Offline · Android

[English](README.md) | **Deutsch**

<p align="center">
  <img src="public/sea-wolves-logo.webp" alt="FieLanzen-Wolfslogo" width="155">
</p>

<p align="center"><strong>Eigenständige Android-Finanzverwaltung – zuerst lokal, optional mit Dashboard-Verbindung.</strong></p>

**Copyright © 2026 René Fieler (RenFie)** · Lizenziert unter [GNU GPL v2 ausschließlich](LICENSE).

**Aktueller Quellstand (`developer`):** `0.1.0-alpha.33` · **Entwicklungsstand:** Alpha · **Android-Paketkennung:** `de.fielanzen.offline`

FieLanzen Offline ist eine eigenständige Android-App auf Basis von **TypeScript, Capacitor und SQLite**. Konten, Empfänger, Kategorien, Buchungen, Umbuchungen, Wiederholungsregeln und Auswertungen funktionieren ohne Server. Ein optionaler, ausdrücklich aktivierter Servermodus nutzt die Mobile-API des getrennt entwickelten [FieLanzen/Financisto-Dashboards](https://github.com/renfie/financisto-dashboard). Die Datenquellen werden **nicht automatisch zusammengeführt oder synchronisiert**.

## Einblicke

> **Illustrative Beispielansichten mit erfundenen Finanzdaten, keine echten Bildschirmfotos oder privaten Kontodaten.** Die Darstellung kann sich in Alpha-Versionen unterscheiden.

| Übersicht | Buchungen | Neue Buchung |
| :---: | :---: | :---: |
| <img src="assets/demo/overview.svg" alt="Beispiel einer Android-Übersicht mit fiktiven Kontoständen" width="255"> | <img src="assets/demo/bookings.svg" alt="Beispiel einer durchsuchbaren Buchungsliste" width="255"> | <img src="assets/demo/new-booking.svg" alt="Beispiel der Buchungserfassung" width="255"> |

## Funktionen

- **Eigenständiger Offline-Modus** mit Konten, Buchungen, Empfängern, Kategorien, Umbuchungen und wiederkehrenden Buchungen.
- **Financisto-Kompatibilität:** `.backup`-Dateien prüfen/importieren; Buchungen und lokal vorhandene Terminregeln ohne separaten Exportschalter ausgeben.
- **Datensicherung:** Vollständige FieLanzen-JSON-Sicherung und Wiederherstellung sowie native Sicherungsfunktionen. JSON ist für App-spezifische Daten das verlustfreie Sicherungsformat.
- **Optionaler Servermodus:** Verbindungsprüfung und ausdrückliche Bestätigung, Wechsel zurück auf lokale Daten ohne automatische Übernahme von Serverbuchungen.
- **Übersicht und Listen:** Suche, Sortierung, Standardanzeige 30/50/100 und Nachladen. Im Servermodus zunächst Suche in geladenen API-Seiten.
- **Android-Schutz:** Optionale App-Sperre mit Fingerabdruck/Geräte-PIN, Android Keystore für API-Schlüssel und sichere Abstände zu Systemleisten.

## Debug-APK unter Debian/Ubuntu erstellen

Benötigt werden Node.js 22+, Java 21 und ein Android SDK. Das VM-Skript kann fehlende Werkzeuge einrichten. Im Projektverzeichnis:

```bash
bash scripts/build-android-vm.sh
```

Nach einem erfolgreichen Build liegt die APK unter `release/FieLanzen-Offline-0.1.0-alpha.33-debug.apk`. Das Skript lädt nichts zu GitHub hoch und verändert das Dashboard nicht.

**Vor jedem Update:** Vollständige JSON-Sicherung außerhalb der App erstellen. Zur Aktualisierung müssen **Paketkennung und Signaturschlüssel identisch** sein. Nicht deinstallieren und keine App-Daten löschen, um einen Signaturfehler zu umgehen. Siehe [VM-Anleitung](ANLEITUNG-ANDROID-DEBIAN.txt) und [Installationsanleitung](docs/INSTALLATION.de.md).

## Entwicklung und Tests

```bash
npm install
npm run build
npx tsc -p tsconfig.preview.json
node --test tests/alpha26-full-backup.test.mjs tests/alpha27-display-lock.test.mjs tests/alpha28-home-search-safearea.test.mjs
```

Die gezielten Quellcodeprüfungen ersetzen weder den vollständigen Android-Build noch den Test auf einem echten Gerät. Die historischen Tests enthalten teilweise veraltete Annahmen.

## Zwei Projekte, zwei Versionierungen

| Android-App (dieses Repository) | [Dashboard](https://github.com/renfie/financisto-dashboard) |
| --- | --- |
| Capacitor, SQLite, lokale Sicherung, Android-Oberfläche & Mobile-API-Client | Docker-Webanwendung, Server-API, Datenbank & Updateskripte |
| Android-Versionen `0.1.0-alpha.*` | Dashboard-Versionen `1.9.*` |
| Änderungen an der Android-App **hier** | Änderungen am Server **dort** |

## Dokumentation

- [English README](README.md)
- [Entwicklung](docs/ENTWICKLUNG.md) · [English](docs/DEVELOPMENT.en.md)
- [Sicherheit und Datenschutz](docs/SICHERHEIT.md) · [English](docs/SECURITY.en.md)
- [Änderungsverlauf (DE)](CHANGELOG-OFFLINE.md) · [Change log (EN)](CHANGELOG-OFFLINE.en.md)
- [Hinweise zur Dashboard-Mobile-API](docs/DASHBOARD-MOBILE-API.md)

## Datenschutz, Lizenz und Herkunft

Keine echten Finanzdaten, `.backup`-Dateien, Datenbanken, API-Schlüssel, Client-Zertifikate, Signaturschlüssel, ausgefüllte `.env`-Dateien oder identifizierende Bildschirmfotos veröffentlichen. JSON- und Financisto-Sicherungen sind **nicht automatisch verschlüsselt**, auch wenn die App-Sperre aktiv ist. Beispiel-URLs verwenden `example.org`.

**Copyright (C) 2026 René Fieler (RenFie).** Eigene Projektbestandteile stehen unter [GPL-2.0-only](LICENSE); Copyright- und SPDX-Vermerke in den eigenen Quelldateien sowie der GPL-Lizenztext sind bei Weitergabe zu erhalten. Änderungen und Binärverbreitung unterliegen den entsprechenden GPLv2-Bedingungen. Hinweise zu Dritten in [NOTICE.md](NOTICE.md). Dieses Projekt ist **keine** offizielle Financisto-Version oder -Fortsetzung. Verfügbarer Quellcode bedeutet nicht, dass eine fertige APK vollständig auf Android getestet ist.

## Automatische APKs und signierte GitHub-Releases

Jede Änderung auf `main` **ohne neue Version** erzeugt eine **Debug-Test-APK**. Sobald die Android-Versionsnummer in `package.json` auf `main` steigt (z. B. von Alpha 29 auf Alpha 30), erstellt GitHub Actions **automatisch** die neue signierte APK und ihre SHA256-Prüfsumme und veröffentlicht beides unter [Releases](https://github.com/renfie/fielanzen-android-offline/releases). Das passende Git-Tag wird automatisch erzeugt. **Weder persönlicher GitHub-Token noch Linux-VM oder zusätzlicher Klick** sind beim regulären Versionswechsel erforderlich. Der manuelle Weg „Run workflow → Publish signed prerelease“ bleibt optional und verhindert doppelte Releases. Signaturschlüssel und Passwörter bleiben als GitHub-Secrets und in deiner unabhängigen Sicherung erhalten.

[Release-Anleitung (Deutsch)](docs/RELEASES.de.md) · [English](docs/RELEASES.en.md).

**Sichtbarer Urheberrechtshinweis:** Unter Mehr → GPLv2 steht **Copyright © 2026 René Fieler (RenFie)**, sowohl im lokalen als auch im Servermodus.

**GPLv2 in der App:** Unter **Mehr → GPLv2 · Rechte & Pflichten** stehen die wichtigsten Nutzungs-/Änderungs-/Weitergaberechte und Pflichten bei Weitergabe unmittelbar im Einstellungsbereich, sowohl lokal als auch im Servermodus. Über **Volltext** sind der vollständige englische GPL-Text, der Gewährleistungsausschluss und die Hinweise zu Fremdsoftware auch offline erreichbar.

**Statusleisten-Schutz:** Android verwendet nur noch einen nativen WindowInsets-Mechanismus für Statusleiste, Kameraaussparung, untere Systemnavigation und Tastatur (keine konkurrierenden Capacitor-/CSS-Abstände). In Web/PWA bleibt der CSS-Safe-Area-Fallback. Ein echter Gerätetest steht noch aus.

## Einheitliche Oberfläche für lokale und Serverdaten (developer)

Übersicht und Buchungen verwenden künftig dieselben Karten, Farben, Abstände, Einklapp- und Filterelemente. Der Servermodus bezieht Kontostände und Buchungen weiterhin **ausschließlich** aus der Dashboard-Mobile-API; die lokale SQLite-Datenbank wird weder angezeigt noch mit Serverdaten vermischt. Bei der Server-Suche und den Monatsauswertungen gelten die **bereits geladenen API-Seiten**: Es wird ausdrücklich auf mögliche unvollständige historische Monatswerte hingewiesen. Serverseitige wiederkehrende Regeln sind über die aktuelle Mobile-API nicht abrufbar und werden daher nicht als lokale Regeln ausgegeben. Der separate developer-Branch erstellt Test-APKs, aber keine signierten Releases.

## Wiederkehrende Serverregeln – API-Vorbereitung (developer)

Die Android-Serveransicht ist für die geplante Dashboard-Mobile-API zur Verwaltung wiederkehrender Regeln vorbereitet (Anlegen, Bearbeiten, Pausiert/Manuell/Automatisch, Fälliges bestätigen, Archivieren). **Aktuell bietet das Dashboard diese Endpunkte noch nicht an.** Erst wenn dessen `/api/mobile/v1/capabilities` die Funktion `features.recurring_rules: true` meldet, lädt Android die Serverregeln und schaltet bei bestehenden Schreibrechten die Bedienung frei. Lokale Regeln bleiben vollständig getrennt. Automatische Buchungen werden ausschließlich vom Dashboard ausgeführt und nur von Administratoren freigeschaltet. Bei nicht bestätigtem Schreibzugriff bleibt der Android-Keystore-Auftrag mit demselben Idempotency-Key erhalten. [API-Vertrag und Handlungsanweisung für Finanzdashboard 6](docs/MOBILE-RECURRING-RULES-API.md).

## Tastaturfreundliche Auswahl bei Empfängern und Kategorien (Alpha 33, developer)

Buchungen und wiederkehrende Regeln nutzen lokal wie im Servermodus eine kompakte Vorschlagsliste, die sich am tatsächlich sichtbaren Android-Bildschirmbereich ausrichtet. Häufige Namen und passende Wortanfänge werden bevorzugt; weitere Treffer sind scrollbar. Neue Empfänger lassen sich weiterhin frei eingeben, Kategorien bleiben an ihre bisherige Auswahl- und lokale Neuanlagelogik gebunden. Dashboard-API, Finanzdaten und Backups werden nicht geändert. Der echte Gerätetest steht noch aus.
