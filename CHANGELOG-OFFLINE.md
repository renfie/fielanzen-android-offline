# Änderungsverlauf · FieLanzen Offline

[English](CHANGELOG-OFFLINE.en.md) | **Deutsch**

## 0.1.0-alpha.32 (26.11.2026) – Einheitliche Oberfläche und Vorbereitung wiederkehrender Serverregeln (developer)
- **Einheitliche Oberfläche:** Lokale und serverbasierte Buchungen verwenden gemeinsame Buchungskarten mit gleichen Farben, Statussymbolen, Abständen, einklappbaren Details und Schaltflächengrößen.
- **Serverübersicht:** Gleiche Struktur wie lokal mit Kontoständen, Monatsbereich, Buchungssuche sowie Filter- und Sortiermöglichkeiten. Auswertungen auf Grundlage nur geladener API-Seiten werden als möglicherweise unvollständig gekennzeichnet.
- **Wiederkehrende Serverregeln:** Android-Oberfläche für Anzeigen, Anlegen, Bearbeiten, Pausieren, manuelle/automatische Modi, bestätigte fällige Buchungen und Archivierung vorbereitet. Lokale Regeln bleiben strikt getrennt.
- **API-Abhängigkeit:** Die Funktionen bleiben deaktiviert, bis das Dashboard die vollständige Mobile-API unter `features.recurring_rules: true` freigibt. Der API-Vertrag einschließlich Rechten, Administratorfreigabe, `If-Match` und Idempotenz ist dokumentiert; die Server-Endpunkte werden dadurch noch nicht bereitgestellt.
- **Sicherheit und Datenbestand:** Bestehende Berechtigungsprüfungen, ausstehende Schreibaufträge und getrennte Datenquellen bleiben erhalten. Keine Migration lokaler Finanzdaten und keine Änderung des Finanzbackups oder Dashboards.
- **Veröffentlichung:** Ausschließlich Entwicklungsstand auf `developer` mit Debug-Test-APK, kein signierter Release auf `main`. Die Android-Geräteprüfung steht aus.

## 0.1.0-alpha.31 (23.11.2026) – Copyright und Quellcode-Hinweise
- Eigener Quellcode, native Android-Klassen, Skripte und Tests mit `SPDX-License-Identifier: GPL-2.0-only` sowie `Copyright (C) 2026 René Fieler (RenFie)` gekennzeichnet, passend zur jeweiligen Dateisyntax. Drittanbieter- und generierter Code bleibt unverändert.
- Unter Mehr → GPLv2 · Rechte & Pflichten steht der volle Name sichtbar; ebenso im offline verfügbaren Lizenzdialog. Keine Änderung des GNU-GPLv2-Lizenzvolltexts.
- README und NOTICE auf Deutsch und Englisch aktualisiert. App-ID, Datenbankschema, Sicherung und Financisto-Export unverändert.
- Signierter Android-GitHub-Release wird durch die neue Versionsnummer automatisch angefordert.
- Veraltete Anweisung im historischen Alpha-21-Testplan durch neutrale Testdokumentation ersetzt.

## 0.1.0-alpha.30 (23.11.2026) – Systemleisten, GPLv2 und automatische signierte Releases
- Android 15/16: `MainActivity` behandelt Statusleiste, Kameraaussparung, Systemnavigation und Bildschirmtastatur mit genau einem nativen WindowInsets-Mechanismus am Content-Root. Die konkurrierende Capacitor-SystemBars-Inset-Behandlung wird deaktiviert; CSS-Safe-Area bleibt auf Web/PWA beschränkt.
- In den Einstellungen („Mehr“) stehen GPLv2-Rechte und -Pflichten bei Weitergabe bereits sichtbar. Der vollständige GPL-Text und Copyright-/Fremdsoftwarehinweise bleiben offline im Volltext-Dialog.
- Neue Android-Versionsnummern auf GitHub `main` lösen nach bestandenen Tests und Signaturprüfung automatisch den signierten Prerelease inkl. SHA256 aus; andere Commits erzeugen nur Debug-Test-APKs.
- Bestehende Paketkennung `de.fielanzen.offline`, Android-Datenbank und funktionierender vollständiger Financisto-Export bleiben unverändert. Kein Dashboard-Update.
- Gerätetest auf Samsung Galaxy S26 und Signaturwechsel von einer bestehenden Debug-App müssen weiterhin separat geprüft werden.

## 0.1.0-alpha.28 – Übersicht, Suche, Nachladen und Android-Statusleiste
- Sowohl lokale als auch serverseitige Übersicht übernehmen die Buchungsmenge (30/50/100) und die Sortiereinstellung.
- Suche in der Übersicht und unter Buchungen, jeweils ohne Eingabefeld bei jedem Tastendruck neu aufzubauen.
- Auf beiden Seiten lassen sich Buchungen schrittweise nachladen. Server: Suche ausschließlich in geladenen API-Seiten; ältere Seiten werden auf Wunsch nachgeladen.
- Android-Statusleiste: nativer Systemleisten-Abstand anhand der WindowInsets (kein fixer Wert); Browser-/PWA-Fallback über CSS-safe-area. Dialoge und Navigation berücksichtigt.
- Finanz-/Financisto-Export aus Alpha 27 unverändert, kein Dashboard-Update.

## 0.1.0-alpha.27
- Kompakte Serverbuchungsliste mit Detailaufklappen und Buchungsart-Badges.
- Gemeinsame Sortierung/30-50-100-Anzeige in den Einstellungen.
- Gleichgroße Empfänger- und Kategorie-Suchfelder.
- Native optionale Android-Biometrie-/Geräte-PIN-App-Sperre.
- Financisto-Export der Alpha 26 unverändert.

## 0.1.0-alpha.26 – Jeder Financisto-Export vollständig
- Terminexport kann durch keine alte Einstellung mehr deaktiviert werden; manuelle/automatische/Teilen-Sicherung verwenden einheitlich vollständigen Export.
- Checkbox, Auswahlspeicherung, Bestätigungsdialog und zugehöriger Beschreibungskontext entfernt.
- Konvertierungsfehler bei nicht abbildbaren Regeln bleiben sichtbar; keine stillen Teil-Backups.

## 0.1.0-alpha.25 – Financisto-Terminausgabe angeglichen
- Terminvorschläge mit Financisto-Status PN, 12:00-Anker und aktuellem last_recurrence statt Status UR.
- Enddatum nach RFC-2445 als yyyyMMddT000000, monatliche Felder am funktionierenden Dashboard-Export ausgerichtet.
- Beim Rückexport mit Originaldatei bleiben native Terminvorlagen erhalten.
- Importprüfung zählt Terminvorlagen nach Erzeugung erneut und bricht bei Abweichung ab.
- Test mit 14.959 Buchungen und sieben Terminvorlagen; tatsächlicher Import in Original-Financisto bleibt auf dem Gerät zu bestätigen.

## 0.1.0-alpha.24 – Server-Konto und Buchungsdialog, Export-Hinweis

- Pro Dashboard-Server getrenntes geräteseitiges Standardkonto; neue Serverbuchungen starten mit diesem Konto.
- Serverbuchungen: Kategorie und Empfänger als Suchfelder mit begrenzten Vorschlägen statt langen nativen Listen.
- Vorschlagslisten öffnen auf schmalen Bildschirmen oberhalb des Eingabefeldes, damit die Bildschirmtastatur sie weniger verdeckt.
- Bei manueller Financisto-Sicherung wird bei vorhandenen, aber ausgeschlossenen wiederkehrenden Regeln ausdrücklich nachgefragt. Zustimmung aktiviert den Vorlagenexport dauerhaft; Abbruch verhindert eine unvollständige Sicherung.
- Finanzregel: Im Original-Financisto können auch deaktivierte Regeln aktiviert werden. Zuerst in separater TESTinstallation importieren.
- Paket-ID und SQLite-Format unverändert; VersionCode 24.

## 0.1.0-alpha.23 – Keystore-Fehler und klarer Datenquellenwechsel

- AndroidKeystore AES/GCM mit `setRandomizedEncryptionRequired(true)`: keinen externen IV mehr beim Verschlüsseln übergeben. Der IV wird vom Android Keystore erzeugt und im bisherigen `v1:`-Format mitgespeichert. Dadurch kein `InvalidAlgorithmParameterException` beim Speichern des Geräte-API-Schlüssels.
- Nach erfolgreicher API-Verbindung eine **separate, sichtbare Servervorschau**; Aktivierung nur durch „Servermodus aktivieren“. Ohne Bestätigung bleibt der Modus LOKAL.
- Auf allen Reitern klarer Datenquellenstatus; im Servermodus „Zu Lokal wechseln“ sofort sichtbar.
- Kein automatisches Vermischen oder Übertragen lokaler Buchungen. Die bereits lokal erfasste Testbuchung wird nicht automatisch auf den Server kopiert.
- Kein SQLite-Migrationsbedarf; Paket-ID unverändert; Android `versionCode 23`.
- Hinweis auf explizit aktivierbaren Financisto-Terminexport; unveränderter Standard ohne Terminvorlagen.
- Build-/Teststatus: Quellcode-/Regressionsprüfung lokal. Android-Geräteprüfung der Keystore-Reparatur steht aus.

## 0.1.0-alpha.22 – Einfacher Dashboard-Verbindungsablauf

- Lokalmodus: Verbindungseinstellungen zeigen eine einzige primäre Aktion „Verbinden“.
- Der Klick prüft API, Schlüssel und Servervorschau; der Wechsel in den Servermodus erfordert weiterhin eine ausdrückliche Bestätigung.
- Bereits gespeicherte Schlüssel können für dieselbe Serveradresse wiederverwendet werden; keine erneute Eingabe erforderlich.
- Bei einer ausdrücklich erkannten Client-Zertifikatsanforderung (z.B. nginx: „No required SSL certificate was sent“) öffnet die App Androids KeyChain-Auswahl und wiederholt den lesenden Verbindungsaufbau genau einmal.
- Normale HTTPS-Server benötigen kein Zertifikat; HTTP 400 ohne eindeutigen Zertifikatshinweis, 401, Netzfehler etc. lösen keine automatische Auswahl aus.
- Manuelle Zertifikatsauswahl und Freigabeaufhebung sind unter „Erweiterte Verbindungseinstellungen“ verborgen; weitere Verbindungsaktionen im Servermodus ebenfalls.
- Unveränderte lokale SQLite-Daten, Buchungen, Finanzregeln, API-Schreibprotokolle, Idempotenz und Exportregeln.
- Echter Android-Gerätetest und nativer mTLS-Build stehen aus; automatische Auswahl bei nichtssagendem TLS-Handshake-Fehler kann nicht erzwungen werden, manuelle Fallback-Auswahl bleibt möglich.

## 0.1.0-alpha.21 – Signierte Serverbeträge und optionaler Financisto-Terminexport
- Dashboard-Buchungen: signierte `amount_minor` beim LESEN sicher normalisieren, keine unkontrollierte Umrechnung; API-SCHREIBEN weiterhin positive Minor Units.
- Getrennte Statusmeldung nach gültigem /session, falls Abruf/Validierung der Buchungsliste fehlschlägt.
- Eigene, standardmäßig ausgeschaltete Exportoption für geplante/wiederkehrende Regeln in Financisto (is_template=2, Recurrence-Format des Originalprojekts).
- Warnung vor Aktivierung deaktivierter Termine beim Import; nicht verlustfrei abbildbare Wiederholungen brechen die geplante Exportoption ab.
- Alpha-20-JSON-Sicherungen kompatibel; lokale SQLite-Daten und Dashboard-Server unverändert.
- Neue Tests für negative Beträge, Terminvorlagen, Original-SQLite-Schema und große Exportdatenbestände.

## 0.1.0-alpha.20 – Original-Financisto-Währungsformat und optionales Android-mTLS
- Korrektur: Financisto-Centbeträge zeigen wieder sichtbare Dezimal-/Tausendertrennzeichen (Währungsformat mit quotierten Separatoren).
- Auto-Backup-Cache wird aufgrund neuer Exportkennung verworfen und vor weiterer Ausgabe neu vorbereitet.
- Android-KeyChain-Client-Zertifikat kann für den Dashboard-Host explizit ausgewählt werden; private Schlüssel verbleiben in Android.
- Native mTLS-Anfragen validieren TLS-Zertifikat/Hostnamen und leiten Bearer-Schlüssel nicht per Redirect um.
- Offline-Datenbank und vorhandene Daten bleiben unverändert.
- API-Erkennung meldet HTTP 400 mit Hinweis auf möglichen mTLS-Proxy; eine gültige API-Authentifizierung bleibt erforderlich.

# FieLanzen Offline 0.1.0-alpha.19 – Offizieller Android-Entwicklungschat

**Basis: Alpha 18 aus dem Android-Chat; keine Alpha-19-Quellen aus dem Dashboard-Chat.**

## Export
- Standalone-Financisto-Header auf nachweislich funktionierendes Dashboard-Format 117 / 1.8.2 / 217 angeglichen.
- Vor Export zusätzliche strenge Pflichfeldprüfung, insbesondere `currency.title` und Konten.
- Exporter-Kennung 19; die Native-Bridge validiert entpackten Dateiinhalt auch vor Hintergrundexport und verwirft alte Alpha-18-Stagingdateien.
- Android-Wiederherstellung: kein MIME-Filter, Dateiinhaltsprüfung bleibt erhalten.
- Echtes Wiederherstellen in ursprünglichem Financisto/Financisto Holo **noch auf Gerät zu bestätigen**.

## Optionaler Dashboard-Servermodus
- `GET /capabilities`, `/session`, `/accounts`, `/categories`, `/payees`, `/bookings` mit Paginierung.
- Schreiboperationen `POST/PUT/DELETE /bookings`; Idempotency-Key als UUID, PUT/DELETE mit If-Match.
- AES-GCM + AndroidKeystore für API-Schlüssel und offene Schreibaufträge.
- Schaltbare vollständig getrennte Datenquelle; kein automatisches Vermischen, Hochladen, Synchronisieren oder Zurückfallen auf Offline-Daten.
- Schutz vor doppelten Buchungen bei unsicherem Netzwerkausgang; keine stillen Retries.
- Keine zusätzlichen Berechtigungen durch den API-Schlüssel: Server prüft Benutzer und Modus.
- Lokale SQLite-Struktur, bestehender App-Package-Name und Debugsignaturweg unverändert.

## Tests und Grenzen
- Unabhängige Original-Financisto-SQLite-Simulation, bestehende Regressionstests, neue API-Sicherheits- und Exportprüfungen.
- Echte API-Antworten des Dashboard 1.9.58-dev.16, Geräte-Speicher, realer Financisto-Rückimport und Android-APK-Build müssen auf der Ziel-VM/dem Galaxy S26 bestätigt werden.

## 0.1.0-alpha.29 (23.11.2026)
- Unter Mehr → Lizenz & Open Source vollständige GPLv2 offline verfügbar, mit Rechte-/Pflichtenübersicht und Hinweisen in Deutsch und Englisch; in beiden Datenquellen.
- GitHub Actions baut automatisch eine Debug-APK; signierte GitHub-Vorabveröffentlichungen ausschließlich mit eigenen, als Secrets hinterlegten Signaturschlüsseln.
- Android versionCode wird aus der Alpha-Versionsnummer abgeleitet; keine Änderungen am Finanzbackupformat.
