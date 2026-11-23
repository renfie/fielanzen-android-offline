#!/usr/bin/env python3
"""Idempotent native Android resource/configuration setup; no network calls."""
from pathlib import Path
import re, shutil, sys, json
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
android=root/'android'
manifest=android/'app/src/main/AndroidManifest.xml'
res=android/'app/src/main/res'
app_gradle=android/'app/build.gradle'
if not manifest.exists() or not app_gradle.exists():
    sys.exit('Android-Quellen fehlen: zuerst npx cap add android ausführen.')

# Explicitly opt out of Android cloud/device transfers of private financial data.
xml=manifest.read_text()
application=re.search(r'<application\b[^>]*>',xml,re.S)
if not application:
    sys.exit('AndroidManifest.xml: application-Knoten fehlt.')
opening=application.group(0)
for key,value in [('allowBackup','false'),('fullBackupContent','@xml/backup_rules'),('dataExtractionRules','@xml/data_extraction_rules')]:
    attr=f'android:{key}'
    if re.search(r'\b'+re.escape(attr)+r'\s*=',opening):
        opening=re.sub(r'\b'+re.escape(attr)+r'\s*=\s*"[^"]*"',f'{attr}="{value}"',opening)
    else:
        opening=opening.replace('<application','<application '+f'{attr}="{value}"',1)
xml=xml[:application.start()]+opening+xml[application.end():]
manifest.write_text(xml)
ET.fromstring(xml)
(res/'xml').mkdir(parents=True,exist_ok=True)
(res/'xml'/'backup_rules.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <exclude domain="root" path="." />
    <exclude domain="database" path="." />
    <exclude domain="file" path="." />
    <exclude domain="sharedpref" path="." />
</full-backup-content>
''')
(res/'xml'/'data_extraction_rules.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" path="." />
        <exclude domain="database" path="." />
        <exclude domain="file" path="." />
        <exclude domain="sharedpref" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" path="." />
        <exclude domain="database" path="." />
        <exclude domain="file" path="." />
        <exclude domain="sharedpref" path="." />
    </device-transfer>
</data-extraction-rules>
''')
for f in (res/'xml'/'backup_rules.xml',res/'xml'/'data_extraction_rules.xml'):
    ET.parse(f)

# Keep package ID and monotonically increasing Android versionCode stable across releases.
version=json.loads((root/'package.json').read_text())['version']
match=re.fullmatch(r'0\.1\.0-alpha\.(\d+)',version)
if not match:sys.exit('Release verlangt package.json version 0.1.0-alpha.N; VersionCode nicht eindeutig.')
version_code=int(match.group(1))-1  # Alpha 28 used versionCode 27.
if version_code<1:sys.exit('Ungültiger Android versionCode.')
gradle=app_gradle.read_text()
new,amount=re.subn(r'\bversionCode\s*=?\s*\d+', f'versionCode {version_code}',gradle,count=1)
if not amount:sys.exit('app/build.gradle: versionCode nicht gefunden.')
new,amount=re.subn(r'\bversionName\s*=?\s*[\"\'][^\"\']+[\"\']',f'versionName "{version}"',new,count=1)
if not amount:sys.exit('app/build.gradle: versionName nicht gefunden.')
app_gradle.write_text(new)

# Install exact original wolf artwork, already pre-generated into density-specific PNGs.
source=root/'assets/android-res'
if not source.exists():sys.exit('Android-Icon-Dateien fehlen.')
for f in source.rglob('*'):
    if not f.is_file():continue
    dest=res/f.relative_to(source)
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(f,dest)
# Install the SAF folder picker and Android WorkManager background backup integration.
source_native=root/'native/de/fielanzen/offline'
target_native=android/'app/src/main/java/de/fielanzen/offline'
target_native.mkdir(parents=True,exist_ok=True)
for source_file in source_native.glob('*.java'):
    shutil.copy2(source_file,target_native/source_file.name)
(target_native/'MainActivity.java').write_text('''package de.fielanzen.offline;

import android.os.Bundle;
import android.content.Context;
import android.view.WindowManager;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        // Do not show protected finance data in Android task previews.
        if (getSharedPreferences(FieLanzenAppLockPlugin.PREFS, Context.MODE_PRIVATE)
            .getBoolean(FieLanzenAppLockPlugin.ENABLED, false)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        registerPlugin(FieLanzenAutoBackupPlugin.class);
        registerPlugin(FieLanzenSecureSessionPlugin.class);
        registerPlugin(FieLanzenAppLockPlugin.class);
        registerPlugin(FieLanzenMtlsHttpPlugin.class);
        // Android 15/16 force edge-to-edge. We own all insets in ONE place:
        // the content root, never both the WebView and CSS/Capacitor.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
        final View contentRoot = getWindow().getDecorView().findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (view, windowInsets) -> {
            // Status bar, camera/display cutout, 3-button/gesture navigation.
            Insets system = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            // The WebView and its fixed bottom navigation must also move ABOVE
            // the on-screen keyboard, including Android's edge-to-edge IME mode.
            Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            int bottom = windowInsets.isVisible(WindowInsetsCompat.Type.ime())
                ? Math.max(system.bottom, keyboard.bottom) : system.bottom;
            if (view.getPaddingLeft() != system.left || view.getPaddingTop() != system.top ||
                view.getPaddingRight() != system.right || view.getPaddingBottom() != bottom) {
                view.setPadding(system.left, system.top, system.right, bottom);
            }
            return windowInsets;
        });
        // White app chrome: use dark Android status/navigation icons.
        WindowCompat.getInsetsController(getWindow(), contentRoot).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), contentRoot).setAppearanceLightNavigationBars(true);
        contentRoot.post(() -> ViewCompat.requestApplyInsets(contentRoot));
    }
}
''')
app_gradle=app_gradle.read_text()
for dependency in ['androidx.work:work-runtime:2.10.5','androidx.documentfile:documentfile:1.0.1','androidx.biometric:biometric:1.1.0']:
    if dependency not in app_gradle:
        marker='dependencies {'
        if marker not in app_gradle: sys.exit('Android Gradle: dependencies-Block fehlt.')
        app_gradle=app_gradle.replace(marker,marker+f"\n    implementation '{dependency}'",1)
(root/'android/app/build.gradle').write_text(app_gradle)
print(f'Android-Konfiguration fertig: Wolf-Icon, WorkManager/SAF-Sicherung, Backup-Cloud-Sperre, Version {version}, Code {version_code}.')
