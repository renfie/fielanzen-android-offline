import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('accounts, categories and payees start folded and account toggle has a live click action',()=>{
 const main=file('src/main.ts');
 assert.match(main,/let accountsOpen=false;/);
 assert.match(main,/let categoriesOpen=false;/);
 assert.match(main,/let payeesOpen=false;/);
 assert.match(main,/data-action="toggle-accounts"/);
 assert.match(main,/case 'toggle-accounts':/);
 assert.match(main,/id="account-management"/);
});
test('automatic Android backup offers MediaStore Downloads instead of exclusively SAF',()=>{
 const native=file('native/de/fielanzen/offline/DownloadsBackupFiles.java');
 assert.match(native,/MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
 assert.match(native,/IS_PENDING/);
 assert.match(native,/FileInputStream/);
 assert.match(native,/OWNER_PACKAGE_NAME/);
 assert.match(native,/FieLanzen/);
 const plugin=file('native/de/fielanzen/offline/FieLanzenAutoBackupPlugin.java');
 assert.match(plugin,/useDownloadsFolder/);
 const main=file('src/main.ts');
 assert.match(main,/data-action="use-default-backup-folder"/);
 assert.match(main,/case 'use-default-backup-folder':/);
 assert.match(main,/withVisiblePickerTimeout/);
});
test('repository excludes user backups and local databases',()=>{
 const ignore=file('.gitignore');
 for(const ext of ['*.backup','*.sqlite','*.db','*.csv','FieLanzen-Offline-*.json'])assert.ok(ignore.includes(ext));
 assert.match(file('scripts/check-publication.py'),/git.*ls-files/);
});
