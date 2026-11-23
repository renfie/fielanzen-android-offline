import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=file('src/main.ts');

test('critical Android backup plugin imported statically, never lazy loaded',()=>{
 assert.match(main,/import \{NativeAutoBackup\} from '\.\/native-auto-backup\.js';/);
 assert.doesNotMatch(main,/import\('"?\.\/native-auto-backup/);
 assert.match(main,/return NativeAutoBackup;/);
 assert.doesNotMatch(main,/Promise\.resolve\(NativeAutoBackup\)/);
 assert.match(main,/isPluginAvailable\('FieLanzenAutoBackup'\)/);
});
test('Android plugin handshake is tested before file operation',()=>{
 const code=main.slice(main.indexOf('async function backupNow()'),main.indexOf('function updateBackupStatus()'));
 assert.ok(code.indexOf('plugin.getStatus()')<code.indexOf('exportFinancistoCompatible(state,undefined,{includeScheduled:'));
 assert.match(code,/Android-Pluginantwort prüfen/);
});
test('visible diagnostic and manual backup fallback independent of native plugin',()=>{
 assert.match(main,/backupBridgeDiagnosis/);
 assert.match(main,/data-action="backup-diagnostics"/);
 assert.match(main,/data-action="backup-share-export"/);
 const fallback=main.slice(main.indexOf("case 'backup-share-export':"),main.indexOf("case 'add-booking':"));
 assert.match(fallback,/exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.match(fallback,/exportUserBytes\(bytes,/);
 assert.doesNotMatch(fallback,/nativeBackup\(/);
});
test('packaged Android versions advance without app id or data reset',()=>{
 assert.equal(JSON.parse(file('package.json')).version,'0.1.0-alpha.25');
 assert.match(file('scripts/configure-android.py'),/versionCode 25/);
 assert.match(file('capacitor.config.ts'),/de\.fielanzen\.offline/);
 assert.doesNotMatch(file('scripts/configure-android.py'),/deleteDatabase|clearData/);
});
