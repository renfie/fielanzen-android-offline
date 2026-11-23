#!/usr/bin/env python3
"""Idempotent native Android resource/configuration setup; no network calls."""
from pathlib import Path
import re, shutil, sys
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

# Keep the package ID stable across alpha releases; bump Android versionCode.
gradle=app_gradle.read_text()
new,amount=re.subn(r'\bversionCode\s*=?\s*\d+', 'versionCode 27',gradle,count=1)
if not amount:sys.exit('app/build.gradle: versionCode nicht gefunden.')
new,amount=re.subn(r'\bversionName\s*=?\s*[\"\'][^\"\']+[\"\']','versionName "0.1.0-alpha.28"',new,count=1)
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
        // Protect task previews before Capacitor/WebView startup when lock is enabled.
        if (getSharedPreferences(FieLanzenAppLockPlugin.PREFS, Context.MODE_PRIVATE)
            .getBoolean(FieLanzenAppLockPlugin.ENABLED, false)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        registerPlugin(FieLanzenAutoBackupPlugin.class);
        registerPlugin(FieLanzenSecureSessionPlugin.class);
        registerPlugin(FieLanzenAppLockPlugin.class);
        registerPlugin(FieLanzenMtlsHttpPlugin.class);
        // Respect physical Android system bars, including camera cutouts/edge-to-edge modes.
        // If Android already positions the WebView below the status bar, apply no extra top inset.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        super.onCreate(savedInstanceState);
        View web = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            int[] position = new int[2];
            v.getLocationOnScreen(position);
            int top = Math.max(0, bars.top - position[1]);
            if (v.getPaddingTop() != top) {
                v.setPadding(v.getPaddingLeft(), top, v.getPaddingRight(), v.getPaddingBottom());
            }
            return insets;
        });
        web.post(() -> ViewCompat.requestApplyInsets(web));
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
print('Android-Konfiguration fertig: Wolf-Icon, WorkManager/SAF-Sicherung, Backup-Cloud-Sperre, Version 0.1.0-alpha.28.')
