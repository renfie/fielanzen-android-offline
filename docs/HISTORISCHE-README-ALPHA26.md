> Historischer Stand zur Nachvollziehbarkeit. **Nicht** als aktuelle Installationsanleitung verwenden.

## Alpha 26 – Datensicherung immer vollständig

- **Alle** manuell und automatisch erzeugten Financisto-.backup-Dateien enthalten Konten, Kategorien, Empfänger, Buchungen und alle **im lokalen Datenbestand vorhandenen** Wiederholungsregeln.
- Kein Terminschalter, keine separate Zustimmung, kein Kontext-/Info-Abschnitt mit Exportoption. Ehemalige gespeicherte Exportoptionen werden ignoriert.
- Der Export bricht ab, falls eine lokale Terminregel nicht Financisto-kompatibel darstellbar ist, statt sie stillschweigend auszulassen.
- Die Sicherungsanzeige nennt die aktuelle Zahl der lokalen Regeln; wenn dort 0 steht, hat die App keine Regeln gespeichert, die sie in ein Financisto-Backup schreiben könnte.
- Beim Einspielen in Financisto können auch vorher in FieLanzen deaktivierte Termine aktiv werden. Die FieLanzen-JSON-Sicherung bleibt das vollständig verlustfreie eigene Sicherungsformat.

# FieLanzen Offline 0.1.0-alpha.26 – vollständige Financisto-Sicherung ohne Terminschalter

**Vollständiges Projekt, kein Patch.** Ausgangspunkt ist die offizielle **Alpha 22** dieses Android-Chats; das separate Android-Artefakt aus dem Dashboard-Chat wird nicht benutzt. GitHub bleibt unverändert.

## Alpha 23: Was wirklich neu ist

- AndroidKeyStore AES-GCM: Beim Verschlüsseln **keinen eigenen GCM-IV vorgeben**, sondern den von `Cipher.init(ENCRYPT_MODE, key)` sicher erzeugten IV mit `cipher.getIV()` abholen. Das behebt die `InvalidAlgorithmParameterException` bei aktivierter `setRandomizedEncryptionRequired(true)`. Die bestehende `v1:`-Entschlüsselung bleibt kompatibel.
- Ein erfolgreicher Verbindungstest aktiviert **nicht** den Servermodus. Zuerst erscheint eine sichtbare **Servervorschau** mit „Servermodus aktivieren“ oder „Lokal bleiben“; keine WebView-`confirm`-Abhängigkeit.
- Oben auf **jeder** Seite steht deutlich „AKTIV: LOKAL“ oder „AKTIV: DASHBOARD-SERVER“. Im Servermodus kann man direkt „Zu Lokal wechseln“ wählen. Lokale Daten werden dabei niemals vermischt/hochgeladen/überschrieben.
- Der API-Schlüssel wird erst beim bewussten Aktivieren über das native Keystore-Plugin gespeichert. Ein Fehler bei dieser Speicherung belässt die App im Lokalmodus.
- Android-App-ID `de.fielanzen.offline`, SQLite-Schema und vorhandene Buchungen bleiben unverändert; `versionCode` steigt auf **24**.

## Update auf dem bisherigen S26

1. Unter „Mehr → Datensicherung → Erweitert“ eine vollständige **JSON-Sicherung außerhalb der App** erzeugen. Diese enthält auch lokale Regeln.
2. ZIP `FieLanzen-Offline-v0.1.0-alpha.26-Android-Projekt.zip` ins Home der bisherigen Linux-VM kopieren und ausführen:

   ```bash
   unzip -o ~/FieLanzen-Offline-v0.1.0-alpha.26-Android-Projekt.zip -d ~/
   cd ~/fielanzen-android-offline
   bash scripts/build-android-vm.sh
   ```
3. Die erstellte `release/FieLanzen-Offline-0.1.0-alpha.26-debug.apk` **direkt über Alpha 23** installieren. App vorher **nicht** deinstallieren, keine App-Daten löschen; denselben Debug-Signaturschlüssel verwenden.
4. Gemeinsam testen: `docs/MEILENSTEIN-ALPHA23-TESTPLAN.txt`.

**Prüfgrenze:** TypeScript-Preview-Übersetzung, Finanzlogik, Sicherungen, Original-Financisto-SQLite-Simulation und Regressionstests sind lokal prüfbar. Die native Keystore-Funktion kann erst auf dem Galaxy S26 nach tatsächlicher APK-Kompilierung bestätigt werden. Es werden keine persönlichen Finanzdaten, API-Schlüssel oder Zertifikate mitgeliefert.

---

## Historische technische Hinweise (Alpha 19–22)

## Financisto-Export – Regression für ursprüngliche Apps

Das tatsächliche `app.backup` aus Alpha 18 konnte in Financisto und Holo scheinbar erfolgreich wiederhergestellt werden, danach waren beide Anwendungen leer. Die Diagnose verglich es mit dem funktionierenden `web.backup`: Ein Pflichtfeld in `currency` und die vollständigen Versionsmetadaten fehlten im App-Archiv. Diese Erkenntnisse gelten trotz der älteren Alpha-18-Quellcode-Tests; die Original-App-Wiederherstellung war **nicht bestanden**.

Alpha 19 erstellt eine neue gzip-komprimierte Datei mit Header `VERSION_CODE:117`, `VERSION_NAME:1.8.2`, `DATABASE_VERSION:217` wie im funktionierenden Dashboard-Export und der zusätzlichen Parser-ignorierten Kennung `FIELANZEN_EXPORTER_VERSION:19`. Finanzisto-Buchungen enthalten die Anfangsbestände als eigene kompatible Transaktionen. Eine zusätzliche unabhängige Pflichtfeldprüfung wird **vor** gzip/Dateischreiben ausgeführt. Der native Android-Backupdienst kontrolliert zusätzlich den tatsächlich entpackten Dateiinhalt. Frühere staged Backups werden beim Update verworfen, statt durch WorkManager mit neuem Datum kopiert zu werden.

Unabhängige SQLite-Prüfung des Exportformats und der Kontostände: automatisiert. **Der tatsächliche Test in Financisto und Financisto Holo ist trotzdem noch OFFEN**. Bitte den Export dort nicht als einzige zuverlässige Sicherung einsetzen. Die vollständige JSON-Sicherung enthält zusätzlich Regeln, Einstellungen und Importprotokolle. Backups im Android-Download-Ordner sind unverschlüsselt.

Dateiauswahl: `Sicherung prüfen / wiederherstellen` beschränkt den Android-Dateityp nicht mehr auf wenige MIME-Typen; die App erkennt und validiert den Inhalt selbst.

## Optionaler Servermodus (Dashboard 1.9.58-dev.16)

Unter **Mehr → Datenquelle** die **HTTPS-Basisadresse** `https://finance.example.org` (OHNE `/api/mobile/v1`) und einen im Dashboard ausdrücklich erzeugten Geräte-API-Schlüssel eingeben.

- Öffentlicher Erkennungstest: `GET /healthz`, `GET /api/mobile/v1/capabilities`.
- Vor Aktivierung: `GET /session` prüft Geräteberechtigung/Benutzerrechte; `GET /accounts`, `/categories`, `/payees`, `/bookings?limit=100` zeigen die Servervorschau; Bestätigungsdialog verlangt ausdrückliche Zustimmung.
- Nur bei aktiver Serveransicht: Buchung **direkt** per `POST /bookings`, `PUT /bookings/{id}`, `DELETE /bookings/{id}`. Betrag als positiver `amount_minor` (kleinste Währungseinheit), `kind=income|expense|transfer`; Umbuchung mit `to_account_id` und `category_id=0`.
- JEDER Schreibvorgang verwendet einen neuen `Idempotency-Key` (UUID). PUT/DELETE verwenden zusätzlich `If-Match` mit der zuletzt gelesenen `revision`.
- **Keine automatische Wiederholung bei Netzproblemen.** Vor dem Senden wird der exakt gleiche Auftrag (UUID, JSON, Revision) verschlüsselt gespeichert. Nach unklarem Ausgang wird ein weiterer neuer Schreibvorgang blockiert; eine Wiederholung desselben Auftrags ist nur bewusst möglich. Bei HTTP 409/412/428 und 401/403 kein ungeprüftes Überschreiben.
- Schreibrechte nur bei `finance_mode=web` und `access=write`, `can_write=true`. Die API überprüft Zugriffe zusätzlich serverseitig. Der Client vergibt keine zusätzlichen Rechte.
- Login-Schlüssel und offene Serveroperation werden auf Android mit **AES-256-GCM über AndroidKeyStore** in app-privaten Einstellungen verschlüsselt gespeichert. Kein Schlüssel in JSON/Financisto-Backup, SQLite, Quellcode oder Protokollen. Die App verhindert Android-Cloud-/Gerätetransfer der privaten Daten.
- Onlinemodus enthält **nur** Serverkonten/-buchungen. Offlinekonten/-buchungen/-regeln werden niemals automatisch mit Serverdaten gemischt oder hochgeladen. Bei Netzfehlern wird **nicht** stillschweigend auf Offline-Daten umgeschaltet. Vorhandene lokale Daten bleiben erhalten und sind beim expliziten Wechsel zurück wieder da.
- Server-Modus synchronisiert **keine lokalen Buchungen**. Insbesondere gibt es keine Offline-Schreibwarteschlange. Serverabfragen sind je Aufruf live; nur angeforderte 100er-Seiten werden geladen. Serverregeln/Monatsbericht sind im mobilen Servermodus noch nicht über API implementiert.
- Falls die Authentifizierung fehlt/abgelehnt wird, keine Serverbuchungen schreiben. Bei `finance_mode` ungleich `web` nur lesender Serverbetrieb.
- Eine bestehende API-Sitzung kann nach Wechsel auf Lokal erneut ausdrücklich aktiviert werden, ohne einen neuen Token auszugeben. Widerruf/Entfernen des Geräteschlüssels über Einstellungen bzw. Dashboard möglich.

**Kompatibilitätsgrenze:** Die API-Übergabe aus dev.16 beschreibt Endpunkte/Felder, nicht die vollständigen Beispiel-JSON-Antworten. Adapter behandeln unbekannte oder unvollständige Daten **nicht** als Erfolg. Die echte Verbindung gegen `1.9.58-dev.16` muss beim Gerätetest geprüft werden; nötigenfalls Antwortformat harmonisieren, statt Daten zu raten.

## Prüfumfang

- `tsc --noEmit`: erfolgreich mit lokalen Modultypstubs; die echten Capacitor-Pakete werden erst auf der Linux-VM heruntergeladen.
- Node/Java/SQLite: bestehende Regressionstests einschließlich Finanzimport, Backupformat, DST/Backupkalender und neue Tests zu API-Rechten, Revisionen, Idempotenz und AndroidKeyStore.
- Die vollständige Android-APK konnte in dieser Umgebung wegen fehlender Android SDK-/npm-Downloadmöglichkeiten **nicht** gebaut oder auf dem S26 gestartet werden.
- Gemeinsame Checkliste: `docs/MEILENSTEIN-ALPHA19-TESTPLAN.txt`.

### Hinweis Alpha 20: Client-Zertifikate und Mobile-API
Wenn der vorgeschaltete Nginx-Proxy ein TLS-Client-Zertifikat verlangt, unter **Mehr → Datenquelle** das bereits im Android-System installierte Zertifikat explizit auswählen. Es ist zusätzlich zum Dashboard-API-Schlüssel nötig; es findet keine automatische Übertragung lokaler Finanzdaten statt. Bei HTTP 400 ggf. den Nginx-Fehlertext (`No required SSL certificate was sent`) im Proxy-Protokoll prüfen.

### Alpha 22: vereinfachter Servermodus

Unter Mehr → Datenquelle: Basisadresse und Geräte-API-Schlüssel eingeben, dann **Verbinden**. Bereits verschlüsselt gespeicherte Schlüssel können für dieselbe URL bei leerem Schlüsselfeld erneut verwendet werden. Automatische Android-KeyChain-Auswahl nur bei explizitem Client-Zertifikats-Proxyfehler; bei anderen TLS-Fehlern kann die Auswahl unter Erweitert manuell erfolgen. Der Servermodus wird erst nach ausdrücklicher Bestätigung aktiviert. Die lokale SQLite-Datenbank wird weder synchronisiert noch verändert.

## Alpha 24 – Abweichungen in der Serveroberfläche korrigiert
- Im Servermodus unter **Mehr / Einstellungen** das **Standardkonto für neue Serverbuchungen** auswählen und speichern. Diese Gerätepräferenz ist für jede Serveradresse separat und wird nicht ins Dashboard geschrieben.
- Empfänger- und Kategorie-Suche in Serverbuchungen funktionieren als textbasierte Vorschläge. Die Kategorie muss aus der gefilterten Liste übernommen werden; ein neuer Server-Kategoriename kann nicht ohne Unterstützung durch die Mobile-API angelegt werden.
- Ein Neustart oder Moduswechsel darf keine lokale und serverseitige Buchung zusammenführen. Bestehende JSON-Sicherung vor dem Update erstellen; APK über dieselbe App-Signatur installieren.
