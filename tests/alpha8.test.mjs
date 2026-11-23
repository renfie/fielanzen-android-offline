import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exportBackup,parseBackup,validateSettings} from '../preview/src/backup.js';
import {emptySnapshot} from '../preview/src/types.js';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Android version names stay consistent across the full build project',()=>{
  const pkg=JSON.parse(load('package.json'));
  assert.match(pkg.version,/^0\.1\.0-alpha\.\d+$/);
  assert.ok(load('src/main.ts').includes(`APP_VERSION='${pkg.version}'`));
  assert.ok(load('scripts/configure-android.py').includes(`versionName \"${pkg.version}\"`));
  assert.ok(load('scripts/build-android-vm.sh').includes(`VERSION=\"${pkg.version}\"`));
});
test('new app settings persist in validated JSON backups',()=>{
  const state=emptySnapshot();state.accounts=[{id:12,name:'Girokonto',openingCents:50000}];
  state.settings={defaultAccountId:12,theme:'dark'};
  const exported=exportBackup(state);
  const parsed=parseBackup(exported);
  assert.equal(JSON.parse(exported).schemaVersion,4);
  assert.deepEqual(parsed.snapshot.settings,state.settings);
  assert.equal(validateSettings(undefined,state.accounts).theme,'system');
  assert.throws(()=>validateSettings({defaultAccountId:13,theme:'dark'},state.accounts),/Standardkonto/);
  assert.throws(()=>validateSettings({defaultAccountId:null,theme:'forest'},state.accounts),/Darstellung/);
});
test('old JSON backups from Alpha 7 import with default theme/account',()=>{
  const data=emptySnapshot();data.accounts=[{id:1,name:'Alt',openingCents:0}];
  const old=JSON.parse(exportBackup(data));old.schemaVersion=3;delete old.data.settings;
  assert.deepEqual(parseBackup(JSON.stringify(old)).snapshot.settings,{defaultAccountId:null,theme:'system'});
});
test('both IndexedDB and Android SQLite support payee edits and settings',()=>{
  const db=load('src/database.ts');
  assert.match(db,/indexedDB\.open\('fielanzen-offline-preview', 4\)/);
  assert.match(db,/CREATE TABLE IF NOT EXISTS app_settings/);
  assert.match(db,/async updatePayee\(/);
  assert.match(db,/async removePayee\(/);
  assert.match(db,/async saveSettings\(/);
  assert.match(db,/checked\.settings/);
  assert.match(db,/accounts','app_settings'/); // replaceAll resets preferences transactionally
});
test('UI exposes payee management, account picker, theme and amount select',()=>{
  const src=load('src/main.ts');
  assert.match(src,/id="payee-search"/);
  assert.match(src,/id="preferred-account"/);
  assert.match(src,/id="preferred-theme"/);
  assert.match(src,/function payeeDialog/);
  assert.match(src,/data-select-on-focus/);
  assert.match(src,/function applyTheme/);
});
