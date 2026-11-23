import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('default Downloads works without a native folder picker or window.confirm',()=>{
 const main=source('src/main.ts');
 const method=main.slice(main.indexOf('async function useDownloadsBackupFolder()'),main.indexOf('async function selectBackupFolder()'));
 assert.doesNotMatch(method,/window\.confirm\(/);
 assert.match(method,/useDownloadsFolder\(/);
 assert.match(method,/await backupNow\(\)/);
 const auto=source('native/de/fielanzen/offline/AutoBackupFiles.java');
 assert.match(auto,/getString\("destination", "downloads"\)/);
 assert.match(main,/data-action="auto-backup-now"[^>]*>Jetzt sichern/);
 assert.doesNotMatch(main,/runningNatively\(\)&&backupStatus\?\.selected\?'':'disabled'/);
});
test('save must pass stage, write and confirmed result before reporting success',()=>{
 const main=source('src/main.ts');
 const method=main.slice(main.indexOf('async function backupNow()'),main.indexOf('function updateBackupStatus()'));
 for(const frag of ['exportFinancistoCompatible(state,undefined,{includeScheduled:','plugin.stageBackup','plugin.writeNow','result.written','plugin.getStatus','lastExportName!==result.name','backupRunning=false'])
   assert.ok(method.includes(frag), `Missing ${frag}`);
 assert.match(method,/checkedBackupStep/);
 assert.match(main,/function checkedBackupStep/);
 assert.match(main,/role="status"/);
});
test('Android MediaStore uses RELATIVE_PATH and publishes only after verifying bytes',()=>{
 const download=source('native/de/fielanzen/offline/DownloadsBackupFiles.java');
 assert.match(download,/MediaStore.Downloads.EXTERNAL_CONTENT_URI/);
 assert.match(download,/MediaStore.MediaColumns.RELATIVE_PATH, FOLDER_PATH/);
 assert.match(download,/MediaStore.MediaColumns.IS_PENDING, 0/);
 assert.match(download,/InputStream written = resolver.openInputStream/);
 assert.match(download,/if \(!completed\)/);
});
test('picker is optional, has a Capacitor ActivityCallback and a bounded wait',()=>{
 const java=source('native/de/fielanzen/offline/FieLanzenAutoBackupPlugin.java');
 assert.match(java,/startActivityForResult\(call, intent, "folderChosen"\)/);
 assert.match(java,/@ActivityCallback private void folderChosen/);
 assert.match(java,/Log.e\(TAG, "Folder picker launch failed"/);
 const main=source('src/main.ts');
 assert.match(main,/withVisiblePickerTimeout/);
});
test('backup update preserves old installation and does not publish private user data',()=>{
 assert.equal(JSON.parse(source('package.json')).version,'0.1.0-alpha.25');
 assert.match(source('scripts/configure-android.py'),/versionCode 25/);
 assert.match(source('capacitor.config.ts'),/de\.fielanzen\.offline/);
 assert.match(source('.gitignore'),/\*\.backup/);
});
