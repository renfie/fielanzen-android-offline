import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {emptySnapshot} from '../preview/src/types.js';
import {parseBackup,exportBackup,validateSettings} from '../preview/src/backup.js';
import {normalizeDashboardUrl,probeDashboard} from '../preview/src/dashboard-api.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('legacy alpha17 backup gets default 03:00 and explicit hour survives roundtrip',()=>{
  const snapshot=emptySnapshot();snapshot.settings.autoBackup={enabled:true,frequency:'daily',keep:7};
  const old=parseBackup(exportBackup(snapshot)).snapshot;
  assert.equal(old.settings.autoBackup.time,'03:00');
  snapshot.settings.autoBackup={enabled:true,frequency:'daily',keep:7,time:'17:35'};
  snapshot.settings.dashboard={url:'https://finance.example.de'};
  const restored=parseBackup(exportBackup(snapshot)).snapshot;
  assert.equal(restored.settings.autoBackup.time,'17:35');
  assert.equal(restored.settings.dashboard.url,'https://finance.example.de');
  for(const time of ['24:00','12:60','03','abc','00:99']){
    assert.throws(()=>validateSettings({...snapshot.settings,autoBackup:{...snapshot.settings.autoBackup,time}},[]),/Sicherung ungültig/);
  }
});

test('dashboard addresses reject credentials, HTTP, paths or query strings',()=>{
  assert.equal(normalizeDashboardUrl(' https://finance.example.de/ '),'https://finance.example.de');
  for(const url of ['http://finance.example.de','https://alice:secret@finance.example.de','https://finance.example.de/something','https://finance.example.de?token=secret','https://finance.example.de/#x'])
    assert.throws(()=>normalizeDashboardUrl(url));
});

test('dashboard probe only reads two endpoints and does not start server mode',async()=>{
  const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
  const urls=[];globalThis.window={};
  globalThis.fetch=async url=>{urls.push(String(url));return {status:String(url).endsWith('/healthz')?200:404,text:async()=>String(url).endsWith('/healthz')?'ok':'not found'};};
  try{
    const result=await probeDashboard('https://finance.example.de');
    assert.equal(result.online,true);assert.equal(result.apiReady,false);
    assert.deepEqual(urls,['https://finance.example.de/healthz','https://finance.example.de/api/mobile/v1/capabilities']);
  }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
  const main=source('src/main.ts');
  assert.match(main,/data-action="dashboard-connect"/);
  assert.doesNotMatch(main,/data-action="save-dashboard-url"/);
  assert.doesNotMatch(main,/data-action="probe-dashboard"/);
  assert.match(main,/id="dashboard-advanced"/);
  assert.doesNotMatch(main,/fetch\([^\n]+bookings/);
});

test('one save action instead of implicit changes and native catch-up',()=>{
  const main=source('src/main.ts');
  assert.match(main,/data-action="save-auto-backup-settings"/);
  assert.match(main,/id="auto-backup-time" type="time"/);
  assert.match(main,/await backupNow\(\)/);
  assert.match(main,/runDueNow\(\)/);
  assert.match(main,/lastAutomaticAt/);
  assert.match(source('native/de/fielanzen/offline/FieLanzenAutoBackupPlugin.java'),/CANCEL_AND_REENQUEUE/);
  assert.match(source('native/de/fielanzen/offline/AutoBackupFiles.java'),/last_auto_epoch/);
  assert.match(source('native/de/fielanzen/offline/AutoBackupFiles.java'),/next_due_epoch/);
  assert.match(source('native/de/fielanzen/offline/AutoBackupWorker.java'),/AutoBackupFiles.save/);
});

test('native calendar schedule: daily/weekly/monthly, DST and overdue jobs',()=>{
  const out=mkdtempSync(join(tmpdir(),'fielanzen-schedule-'));
  try{
    execFileSync('javac',['-d',out,new URL('../native/de/fielanzen/offline/BackupSchedule.java',import.meta.url).pathname,
      new URL('./BackupScheduleTest.java',import.meta.url).pathname],{stdio:'pipe'});
    const output=execFileSync('java',['-cp',out,'de.fielanzen.offline.BackupScheduleTest'],{encoding:'utf8'});
    assert.match(output,/10 Java schedule assertions passed/);
  }finally{rmSync(out,{recursive:true,force:true});}
});
