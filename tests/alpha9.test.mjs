import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {calculateBalances,bookingTotals,monthOffset,monthlyTrend,exportBookingsCsv,lastPayeeUsage,inspectSnapshot,inventoryAsText} from '../preview/src/analysis.js';
import {parseBackup,exportBackup} from '../preview/src/backup.js';
const src=(name)=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
function state(){
 const s=emptySnapshot();
 s.accounts=[{id:1,name:'Giro',openingCents:100000},{id:2,name:'Bargeld',openingCents:2000}];
 s.categories=[{id:1,name:'Lebensmittel',kind:'expense'},{id:2,name:'Lohn',kind:'income'}];
 s.payees=[{id:1,name:'Bäcker',},{id:2,name:'Firma'}];
 const row=(id,type,amountCents,accountId,otherAccountId,categoryId,payeeId,date,note='')=>({id,type,amountCents,accountId,otherAccountId,categoryId,payeeId,date,note,createdAt:'2026-11-19T12:00:00.000Z'});
 s.bookings=[row(10,'income',30000,1,null,2,2,'2026-10-23'),row(11,'expense',2500,1,null,1,1,'2026-11-19'),row(12,'transfer',10000,1,2,null,null,'2026-11-19'),row(13,'expense',0,2,null,1,null,'2026-11-19'),row(14,'expense',500,2,null,1,1,'2026-12-01')];
 return s;
}
test('15,000 transactions: optimized account balance aggregation matches original calculation',()=>{
 const s=state();
 for(let i=0;i<15000;i++)s.bookings.push({...s.bookings[i%5],id:100+i});
 const map=calculateBalances(s);
 for(const a of s.accounts)assert.equal(map.get(a.id),accountBalance(s,a.id));
 assert.equal(s.bookings.length,15005);
});
test('income, expenses and transfers remain distinct; zeros are allowed',()=>{
 const s=state();
 assert.deepEqual(bookingTotals(s.bookings),{incomeCents:30000,expenseCents:3000,transferCents:10000,count:5});
 const t=monthlyTrend(s.bookings,'2026-11',2);
 assert.deepEqual(t.map(x=>x.month),['2026-10','2026-11']);
 assert.equal(t[0].incomeCents,30000);
 assert.equal(t[1].expenseCents,2500);
 assert.equal(t[1].transferCents,10000);
 assert.equal(t[1].count,3);
 assert.equal(monthOffset('2026-01',-1),'2025-12');
 assert.equal(monthOffset('2026-12',1),'2027-01');
 assert.throws(()=>monthOffset('2026-99',1),/Monat/);
});
test('CSV is Excel-friendly, uses filters output only, and escapes untrusted formula values',()=>{
 const s=state();
 s.payees[0].name='=HYPERLINK("https://bad.example","Click")';
 s.bookings[1].note='=1+1;"angriff"\nZeile 2';
 const out=exportBookingsCsv([s.bookings[1]],s);
 assert.ok(out.startsWith('\uFEFF"Datum";"Buchungs-ID";'));
 assert.match(out,/"'-?=HYPERLINK\(""https:\/\/bad.example"",""Click""\)"/);
 assert.match(out,/"'=1\+1;""angriff""\nZeile 2"/);
 assert.match(out,/"-25,00"/);
 assert.equal(out.split('2026-11-19').length-1,1);
 assert.ok(out.endsWith('\r\n'));
});
test('audit is read-only: future, placeholder, null amount, orphan details',()=>{
 const s=state();
 s.payees.push({id:123,name:'Unbekannter Empfänger (ID 123)'});
 const before=JSON.stringify(s);
 const check=inspectSnapshot(s,'2026-11-19');
 assert.equal(check.totals.bookings,5);
 assert.deepEqual(check.balances,calculateBalances(s) && s.accounts.map(a=>({id:a.id,name:a.name,cents:calculateBalances(s).get(a.id)})));
 assert.ok(check.issues.some(x=>x.title.includes('1 Nullbuchung')));
 assert.ok(check.issues.some(x=>x.title.includes('1 Buchungen mit künftigem Datum')));
 assert.ok(check.issues.some(x=>x.title.includes('1 Platzhalter-Empfänger')));
 assert.equal(before,JSON.stringify(s));
 const text=inventoryAsText(check,'2026-11-19');
 assert.match(text,/Giro/);
 assert.match(text,/Buchungen: 5/);
 s.bookings[0].payeeId=999;
 assert.ok(inspectSnapshot(s,'2026-11-19').issues.some(x=>x.kind==='warning'));
});
test('payee frequency optimization recognizes largest latest booking ID',()=>{
 const map=lastPayeeUsage(state().bookings);
 assert.equal(map.get(1),14);
 assert.equal(map.get(2),10);
});
test('Alpha 8 backups remain byte-compatible with new milestone; no schema migration',()=>{
 const s=state();
 const before=exportBackup(s);
 const after=parseBackup(before);
 assert.equal(after.snapshot.bookings.length,5);
 assert.deepEqual(calculateBalances(after.snapshot),calculateBalances(s));
 assert.match(src('src/database.ts'),/indexedDB\.open\('fielanzen-offline-preview', 4\)/);
 assert.match(src('src/database.ts'),/CREATE TABLE IF NOT EXISTS app_settings/);
});
test('new UI controls and version 13 sources consistent; GitHub not required',()=>{
 const app=src('src/main.ts');
 const pkg=JSON.parse(src('package.json'));
 assert.equal(pkg.version,'0.1.0-alpha.25');
 assert.ok(app.includes("filter !== 'all' && !bookingDateFrom && !bookingDateTo"));
 for(const target of ['export-bookings-csv','booking-date-from','booking-date-to','booking-category-filter','report-account-filter','go-data-check','export-data-check','mini-summary'])assert.ok(app.includes(target),`missing ${target}`);
 assert.ok(src('scripts/configure-android.py').includes("versionCode 25"));
 assert.ok(src('scripts/build-android-vm.sh').includes('VERSION="0.1.0-alpha.25"'));
 assert.ok(existsSync(new URL('../preview/src/analysis.js',import.meta.url)));
 assert.equal(src('preview/style.css'),src('style.css'),'static preview CSS must match Android source');
});
