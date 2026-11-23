import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('startup paints before Android backup/plugin synchronization and avoids duplicate full reads',()=>{
  const main=read('src/main.ts');
  const start=main.slice(main.lastIndexOf('(async()=>{'));
  const firstRead=start.indexOf('state=await storage.read()');
  const firstRender=start.indexOf('render();',firstRead);
  const autoSync=start.indexOf('void syncNativeBackup()',firstRender);
  const dueCheck=start.indexOf('void runDue()',firstRender);
  assert.ok(firstRead>=0 && firstRender>firstRead,'must show stored data');
  assert.ok(autoSync>firstRender,'native backup must never block first paint');
  assert.ok(dueCheck>firstRender,'recurring check must never block first paint');
  assert.doesNotMatch(start.slice(0,firstRender),/await syncNativeBackup|await storage\.runDue/);
});

test('native recurring rules use an indexed-size gate before loading the 15k booking ledger',()=>{
  const db=read('src/database.ts');
  const native=db.slice(db.indexOf('class NativeStorage implements Storage'));
  const recurring=native.slice(native.indexOf('async runDue(until:string)'),native.indexOf('async saveImportReport('));
  assert.match(recurring,/SELECT 1 AS due FROM recurring_rules WHERE active=1 AND next_on<=\? LIMIT 1/);
  assert.ok(recurring.indexOf('if(!due.length)return 0')<recurring.indexOf('const snapshot=await this.read()'));
  assert.match(read('src/main.ts'),/if\(!count\)return;\s*state=await storage\.read\(\)/);
});

test('folder selection shows an error even with no folder selected',()=>{
  const main=read('src/main.ts');
  assert.match(main,/const warning=issue\?`<span class="warning" role="alert">/);
  assert.match(main,/if\(backupStatus===null\)return `<strong>Android-Sicherungsdienst noch nicht bestätigt/);
  assert.match(main,/if\(!backupStatus\.selected\)return `<strong>Kein beschreibbares Sicherungsziel bestätigt/);
  assert.match(main,/isPluginAvailable\('FieLanzenAutoBackup'\)/);
  assert.match(main,/Android-Ordnerauswahl wird geöffnet/);
  const native=read('native/de/fielanzen/offline/FieLanzenAutoBackupPlugin.java');
  assert.match(native,/catch \(RuntimeException error\)/);
  assert.match(native,/call\.reject\("Android-Ordnerauswahl konnte nicht geöffnet werden:/);
});
