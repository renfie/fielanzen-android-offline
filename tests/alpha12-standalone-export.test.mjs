import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {expandGzip,parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {exportBackup,parseBackup} from '../preview/src/backup.js';
const file = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
function fresh(){
 const s=emptySnapshot();
 s.accounts=[{id:4,name:'Giro',openingCents:30000},{id:7,name:'Bar',openingCents:900}];
 s.categories=[{id:21,name:'Einkäufe',kind:'expense'},{id:22,name:'Lohn',kind:'income'},{id:23,name:'Gleicher Name',kind:'income'},{id:24,name:'Gleicher Name',kind:'expense'}];
 s.payees=[{id:11,name:'Bäcker & Söhne'}];
 return s;
}
const booking=(id,type,accountId,otherAccountId,categoryId,payeeId,amountCents,note='',date='2026-11-19')=>({id,type,accountId,otherAccountId,categoryId,payeeId,amountCents,date,note,createdAt:`${date}T12:00:00.000Z`});
test('standalone financial export succeeds for first-time user without template; two accounts, no transactions',async()=>{
 const s=fresh();
 const out=await exportFinancistoCompatible(s);
 assert.equal(out.summary.originalMatches,0);
 assert.equal(out.summary.bookings,0);
 assert.equal(out.bytes[0],31);assert.equal(out.bytes[1],139);
 const plain=gunzipSync(out.bytes).toString('utf8');
 assert.match(plain,/^PACKAGE:ru\.orangesoftware\.financisto\nVERSION_CODE:117\nVERSION_NAME:1\.8\.2\nDATABASE_VERSION:217\nFIELANZEN_EXPORTER_VERSION:20\n#START\n/);
 assert.equal((plain.match(/\$ENTITY:account\n/g)||[]).length,2);
 assert.equal((plain.match(/\$ENTITY:category\n/g)||[]).length,4);
 const parsed=convertLegacyTables(parseLegacyText(plain)).snapshot;
 assert.equal(parsed.bookings.length,0);
 for(const account of s.accounts)assert.equal(accountBalance(parsed,account.id),accountBalance(s,account.id));
});
test('from-scratch transfer, income, expense, umlauts and balances match after import',async()=>{
 const s=fresh();
 s.bookings=[
  booking(1,'expense',4,null,21,11,150,'Frische Brötchen'),
  booking(3,'income',4,null,22,null,80000,'Gehalt für November'),
  booking(4,'transfer',4,7,null,null,1200,'Zur Kasse'),
  booking(8,'expense',7,null,24,null,5,'Ä Ö Ü ß'),
  booking(9,'income',4,null,23,11,500,'Sonderzahlung','2026-12-01')
 ];
 const result=await exportFinancistoCompatible(s);
 const compressed=new File([result.bytes],'new.backup',{type:'application/gzip'});
 const reimport=convertLegacyTables(parseLegacyText(await expandGzip(await compressed.arrayBuffer()))).snapshot;
 assert.equal(reimport.bookings.length,5);
 assert.equal(reimport.bookings.find(x=>x.id===8).note,'Ä Ö Ü ß');
 for(const acc of s.accounts)assert.equal(accountBalance(s,acc.id),accountBalance(reimport,acc.id));
 assert.equal(reimport.bookings.find(x=>x.id===4).otherAccountId,7);
 assert.equal(reimport.bookings.find(x=>x.id===9).date,'2026-12-01');
 assert.deepEqual(s.bookings.map(x=>x.id),reimport.bookings.map(x=>x.id));
});
test('standalone export includes no private fixture and never requires source archive',async()=>{
 const s=fresh();s.bookings=[booking(1,'expense',4,null,21,null,100)];
 const bytes=(await exportFinancistoCompatible(s)).bytes;
 const plain=gunzipSync(bytes).toString('utf8');
 assert.doesNotMatch(plain,/custom_legacy_extension|secret_extension|unknown_plugin/);
 const main=file('src/main.ts');
 assert.match(main,/const \{bytes\}=await exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.match(main,/const \{bytes,summary\}=await exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.doesNotMatch(main,/data-action="export-financisto-new"/);
 assert.match(file('src/financisto-export.ts'),/exportFinancistoStandalone/);
});
test('standalone rejects unsafe notes and missing accounts, while complete FieLanzen backup still works',async()=>{
 const empty=emptySnapshot();
 assert.equal(parseBackup(exportBackup(empty)).snapshot.accounts.length,0);
 await assert.rejects(()=>exportFinancistoCompatible(empty),/mindestens ein Konto/);
 const s=fresh();s.bookings=[booking(1,'expense',4,null,21,null,100,'hello\nworld')];
 await assert.rejects(()=>exportFinancistoCompatible(s),/Zeilenumbruch/);
});
test('version, private-data exclusion and preferred Downloads fallback are wired for Alpha 13',()=>{
 assert.equal(JSON.parse(file('package.json')).version,'0.1.0-alpha.25');
 assert.match(file('scripts/configure-android.py'),/versionCode 25/);
 assert.match(file('scripts/build-android-vm.sh'),/VERSION="0\.1\.0-alpha\.25"/);
 assert.match(file('src/main.ts'),/Downloads\/FieLanzen als Ziel/);
 assert.match(file('src/main.ts'),/let accountsOpen=false/);
 assert.match(file('.gitignore'),/\*\.backup/);
});
