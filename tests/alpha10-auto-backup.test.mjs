// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {parseBackup,exportBackup,validateSnapshot} from '../preview/src/backup.js';
import {encodeAutomaticBackup,parseAutomaticBackup,encodeBase64,APP_BACKUP_EXTENSION} from '../preview/src/automatic-backup.js';
const src=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
function example(){
  const s=emptySnapshot();
  s.accounts=[{id:1,name:'Giro',openingCents:43000},{id:2,name:'Bar',openingCents:2200}];
  s.categories=[{id:1,name:'Äpfel',kind:'expense'},{id:2,name:'Lohn',kind:'income'}];
  s.payees=[{id:1,name:'Bäcker & Co'}];
  s.bookings=[{id:1,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:1,amountCents:500,date:'2026-11-19',note:'Äpfel, Birnen',createdAt:'2026-11-19T08:00:00Z'},
    {id:2,type:'transfer',accountId:1,otherAccountId:2,categoryId:null,payeeId:null,amountCents:1234,date:'2026-11-19',note:'Bargeld',createdAt:'2026-11-19T08:02:00Z'}];
  s.settings={defaultAccountId:1,theme:'dark',autoBackup:{enabled:true,frequency:'weekly',keep:4}};
  return s;
}
test('FieLanzen gzip .backup fully restores balances, settings and UTF-8, not a renamed JSON file',async()=>{
  const s=example(),before=accountBalance(s,1);
  const zipped=await encodeAutomaticBackup(s);
  assert.deepEqual([...zipped.subarray(0,2)],[31,139]);
  assert.equal(APP_BACKUP_EXTENSION,'.backup');
  const restored=(await parseAutomaticBackup(new Blob([zipped]))).snapshot;
  assert.equal(restored.bookings.length,2);
  assert.equal(restored.bookings[0].note,'Äpfel, Birnen');
  assert.equal(accountBalance(restored,1),before);
  assert.deepEqual(restored.settings,{...s.settings,autoBackup:{...s.settings.autoBackup,time:'03:00'}});
  assert.ok(encodeBase64(zipped).startsWith('H4sI'));
});
test('manual JSON v4 is still readable and older settings without auto backup unchanged',async()=>{
  const s=example();delete s.settings.autoBackup;
  assert.deepEqual((await parseAutomaticBackup(new Blob([exportBackup(s)]))).snapshot.settings,s.settings);
  const legacy=JSON.parse(exportBackup(s));legacy.schemaVersion=3;
  assert.deepEqual(parseBackup(JSON.stringify(legacy)).snapshot.settings,s.settings);
});
test('untrusted configuration rejects unsafe retention and invalid intervals',()=>{
  const s=example();
  for(const bad of [{enabled:true,frequency:'hourly',keep:7},{enabled:true,frequency:'daily',keep:0},{enabled:'yes',frequency:'daily',keep:7},{enabled:true,frequency:'weekly',keep:51}]){
    const corrupted={...s,settings:{...s.settings,autoBackup:bad}};
    assert.throws(()=>validateSnapshot(corrupted),/Sicherung ungültig/);
  }
});
test('Android SAF folder selection, periodic WorkManager and atomic snapshots are included as native sources',()=>{
  const plugin=src('native/de/fielanzen/offline/FieLanzenAutoBackupPlugin.java');
  const worker=src('native/de/fielanzen/offline/AutoBackupWorker.java');
  const files=src('native/de/fielanzen/offline/AutoBackupFiles.java');
  const config=src('scripts/configure-android.py');
  for(const marker of ['Intent.ACTION_OPEN_DOCUMENT_TREE','takePersistableUriPermission','@ActivityCallback','ExistingPeriodicWorkPolicy.KEEP','PeriodicWorkRequest','stageBackup','writeNow'])assert.ok(plugin.includes(marker),marker);
  assert.match(worker,/extends Worker/);
  for(const marker of ['AtomicFile','isDue','fromTreeUri','createFile','getPersistedUriPermissions','FieLanzen-Financisto-','\.backup'])assert.ok(files.includes(marker),marker);
  assert.match(config,/FieLanzenAutoBackupPlugin/);
  assert.match(config,/work-runtime:2\.10\.5/);
});
test('native backup plugin is statically bundled into Android; browser preview stays independent',()=>{
  const main=src('src/main.ts');
  assert.match(main,/^import \{NativeAutoBackup\} from/m);
  assert.doesNotMatch(main,/backupPluginPromise/);
  const html=src('preview/index.html');
  assert.match(html,/src="\.\/src\/main\.js\?v=alpha24-1"/);
  assert.ok(existsSync(new URL('../preview/src/automatic-backup.js',import.meta.url)));
});
