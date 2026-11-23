#!/usr/bin/env bash
# FieLanzen Offline: local, no-GUI Android debug APK build for Debian/Ubuntu x86_64.
# Does not connect to GitHub or change the Docker dashboard.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT_DIR="$PWD"
VERSION="$(python3 -c 'import json;print(json.load(open("package.json"))["version"])')"
SDK_CLI="commandlinetools-linux-15859902_latest.zip"
SDK_CLI_SHA256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"
NODE_VERSION="22.21.1"
TOOLS_DIR="$PROJECT_DIR/.build-tools"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$TOOLS_DIR/android-sdk}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$TOOLS_DIR/node/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

log(){ printf '\n[FieLanzen Android] %s\n' "$*"; }
fail(){ printf '\nFEHLER: %s\n' "$*" >&2; exit 1; }
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || fail 'Dieses automatisierte VM-Skript ist für Linux x86_64 (Debian/Ubuntu) vorgesehen.'

# Install minimum OS tools only if absent. On root Debian VM this is automatic.
missing=0
for cmd in curl unzip xz sha256sum python3 java; do command -v "$cmd" >/dev/null || missing=1; done
if ((missing)); then
  command -v apt-get >/dev/null || fail 'Bitte curl, unzip, xz-utils, python3 und OpenJDK 21 installieren.'
  log 'Installiere fehlende Grundpakete (kein Desktop erforderlich).'
  if [[ $EUID -eq 0 ]];then APT=(apt-get);elif command -v sudo >/dev/null;then APT=(sudo apt-get);else fail 'Bitte als root oder mit sudo ausführen.';fi
  "${APT[@]}" update
  DEBIAN_FRONTEND=noninteractive "${APT[@]}" install -y ca-certificates curl unzip xz-utils python3 openjdk-21-jdk-headless
fi
# Capacitor 8 / Gradle 8.14 require JDK 21, not just any java.
JAVA_VERSION="$(java -version 2>&1 | head -1)"
if [[ "$JAVA_VERSION" != *'"21.'* ]];then
  log "Java erkannt: $JAVA_VERSION"
  command -v apt-get >/dev/null || fail 'Benötigt OpenJDK 21.'
  if [[ $EUID -eq 0 ]];then APT=(apt-get);elif command -v sudo >/dev/null;then APT=(sudo apt-get);else fail 'Bitte OpenJDK 21 installieren.';fi
  DEBIAN_FRONTEND=noninteractive "${APT[@]}" install -y openjdk-21-jdk-headless
  JAVA_BIN="$(find /usr/lib/jvm -path '*/bin/java' -type f -name java | grep 'java-21' | head -1 || true)"
  [[ -n "$JAVA_BIN" ]] || fail 'OpenJDK 21 nach Installation nicht auffindbar.'
  export JAVA_HOME="$(dirname "$(dirname "$JAVA_BIN")")"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if [[ -z "${JAVA_HOME:-}" ]];then JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")";export JAVA_HOME;fi
log "Java: $(java -version 2>&1 | head -1)"

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 22 ]];then
  log "Lade portable Node.js $NODE_VERSION direkt von nodejs.org herunter."
  mkdir -p "$TOOLS_DIR"; cd "$TOOLS_DIR"
  NODE_TAR="node-v${NODE_VERSION}-linux-x64.tar.xz"
  curl --fail --location --retry 3 --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}" -o "$NODE_TAR"
  curl --fail --location --retry 3 --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o SHASUMS256.txt
  grep " ${NODE_TAR}\$" SHASUMS256.txt | sha256sum -c - || fail 'Node.js SHA256 stimmt nicht.'
  tar -xJf "$NODE_TAR"
  ln -sfn "node-v${NODE_VERSION}-linux-x64" node
  cd "$PROJECT_DIR"
fi
log "Node: $(node -v) | npm: $(npm -v)"

if [[ ! -x "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]];then
  log 'Lade offizielle Android SDK Command-line Tools von Google (ca. 182 MB).'
  mkdir -p "$TOOLS_DIR" "$ANDROID_SDK_ROOT/cmdline-tools"
  curl --fail --location --retry 3 --silent --show-error \
    "https://dl.google.com/android/repository/${SDK_CLI}" -o "$TOOLS_DIR/$SDK_CLI"
  echo "$SDK_CLI_SHA256  $TOOLS_DIR/$SDK_CLI" | sha256sum -c - || fail 'Android SDK Tools SHA256 stimmt nicht.'
  mkdir -p "$TOOLS_DIR/sdk-extract"
  unzip -qo "$TOOLS_DIR/$SDK_CLI" -d "$TOOLS_DIR/sdk-extract"
  [[ -d "$TOOLS_DIR/sdk-extract/cmdline-tools/bin" ]] || fail 'Google SDK Archiv enthält keine erwartete cmdline-tools-Struktur.'
  mv "$TOOLS_DIR/sdk-extract/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
  rmdir "$TOOLS_DIR/sdk-extract"
fi
SDKMANAGER="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
[[ -x "$SDKMANAGER" ]] || fail 'SDK Manager nicht ausführbar.'
if [[ ! -f "$ANDROID_SDK_ROOT/licenses/android-sdk-license" ]];then
  echo
  echo 'Für das Android SDK gelten Googles Lizenzbedingungen:'
  echo 'https://developer.android.com/studio/terms'
  echo 'Die nächste Bestätigung akzeptiert die SDK-Lizenzen für diese VM.'
  read -r -p 'SDK-Lizenzen lesen und akzeptieren? [ja/NEIN] ' answer
  [[ "$answer" == ja || "$answer" == JA ]] || fail 'Ohne SDK-Lizenz kann nicht gebaut werden.'
  set +o pipefail
  yes | "$SDKMANAGER" --sdk_root="$ANDROID_SDK_ROOT" --licenses >/dev/null
  rc=${PIPESTATUS[1]}
  set -o pipefail
  [[ $rc -eq 0 ]] || fail 'Lizenzannahme fehlgeschlagen.'
fi
log 'Installiere Android SDK Platform 36, Build Tools 36 und Platform Tools (einmalig).'
"$SDKMANAGER" --sdk_root="$ANDROID_SDK_ROOT" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'

log 'Installiere Android-Projektbibliotheken lokal per npm.'
if [[ -f package-lock.json ]];then npm ci --no-audit --no-fund;else npm install --no-audit --no-fund;fi
log 'Erstelle gebündelte Android-Weboberfläche.'
npm run build
if [[ ! -f android/gradlew ]];then npx --no-install cap add android;fi
npx --no-install cap sync android
python3 scripts/configure-android.py
log 'Kompiliere Debug-APK (Gradle lädt erforderliche Komponenten beim ersten Build).'
(cd android && ./gradlew --no-daemon assembleDebug)
APK_SOURCE="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
[[ -s "$APK_SOURCE" ]] || fail 'Gradle hat keine APK erzeugt.'
mkdir -p "$PROJECT_DIR/release"
DEST="$PROJECT_DIR/release/FieLanzen-Offline-${VERSION}-debug.apk"
cp "$APK_SOURCE" "$DEST"
sha256sum "$DEST" > "${DEST}.sha256"
log "FERTIG: $DEST"
log "SHA256: $(sha256sum "$DEST" | cut -d' ' -f1)"
log 'Die Debug-APK ist nur zum Testen, nicht für den Play Store geeignet.'
