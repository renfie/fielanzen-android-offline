# FieLanzen Dashboard Mobile-API – Übergabe 1.9.58-dev.16

Dieses Dokument ist eine Integrationsbeschreibung der Alpha 19 aus dem Android-Chat.
Sie ersetzt die frühere (Alpha 18) vorbereitende, schreibgeschützte Verbindungsprobe.
Eine unabhängig im Finanzdashboard-Chat erzeugte Android-Alpha 19 ist **keine** Grundlage.

## Basis und Endpunkte

Basisadresse `https://finance.example.org`, API-Basis `/api/mobile/v1`:

- `GET /healthz`, `GET /capabilities` ohne Token
- `GET /session` mit Bearer-Key; Rückgabe `finance_mode`, `access`, `can_write`
- `GET /accounts`: `id`, `name`, `currency`, `symbol`, `decimals`, `balance_minor`, `projected_balance_minor`, `active`, `included_in_total`
- `GET /categories`: `id`, `name`, `kind`
- `GET /payees`: `id`, `name`
- `GET /bookings?limit=100&before=<cursor>`: Seiten mit `next_before`, jede Buchung mit `revision`
- `POST /bookings`, `PUT /bookings/{id}`, `DELETE /bookings/{id}`

Sitzungsaufruf: `Authorization: Bearer <im Dashboard erzeugter Geräte-API-Schlüssel>`.
Das Dashboard vergibt für jedes Gerät einen widerrufbaren Schlüssel, der nicht automatisch abläuft. Der Client speichert ihn verschlüsselt mit einem Schlüssel aus AndroidKeyStore (AES-GCM). Das Dashboard erzwingt außerdem seine Benutzer- und Geräteschlüsselberechtigungen.

Neue Buchung: `{"kind":"income","date":"2026-11-22","account_id":1,"category_id":2,"amount_minor":171513,"payee_title":"Beispiel","note":"Test"}`. Minor Units sind ein positiver Integer (Cent bei EUR). Umbuchung mit `kind=transfer`, `to_account_id` und `category_id=0`.

`POST`, `PUT`, `DELETE`: `Idempotency-Key: <UUID>`. Änderungen und Löschungen zusätzlich `If-Match: <revision>`. Wiederholungen einer möglicherweise erfolgreichen Netzwerkanfrage dürfen nur mit **demselben** UUID, dem identischen Request-Pfad und identischen Payload passieren.

## Sicherheit und Isolation

- Offline-Buchungen in SQLite bleiben vollständig getrennt vom Dashboard-Server.
- Serverbetrieb erst nach bestätigter Anmeldung und **expliziter Aktivierung**; dabei keine lokalen Daten übertragen.
- Im Serverbetrieb führt nur Dashboard die Buchungen; lokale Offline-Regeln werden nicht ausgeführt.
- Schreibfunktionen nur bei `finance_mode=web`, `can_write=true` und Gerätezugriff `write`. Server muss dies selbst durchsetzen.
- Kein automatisches Retry bei Netzfehlern. Ein unklarer Schreibauftrag ist separat verschlüsselt vorgemerkt, weitere Schreibvorgänge werden bis zur Klärung blockiert.
- Bei `HTTP 401/403`: Zugriff fehlt/Schlüssel widerrufen, nicht auf die lokale Datenbank zurückfallen.
- Bei `HTTP 409/412/428`: Serverrevision aktualisieren bzw. Konflikt prüfen, keine stillen Änderungen.
- Ein Token gehört zu **einer** HTTPS-Basisadresse. Kein Bearer-Token an einen anderen Server senden.
- **Keine Offline-Synchronisation oder automatische lokale Warteschlange** in Alpha 19.

## Vor Veröffentlichung prüfen

Die Übergabe dokumentiert die Feldnamen, aber keine vollständigen realen JSON-Beispielantworten. Alpha 19 unterstützt direkte Listen oder geläufige umhüllte `data`-/`items`-Antworten und verwirft unerkannte/ungültige Antworten. Ein Gerätetest gegen das echte Dashboard `1.9.58-dev.16` ist erforderlich; bei Abweichungen Schema am tatsächlichen Server prüfen, **nicht** Daten erfinden.

Das Keystore-Plugin darf seinen geheimen Wert niemals in Logs, JSON, lokale Finanzdatenbank oder Sicherungsdateien schreiben. Für eine Veröffentlichung ist ein eigenes Security-Review einschließlich Release-Signierung erforderlich.

### Alpha 21 – Lese-/Schreibkonvention Betrag
- GET /bookings: `amount_minor` ist eine ganze Minor-Unit-Zahl; die App akzeptiert positive und negative Werte, normalisiert zur Darstellung den Betrag und benutzt `kind` zur Richtung. Fehlende/nichtganzzahlige Beträge werden mit Buchungs-ID abgewiesen (kein stiller Ersatz durch 0).
- POST/PUT: Eingaben bleiben strikt positiv mit `kind` und validierter Kategorie; negative Werte werden vom Client nicht gesendet.
- Nach erfolgreichem /session wird ein Fehler beim Abruf der Buchungen nicht als widerrufener Schlüssel angezeigt. Kein automatischer Server-Schreib-Retry.

### Alpha 22 – einfache Anmeldung und bedingte Zertifikatsauswahl
- Standardablauf: HTTPS-Basisadresse und Geräteschlüssel → ein Klick auf „Verbinden“ → API-/Sitzungs-/Serverdatenprüfung → bewusste Bestätigung.
- Wiederanmeldung für dieselbe Adresse kann den im Keystore gespeicherten Geräteschlüssel wiederverwenden.
- Bei ausdrücklich nachweisbarem mTLS-Proxyfehler (z. B. „No required SSL certificate was sent“) darf nach Nutzerklick einmalig die Android-KeyChain-Auswahl geöffnet und die Verbindung einmal erneut getestet werden.
- Allgemeine Fehler (Netzwerk, HTTP 400 ohne Zertifikatshinweis, 401/403) lösen **keine** automatische Zertifikatsauswahl aus. Bei nichtssagender TLS-Ablehnung bleibt die manuelle Auswahl unter „Erweiterte Verbindungseinstellungen“.
- Keine Änderung an lokalem SQLite-Bestand, API-Schreibprotokoll oder TLS-Validierung.
