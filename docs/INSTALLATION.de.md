# Android-App bauen und installieren

[English](INSTALLATION.en.md) | **Deutsch**

## Voraussetzungen
Debian/Ubuntu x86_64, ausreichend Speicherplatz und Internet für die SDK-Abhängigkeiten. Das Hilfsskript installiert fehlende Pakete bei entsprechender Berechtigung. Benötigt werden Node.js 22+, Java 21 und das Android SDK.

```bash
bash scripts/build-android-vm.sh
```

Bei Erfolg entsteht `release/FieLanzen-Offline-<version-aus-package.json>-debug.apk` (Versionsnummer aus dem jeweiligen Branch). Die APK kann über den Android-Paketinstaller oder bei identischer Signatur mit `adb install -r pfad/zur.apk` eingespielt werden.

**Vor dem Update:** Vollständige JSON-Sicherung der App an einem externen Ort ablegen. App nicht deinstallieren und Daten nicht löschen, um einen Signaturfehler zu umgehen. Paketkennung `de.fielanzen.offline` und Signaturschlüssel müssen mit der installierten App übereinstimmen. Ein zufällig neu erzeugter Debug-Schlüssel eines anderen Build-Rechners ist dafür nicht geeignet.

Der lokale Build ist eine **Debug-Testversion**, auch wenn der Quellstand bereits **0.2.0** heißt. Für die reguläre signierte Version die [GitHub Releases](https://github.com/renfie/fielanzen-android-offline/releases) verwenden. Bestandene Quellcodetests garantieren kein fehlerfreies Verhalten der nativen Android-Funktionen.

Der GitHub-Actions-Debug-Build verwendet stattdessen den Dateinamen `FieLanzen-Offline-<version>-debug-UNSTABLE-KEY.apk` in einem ZIP-Artefakt. Eine signierte APK wird nur im gesonderten Release-Ablauf erzeugt. [Release-Anleitung](RELEASES.de.md).
