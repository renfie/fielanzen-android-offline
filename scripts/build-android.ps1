$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (Test-Path 'package-lock.json') { npm ci } else { npm install }
if ($LASTEXITCODE -ne 0) { throw 'npm install fehlgeschlagen' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'TypeScript/Vite-Build fehlgeschlagen' }
if (!(Test-Path 'android/gradlew.bat')) { npx cap add android; if ($LASTEXITCODE -ne 0) { throw 'Android init fehlgeschlagen' } }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync fehlgeschlagen' }
python scripts/configure-android.py
if ($LASTEXITCODE -ne 0) { throw 'Android Konfiguration fehlgeschlagen' }
Push-Location android
try { .\gradlew.bat assembleDebug; if ($LASTEXITCODE -ne 0) { throw 'Gradle fehlgeschlagen' } }
finally { Pop-Location }
New-Item -ItemType Directory -Path release -Force | Out-Null
${v} = (Get-Content package.json -Raw | ConvertFrom-Json).version
Copy-Item 'android/app/build/outputs/apk/debug/app-debug.apk' "release/FieLanzen-Offline-$v-debug.apk" -Force
Write-Output "APK: release/FieLanzen-Offline-$v-debug.apk"
