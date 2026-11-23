import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';
import {exportBackup,parseBackup} from '../preview/src/backup.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const example=()=>{
 const s=emptySnapshot();
 s.accounts=[{id:1,name:'Giro',openingCents:100000},{id:2,name:'Bar',openingCents:5000}];
 s.categories=[{id:1,name:'Lebensmittel',kind:'expense'},{id:2,name:'Gehalt',kind:'income'}];
 s.payees=[{id:1,name:'Bäckerei Weiß'}];
 s.bookings=[
  {id:1,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:1,amountCents:2335,date:'2026-11-19',note:'Äpfel',createdAt:'2026-11-19T08:00:00Z'},
  {id:2,type:'transfer',accountId:1,otherAccountId:2,categoryId:null,payeeId:null,amountCents:2000,date:'2026-11-19',note:'Bargeld',createdAt:'2026-11-19T08:00:00Z'},
  {id:3,type:'income',accountId:1,otherAccountId:null,categoryId:2,payeeId:null,amountCents:30000,date:'2026-11-19',note:'Einkommen',createdAt:'2026-11-19T08:00:00Z'}
 ];
 s.settings={defaultAccountId:2,theme:'dark',autoBackup:{enabled:true,frequency:'daily',keep:5}};
 return s;
};
test('automatic and immediate .backup both call one validated Financisto exporter, no separate test export UI',()=>{
 const main=read('src/main.ts');
 assert.match(main,/async function stageCurrentSnapshot[\s\S]*?const \{bytes\}=await exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.match(main,/async function backupNow[\s\S]*?const \{bytes,summary\}=await exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.doesNotMatch(main,/Financisto-kompatibler Export \(Testfunktion\)|export-financisto-new|financisto-export-template-input/);
 assert.match(main,/<h2>Datensicherung<\/h2>/);
 assert.match(main,/<details class="audit-list"><summary><strong>Erweitert: vollständige FieLanzen-Sicherung \(JSON\)<\/strong><\/summary>/);
 assert.equal((main.match(/data-action="choose-backup"/g)||[]).length,1);
 assert.match(main,/if\(marker\[0\]===0x1f&&marker\[1\]===0x8b\)/);
 assert.match(main,/await importLegacyFile\(file\)/);
});
test('a fresh independent user can create a real gzip .backup with balances and transactions preserved',async()=>{
 const original=example();
 const {bytes,summary}=await exportFinancistoCompatible(original);
 assert.equal(summary.bookings,3);
 assert.deepEqual([...bytes.slice(0,2)],[31,139]);
 const text=gunzipSync(bytes).toString('utf8');
 assert.match(text,/^PACKAGE:ru\.orangesoftware\.financisto\nVERSION_CODE:117\nVERSION_NAME:1\.8\.2\nDATABASE_VERSION:217\nFIELANZEN_EXPORTER_VERSION:20\n#START/);
 const parsed=convertLegacyTables(parseLegacyText(text)).snapshot;
 assert.equal(parsed.bookings.length,3);
 assert.equal(parsed.bookings.find(b=>b.id===1).note,'Äpfel');
 for(const a of original.accounts) assert.equal(accountBalance(parsed,a.id),accountBalance(original,a.id));
 assert.equal(parsed.bookings.find(b=>b.id===2).otherAccountId,2);
});
test('FieLanzen-specific settings and rules remain in the separate full JSON backup',()=>{
 const s=example();
 assert.deepEqual(parseBackup(exportBackup(s)).snapshot.settings,{...s.settings,autoBackup:{...s.settings.autoBackup,time:'03:00'}});
});
test('Downloads destination really writes on first click, not merely selects a path',()=>{
 const main=read('src/main.ts');
 const method=main.slice(main.indexOf('async function useDownloadsBackupFolder'),main.indexOf('async function selectBackupFolder'));
 assert.match(method,/useDownloadsFolder\(\)/);
 assert.match(method,/await backupNow\(\)/);
 const java=read('native/de/fielanzen/offline/DownloadsBackupFiles.java');
 assert.match(java,/MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
 assert.match(java,/MediaStore\.MediaColumns\.RELATIVE_PATH, FOLDER_PATH/);
 assert.match(java,/IS_PENDING, 0/);
 assert.match(java,/Downloads\/FieLanzen/);
});
test('Alpha12 archives are neither overwritten nor pruned by Alpha13 rotation; scheduled timestamp resets',()=>{
 const native=read('native/de/fielanzen/offline/AutoBackupFiles.java');
 const downloads=read('native/de/fielanzen/offline/DownloadsBackupFiles.java');
 assert.match(native,/PREFIX = "FieLanzen-Financisto-"/);
 assert.match(downloads,/PREFIX = "FieLanzen-Financisto-"/);
 assert.match(native,/remove\("last_export_epoch"\)/);
 assert.match(native,/financisto_format_v20/);
 assert.match(native,/latest-financisto\.backup/);
 assert.match(native,/\(\"downloads\"\.equals\(p\.getString\("destination"/);
});
test('new version is installable over existing app without a SQLite schema reset',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'0.1.0-alpha.25');
 assert.match(read('scripts/configure-android.py'),/versionCode 25/);
 assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
 assert.match(read('scripts/build-android-vm.sh'),/VERSION="0\.1\.0-alpha\.25"/);
 assert.match(read('src/database.ts'),/CREATE TABLE IF NOT EXISTS/);
 assert.match(read('.gitignore'),/\*\.backup/);
});
