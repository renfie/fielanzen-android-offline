# Signierte Android-Releases (GitHub Actions)

[English](RELEASES.en.md) | **Deutsch**

## Was automatisch passiert

- Jeder Push auf `main` baut nach erfolgreicher Prüfung eine **Debug-APK** als GitHub-Actions-Artefakt. Ihr automatisch generierter Debug-Schlüssel ist **nicht dauerhaft stabil**; sie ist kein verlässliches Update für eine schon installierte Version.
- Unter **Actions → Android APK – build and signed prerelease → Run workflow** kann ein signierter Release direkt ausgelöst werden. GitHub erstellt nach der Signaturprüfung das Versionstag automatisch. Alternativ kann ein passendes Git-Tag den Build auslösen.
- Ein Versions-Tag wie `v0.1.0-alpha.29` startet ebenfalls einen Release-Build. Nur wenn die vier GitHub-Secrets vorhanden sind und der Build samt Signaturprüfung erfolgreich ist, wird ein **signiertes APK** samt SHA256 als GitHub-*Prerelease* veröffentlicht. Die Quellcode-ZIP-Datei gehört über das Tag dazu.
- Das separate Docker-Dashboard wird dabei weder verändert noch veröffentlicht.

## Einmalig: eigener Signaturschlüssel

**Den Schlüssel niemals ins Git-Repository, in eine Chat-Nachricht oder in ein Backup der App legen.** Du musst ihn dauerhaft und zusätzlich offline sichern; ohne diesen Schlüssel sind später keine regulären Updates dieser Signatur möglich.

Auf der Linux-Build-VM:

```bash
mkdir -p "$HOME/.local/share/fielanzen-signing"
chmod 700 "$HOME/.local/share/fielanzen-signing"
keytool -genkeypair -v \
  -keystore "$HOME/.local/share/fielanzen-signing/release.jks" \
  -storetype PKCS12 -alias fielanzen -keyalg RSA -keysize 3072 \
  -validity 10000 -dname 'CN=FieLanzen Offline, O=Private project, C=DE'
chmod 600 "$HOME/.local/share/fielanzen-signing/release.jks"
```

Das Passwort bei der interaktiven Abfrage sicher notieren. Mit dieser PKCS12-Konfiguration ist das Schlüsselpasswort gewöhnlich identisch mit dem Keystore-Passwort; prüfe das bei deiner Einrichtung. Sichere die Datei *und* das Passwort unabhängig von GitHub.

Anschließend in GitHub im Repository **Settings → Secrets and variables → Actions → New repository secret** vier Secrets anlegen:

| Secret | Wert |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Einzeiliger Base64-Inhalt deiner Datei: `base64 -w0 "$HOME/.local/share/fielanzen-signing/release.jks"` (nur direkt in GitHub einfügen) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `ANDROID_KEY_ALIAS` | `fielanzen` |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels |

GitHub Secrets sind für die signierende Workflow-Ausführung gedacht. Der private Schlüssel wird nur temporär im Runner abgelegt und nicht in den Release-Artefakten gespeichert.

## Signierte Version auf GitHub veröffentlichen – ohne Linux-VM oder PAT

Die vier Signing-Secrets sind einmalig einzurichten. **Danach werden weder ein Personal Access Token noch die Linux-VM für neue Releases benötigt.**

1. [**Actions → Android APK – build and signed prerelease**](https://github.com/renfie/fielanzen-android-offline/actions/workflows/android-apk.yml) öffnen.
2. **Run workflow** anklicken.
3. Unter **Use workflow from** den Branch **main** auswählen.
4. Die Checkbox **Publish signed prerelease for package.json version (main branch only)** aktivieren.
5. **Run workflow** klicken.
6. In **Actions** prüfen, ob Build, Tests, Signaturprüfung und Veröffentlichung erfolgreich waren. Danach liegt die signierte APK mit SHA256 unter [Releases](https://github.com/renfie/fielanzen-android-offline/releases). Der Workflow erzeugt das passende Git-Tag.

**Ohne Häkchen** wird nur eine Debug-Test-APK gebaut. Keine separate Veröffentlichung über **Draft a new release** anlegen: Der Workflow erzeugt Tag und Prerelease selbst und verweigert eine doppelte Veröffentlichung derselben Version.

Für spätere Releases vor dem Start die Versionsnummer in `package.json`, im App-Quelltext und in den Tests konsistent erhöhen, beispielsweise auf Alpha 30. Der Button baut die aktuelle Version auf `main`, nicht die lokale Arbeitskopie.

Wer über Git verfügt, kann alternativ weiterhin ein passendes Versionstag pushen. Das ist für den normalen Ablauf aber nicht nötig.

## Warnung bei bereits installierter Debug-APK

Die bisher auf der Linux-VM erstellten `*-debug.apk` können mit einem anderen Zertifikat signiert sein. Android installiert eine Release-APK dann **nicht** als Update über die bestehende App. Eine Deinstallation entfernt unter Umständen deine lokalen Finanzdaten.

**Vor einem Signaturwechsel:** JSON-Vollsicherung extern aufbewahren; separate Wiederherstellbarkeit prüfen. Nicht deinstallieren, bevor die Daten und der Migrationsweg gesichert sind. Für nahtlose Updates müsste derselbe ursprüngliche Signaturschlüssel genutzt werden – Debug-Schlüssel dauerhaft für öffentliche Releases zu verwenden ist aus Sicherheitsgründen nicht empfehlenswert.

Die APK ist ein Alpha-Release; auch ein grüner GitHub-Build ersetzt keinen Funktionstest auf einem echten Android-Gerät.
