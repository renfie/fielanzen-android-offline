# Finanzdashboard 6 – Mobile-API für wiederkehrende Regeln

**Stand: 26.11.2026 · API-Vertrag zur Implementierung im Dashboard-Branch `develop`.**
Diese API **existiert im Dashboard bisher nicht**; die Android-App im Branch `developer` ist darauf vorbereitet. Android- und Dashboard-Änderungen werden getrennt gepflegt.

## Ziel

Die Android-App FieLanzen soll im Datenmodus **DASHBOARD-SERVER** dieselbe Rubrik **Wiederkehrend** wie im lokalen Modus anzeigen und bedienen. Die Serverdaten kommen **ausschließlich** aus der Web-Finanzdatenbank des Dashboards. Keine Kopie lokaler Regeln, kein Import/Sync, keine Änderungen an den Finanzbackupformaten.

Die bestehende Dashboard-Wiederholungslogik mit den Modi **Pausiert**, **Manuelle Buchung**, **Automatische Buchung** bleibt maßgeblich. Die vorhandene Server-Scheduler-Logik, der Schutz vor Doppelbuchungen, die Ausführungshistorie und die Soft-Delete-Funktion werden wiederverwendet, nicht erneut in Android implementiert.

## 1. Capability freischalten

In `GET /api/mobile/v1/capabilities` im bestehenden `features`-Objekt folgendes Feld ergänzen:

```json
{"recurring_rules": true}
```

Das Feld **erst dann auf `true` setzen, wenn alle unten genannten Lese- und Schreibendpunkte verfügbar und getestet sind**. Alte Server senden das Feld nicht: Android interpretiert es als `false` und zeigt die bisherige Nichtverfügbarkeitsmeldung ohne Schreibversuch.

`mobile_api: 1` und die anderen Capability-Felder bleiben unverändert; kein neues Schlüsselformat, keine gesonderte Anmeldung.

## 2. Lese-API

**`GET /api/mobile/v1/recurring`**, mit dem bestehenden Bearer-API-Key und denselben Berechtigungen wie `/accounts`, `/bookings`.

Antwort:

```json
{
  "items": [{
    "id": 11,
    "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "title": "Miete",
    "kind": "expense",
    "account_id": 1,
    "to_account_id": 0,
    "category_id": 2,
    "payee_id": 0,
    "payee_title": "Vermieter",
    "amount_minor": 95000,
    "note": "",
    "frequency": "monthly",
    "interval_count": 1,
    "day_of_month": 28,
    "start_on": "2026-11-01",
    "run_at": "09:30",
    "end_on": null,
    "max_occurrences": 12,
    "completed_count": 3,
    "next_on": "2026-11-28",
    "mode": "manual",
    "needs_review": ""
  }]
}
```

**Verbindliche Feldregeln:**

- `revision`: 32 Hex-Zeichen, stabiler Hash des aktuellen Regelinhalts/Status zur konkurrierenden Bearbeitung (`If-Match`). Jede relevante Änderung muss einen neuen Hash ergeben.
- `amount_minor`: immer **positiver Absolutbetrag** in der kleinsten Währungseinheit. Der Buchungstyp `kind` bestimmt die Darstellung. Die bestehende Datenbank kann signierte Beträge speichern; das API-Format normalisiert diese.
- `mode`: `paused`, `manual` oder `auto`, aus `active`/`auto_post` abgeleitet.
- `frequency`: `daily`, `weekly`, `monthly`, `quarterly` oder `yearly`; `interval_count` 1–120, `day_of_month` 1–31, `run_at` HH:MM.
- `end_on`, `next_on`, `max_occurrences` dürfen `null` sein. `completed_count` zählt nachweislich ausgeführte Termine aus `recurring_runs`. `needs_review` ist ein Hinweistext.
- `to_account_id` 0 bei Nicht-Umbuchungen. `category_id` 0 für Umbuchungen. Kein `deleted_on` in der Liste: archivierte Regeln nicht zurückgeben.
- Bestehende Benutzer-/Schreibrechte bleiben erhalten. Im Finanzmodus `import` darf gelesen, aber keine Regel geändert oder ausgeführt werden.

## 3. Schreib-API

Alle Endpunkte unter `/api/mobile/v1/recurring` verlangen die vorhandene Autorisierung `_mobile_require(write=True)`, einen **UUID-`Idempotency-Key`**, Audit-Eintrag und atomare Transaktion. Für bestehende Regeln wird außerdem `If-Match: <revision>` verlangt. Keine blind wiederholten Buchungen nach Zeitüberschreitung.

| Methode | Endpunkt | JSON-Body | Wirkung |
|---|---|---|---|
| POST | `/recurring` | vollständiger Regelentwurf | neue Regel stets **pausiert** |
| PUT | `/recurring/{id}` | vollständiger Regelentwurf | Regel bearbeiten, anschließend **pausieren**, bestehende Buchungen behalten |
| PUT | `/recurring/{id}/mode` | `{"mode":"paused"/"manual"/"auto"}` | Modus ausdrücklich übernehmen |
| POST | `/recurring/{id}/post` | `{"confirm":"BUCHEN"}` | genau eine bereits fällige manuelle Buchung über die bestehende `post_one`-Logik |
| DELETE | `/recurring/{id}` | `{"confirm_title":"EXAKTER REGELNAME"}` | bestehende Soft-Delete-Logik; Buchungen und Ausführungshistorie erhalten |

Der vollständige Regelentwurf für POST und PUT verwendet die Lese-Felder **ohne** `id`, `revision`, `mode`, `next_on`, `completed_count` und `needs_review`:

```json
{
  "title": "Miete",
  "kind": "expense",
  "account_id": 1,
  "to_account_id": 0,
  "category_id": 2,
  "payee_title": "Vermieter",
  "amount_minor": 95000,
  "note": "",
  "frequency": "monthly",
  "interval_count": 1,
  "day_of_month": 28,
  "start_on": "2026-11-01",
  "run_at": "09:30",
  "end_on": null,
  "max_occurrences": 12
}
```

Validierungen müssen der bestehenden Dashboard-Webverwaltung entsprechen: zulässiges Konto und Währung, Kategorie, Betrag, Wiederholungsintervall, Start-/Enddatum, Maximalanzahl und `run_at`. Bestehende Empfänger anhand `payee_title` wie im Webformular auflösen oder neu anlegen. Keine automatische Aktivierung nach dem Speichern.

**Modusrechte:** `paused` und `manual` nur bei gültigen Schreibrechten und führendem Web-Finanzmodus; `auto` ausschließlich für Administratoren. Die API prüft alle Einschränkungen serverseitig, unabhängig davon, was Android anzeigt. Die App führt niemals selbst automatisch eine Serverregel aus.

**Manuelles Buchen:** Nur bei `mode=manual`, tatsächlich fälligem Termin und exakter Eingabe `BUCHEN`. Bestehender Unique-Index `recurring_runs(rule_id,due_on)` und Buchung/Saldo/Audit in einer SQLite-Transaktion verhindern Doppelbuchungen. Die von `Idempotency-Key` gebundene Antwort darf bei Wiederholung nur zurückgegeben, niemals erneut gebucht werden.

**Idempotenz:** Vor jeder Mutation `mobile_api_receipts` nach Schlüssel, Operation und Body-Hash prüfen. Bei gleicher Wiederholung gespeicherte Antwort zurückgeben; bei anderem Body mit gleichem Schlüssel Fehler. Bei Änderungen `If-Match` vor dem ersten Schreiben prüfen; 428 bei fehlendem, 409 bei veraltetem Hash. Bei bekannter Ablehnung keine Änderung durchführen.

**Fehlerstatus:** 400 ungültige JSON-/Feldwerte, 401 fehlender/ungültiger Key, 403 fehlende Rollenberechtigung, 404 unbekannte/archivierte Regel, 409 veraltete Revision bzw. nicht führender Web-Modus/unerlaubter Regelstatus, 428 fehlendes `If-Match`. Status und Fehlermeldung als JSON zurückgeben.

## 4. Bestehende Komponenten weiterverwenden

In `package/src/app.py` sind bereits `_mobile_require`, `_mobile_body_and_request_id`, `_mobile_receipt`, `_mobile_save_receipt`, die Routen zur Web-Regelverwaltung sowie `recurring`-Funktionen vorhanden. Die neuen Endpunkte sollen diese fachliche Logik wiederverwenden, nicht unabhängig replizieren.

Insbesondere beibehalten:

- Importierter Financisto-Vorlagenbestand, Pausierung nach Bearbeitung, Erfordernis erneuter Freigabe.
- `finance_mode=web` als Bedingung für Mutationen; im Financisto-Modus keine automatische Web-Ausführung.
- Statusänderungen einschließlich Adminschutz für automatische Buchungen.
- Soft-Delete, `recurring_runs`-Historie und eindeutige Ausführungen.
- SQLite-Sicherungen, Kontostände, Exportformate, bestehende Mobile-API-Endpunkte und langlebige API-Keys.

## 5. Abnahmetests im Finanzdashboard-Projekt

1. `recurring_rules` ist erst nach abgeschlossener Implementierung in `/capabilities` wahr.
2. GET liefert Pausiert/Manuell/Automatisch, Grenzwerte, nächste Fälligkeit, Ausführungsanzahl und 32-stellige Revision korrekt; archivierte Regeln fehlen.
3. Lesen mit Read-Key möglich; jede Mutation mit Read-Key, ohne führenden Web-Modus oder ohne Berechtigung abgewiesen.
4. POST erzeugt eine pausierte Regel; PUT pausiert auch vorher automatische Regeln, ohne frühere Buchungen zu verändern.
5. Automatische Freigabe als Editor verweigert, als Admin nur bei gültiger Regel möglich.
6. Manuelle Buchung ohne `BUCHEN`, vor Fälligkeit, bei gesperrter Regel oder bei erneutem Request erzeugt **keine** Dublette; Kontostand und `recurring_runs` sind atomar.
7. DELETE mit falschem Titel scheitert; mit richtigem Titel archiviert es die Regel ohne Löschung historischer Buchungen.
8. Fehlender/staler `If-Match`, beschädigter UUID-Schlüssel und abweichender Body zu altem Schlüssel werden sicher abgewiesen.
9. Android mit alter API bleibt unverändert; mit neuer API zeigt es die Serverregeln an und kann nur die erlaubten Operationen ausführen.
10. README/Changelog DE/EN aktualisieren und **nur auf Dashboard-`develop` testen**. Dashboard-`main`, die Android-Releases sowie Finanzdaten/Backups unverändert lassen, bis die Freigabe erfolgt.

## 6. Android-Kopplung

Die Android-Implementierung lebt ausschließlich in `renfie/fielanzen-android-offline` im Branch `developer`. Sie schaltet die neue Regelansicht erst bei `features.recurring_rules === true` frei, hält Regeldaten im RAM und übermittelt Mutationen ausschließlich an die obigen Serverendpunkte. Unklare Server-Schreibaufträge bleiben mit demselben Idempotency-Key im Android-Keystore erhalten, bis sie eindeutig geklärt sind.

Die einzige gemeinsame Schnittstelle ist dieses JSON-Protokoll; die zwei GitHub-Projekte dürfen nicht stillschweigend gegenseitig geändert werden.
