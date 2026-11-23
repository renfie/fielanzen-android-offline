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

## Freigabeablauf
- Kein Build oder GitHub-Arbeit für einzelne kleine Änderungswünsche.
- Änderungen im Entwicklungszweig bündeln, Tests vorab ausführen und erst an Meilensteinen ein vollständiges Android-Projektpaket zur Installation freigeben.
- Alte App-Daten beim APK-Update erhalten; vor riskanten Datenmigrationen externe Sicherung.
