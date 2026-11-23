# Android-App bauen und installieren

[English](INSTALLATION.en.md) | **Deutsch**

## Voraussetzungen
Debian/Ubuntu x86_64, ausreichend Speicherplatz und Internet für die SDK-Abhängigkeiten. Das Hilfsskript installiert fehlende Pakete bei entsprechender Berechtigung. Benötigt werden Node.js 22+, Java 21 und das Android SDK.

```bash
bash scripts/build-android-vm.sh
```

Bei Erfolg entsteht `release/FieLanzen-Offline-0.1.0-alpha.28-debug.apk`. Die APK kann über den Android-Paketinstaller oder bei identischer Signatur mit `adb install -r pfad/zur.apk` eingespielt werden.

**Vor dem Update:** Vollständige JSON-Sicherung der App an einem externen Ort ablegen. App nicht deinstallieren und Daten nicht löschen, um einen Signaturfehler zu umgehen. Paketkennung `de.fielanzen.offline` und Signaturschlüssel müssen mit der installierten App übereinstimmen. Ein zufällig neu erzeugter Debug-Schlüssel eines anderen Build-Rechners ist dafür nicht geeignet.

Es handelt sich um eine Alpha-Debugversion. Bestandene Quellcodetests garantieren kein fehlerfreies Verhalten der nativen Android-Funktionen.
