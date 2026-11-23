#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 René Fieler (RenFie)
#
# This program is free software under the GNU GPL v2.
# See LICENSE for the complete license text.

set -euo pipefail
cd "$(dirname "$0")/.."
command -v npm >/dev/null || { echo 'Node.js >=22 und npm erforderlich.' >&2; exit 1; }
if [[ -f package-lock.json ]];then npm ci --no-audit --no-fund;else npm install --no-audit --no-fund;fi
npm run build
if [[ ! -f android/gradlew ]];then npx --no-install cap add android;fi
npx --no-install cap sync android
python3 scripts/configure-android.py
(cd android && ./gradlew --no-daemon assembleDebug)
mkdir -p release
cp android/app/build/outputs/apk/debug/app-debug.apk release/FieLanzen-Offline-0.1.0-alpha.25-debug.apk
sha256sum release/FieLanzen-Offline-0.1.0-alpha.25-debug.apk > release/FieLanzen-Offline-0.1.0-alpha.25-debug.apk.sha256
printf 'APK: %s\n' "$(pwd)/release/FieLanzen-Offline-0.1.0-alpha.25-debug.apk"
