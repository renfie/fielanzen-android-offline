# FieLanzen Offline – Dashboard-Funktionsparität (Entwicklungsleitlinie)

Diese Datei hält die bereits gemeinsam festgelegten Regeln fest. Neue Meilensteine sollen diese Funktionen ohne erneute Rückfragen übernehmen, soweit sie in einer vollständig lokalen Android-App sinnvoll sind.

## Übersicht
- Gesamtvermögen kompakt sichtbar.
- Kontostände standardmäßig eingeklappt, Gesamtsumme bereits in der Kopfzeile.
- Kontostandsabgleich wie im Dashboard: Zielsaldo eingeben, Differenz als datierte, nachvollziehbare eigene Korrekturbuchung buchen; frühere Buchungen und ursprüngliche Anfangsbestände nicht stillschweigend verändern.
- Zukünftige Buchungen bleiben sichtbar, fließen vor ihrem Buchungsdatum nicht in den heutigen Kontostand ein.
- Buchungsliste kompakt, Details per Tippen aufklappbar, Klonen/Bearbeiten/Löschen nach Auswahl.

## Buchungen
- Schnellsuche immer direkt sichtbar, standardmäßig über den gesamten Bestand; Datum, Empfänger, Kategorie, Konto, Notiz, Betrag werden durchsuchbar.
- Erweiterte Buchungsfilter standardmäßig eingeklappt. Bei Bedarf Zeitraum, Datum von/bis, Konto, Kategorie und Art wählbar.
- Filter wirken gemeinsam und ändern nie unbemerkt bestehende Finanzdaten.
- Gefilterter CSV-Export; Umbuchungen separat von Einnahmen und Ausgaben.

## Einstellungen
- Kategorien und Empfänger standardmäßig eingeklappt; jeweils mit Suche und Verwaltung.
- Kategorie- und Empfängerauswahl bei Buchungen und wiederkehrenden Regeln identisch, durchsuchbar und mit direkter Neuanlage.
- Standardkonto und Theme sind benutzerspezifische lokale Einstellungen.

## Sicherungen und Kompatibilität
- FieLanzen-Komplettsicherung (JSON und komprimiert) für verlustfreie Wiederherstellung: Konten, Buchungen, Regeln, Einstellungen, Importprotokolle.
- Zusätzlich echter Financisto-kompatibler Export (kein umbenanntes JSON), dessen Kompatibilität zum Original und zum Docker-Dashboard erst nach Import- und Saldenabgleich freigegeben wird.
- Automatische Sicherung in freigegebenen Android-Ordner, Retention und Zeitplan.
- Exporte dürfen keine Dubletten oder stillschweigende Datenänderungen erzeugen.

## Local-/Server-Darstellungsparität (Entwicklungszweig)
- Alle Buchungslisten nutzen dieselbe UI-Komponente. Unterschiede betreffen ausschließlich die Datenherkunft und erlaubte Aktionen, nicht Farben, Typografie oder die kompakten, standardmäßig geschlossenen Karten.
- Übersicht, Kontostandsanzeige, Suche, Filter und Monatskarten haben dieselbe Anordnung. Die Kontosummen werden von der jeweiligen Datenquelle geliefert; unterschiedliche Währungen werden niemals zu einer fingierten Gesamtsumme addiert.
- Mobile API v1: Suche, Filter und Berichte können nur über geladene Buchungsseiten rechnen; dies muss sichtbar bleiben. Nicht angebotene Funktionen (z. B. serverseitige wiederkehrende Regeln) werden nicht mit lokalen Daten vorgetäuscht.
- Keine Änderung an Authentifizierung, Datenquellenwechsel, Schreibrechten, Idempotenz und lokalem Finanzbestand.

## Freigabeablauf
- Änderungen auf developer erzeugen automatisch eine Debug-Test-APK; ein signierter Release erfolgt ausschließlich nach gesonderter Freigabe und Übernahme auf main.
- Änderungen im Entwicklungszweig bündeln, Tests vorab ausführen und erst an Meilensteinen ein vollständiges Android-Projektpaket zur Installation freigeben.
- Alte App-Daten beim APK-Update erhalten; vor riskanten Datenmigrationen externe Sicherung.
