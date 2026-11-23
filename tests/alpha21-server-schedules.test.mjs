import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {parseBooking,parseBookings,readBookingAmount,validateRemoteDraft,parseAccounts,parseCategories} from '../preview/src/dashboard-protocol.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {convertLegacyTables,parseLegacyText} from '../preview/src/financisto.js';
import {parseBackup,exportBackup} from '../preview/src/backup.js';
import {auditOriginalFinancisto} from '../preview/src/financisto-audit.js';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const booking=(id,kind,amount)=>({id,revision:'rev-1',kind,date:'2026-11-22',account_id:1,
  category_id:kind==='income'?3:2,amount_minor:amount,payee_title:'Test',note:''});
function setup(){
 const s=emptySnapshot();
 s.accounts=[{id:1,name:'Giro',openingCents:12655},{id:2,name:'Bargeld',openingCents:500}];
 s.categories=[{id:2,name:'Einkäufe',kind:'expense'},{id:3,name:'Gehalt',kind:'income'}];
 s.payees=[{id:4,name:'Kiosk'}];
 s.bookings=[{id:11,type:'expense',accountId:1,otherAccountId:null,categoryId:2,payeeId:4,amountCents:1250,
   date:'2026-11-22',note:'Test',createdAt:'2026-11-22T12:00:00.000Z'}];
 return s;
}
function rule(id,frequency='monthly',day=15){
 const startOn=`2026-12-${String(day).padStart(2,'0')}`;
 return {id,title:`Regel ${id}`,type:'expense',accountId:1,otherAccountId:null,categoryId:2,payeeId:4,
 amountCents:1000,note:'Terminiert',frequency,interval:1,startOn,nextOn:startOn,dayOfMonth:day,
 endOn:null,maxRuns:null,runs:0,active:false};
}
test('signed expense and transfer API values load with exact magnitude without changing writes',()=>{
 assert.equal(readBookingAmount(-12501,'expense',18),12501);
 assert.equal(readBookingAmount('-5000','transfer',19),5000);
 assert.equal(parseBookings({bookings:[booking(1,'expense',-12501)]}).items[0].amountMinor,12501);
 assert.equal(parseBooking({...booking(1,'income',65000)}).amountMinor,65000);
 assert.equal(parseBooking({...booking(1,'income','-65000')}).amountMinor,65000); // signed ledger input
 assert.throws(()=>readBookingAmount(null,'expense',18),/Buchung #18.*fehlt/);
 assert.throws(()=>readBookingAmount('1.25','expense',18),/Buchung #18.*Cent/);
 assert.throws(()=>readBookingAmount(Infinity,'expense',18),/Cent/);
 assert.throws(()=>readBookingAmount(Number.MAX_SAFE_INTEGER+1,'expense',18),/Cent/);
 const accounts=parseAccounts({accounts:[{id:1,name:'Giro',currency:'EUR',symbol:'€',decimals:2,balance_minor:0,active:true}]});
 const categories=parseCategories({categories:[{id:2,name:'Einkäufe',kind:'expense'}]});
 const draft={kind:'expense',date:'2026-11-22',account_id:1,category_id:2,amount_minor:100,payee_title:'',note:''};
 assert.equal(validateRemoteDraft(draft,accounts,categories).amount_minor,100);
 assert.throws(()=>validateRemoteDraft({...draft,amount_minor:-100},accounts,categories),/ungültige Betrag/);
});
test('scheduled templates always included, with is_template 2 and recurrence',async()=>{
 const s=setup();s.recurringRules=[rule(22)];
 const ordinary=gunzipSync((await exportFinancistoCompatible(s)).bytes).toString('utf8');
 assert.match(ordinary,/is_template:2/);
 const result=await exportFinancistoCompatible(s,undefined,{includeScheduled:true});
 const content=gunzipSync(result.bytes).toString('utf8');
 assert.equal((content.match(/is_template:2/g)||[]).length,1);
 assert.match(content,/template_name:Regel 22/);
 assert.match(content,/recurrence:2026-12-15T12:00:00~MONTHLY:count@1#interval@1#monthly_pattern_0@EVERY_NTH_DAY#monthly_pattern_params_0@15#~INDEFINETELY:null/);
 assert.match(content,/status:PN/);
 assert.match(content,/last_recurrence:[1-9]\d{12}/); // suppress historical catch-up
 assert.equal(result.summary.scheduledExported,1);
 assert.equal(result.summary.inactiveScheduledIncluded,1);
 assert.equal(result.summary.bookings,s.bookings.length);
 assert.equal(auditOriginalFinancisto(content).transactions,4); // booking, two opening balances, template
 const restored=convertLegacyTables(parseLegacyText(content)).snapshot;
 assert.equal(restored.bookings.length,s.bookings.length); // template never posted to ledger
 for(const a of s.accounts)assert.equal(accountBalance(restored,a.id),accountBalance(s,a.id));
});
test('weekly and yearly schedules produce Financisto-recognized recurrence syntax',async()=>{
 const s=setup();s.recurringRules=[rule(23,'weekly',18),rule(24,'yearly',3)];
 const plain=gunzipSync((await exportFinancistoCompatible(s,undefined,{includeScheduled:true})).bytes).toString('utf8');
 assert.match(plain,/~WEEKLY:days@FRI#interval@1#~INDEFINETELY:null/); // December 18, 2026 is Friday
 assert.match(plain,/~GEEKY:interval@FREQ=YEARLY;INTERVAL=1#~INDEFINETELY:null/);
});
test('month-end 31 and bounded rules are explicit; unsafe 29/30 fail closed',async()=>{
 const s=setup();s.recurringRules=[rule(22,'monthly',31)];
 let plain=gunzipSync((await exportFinancistoCompatible(s,undefined,{includeScheduled:true})).bytes).toString('utf8');
 assert.match(plain,/monthly_pattern_params_0@LAST-DAY#monthly_pattern_0@SPECIFIC_DAY/);
 s.recurringRules=[rule(23,'monthly',29)];
 await assert.rejects(()=>exportFinancistoCompatible(s,undefined,{includeScheduled:true}),/Regel-ID 23.*29/);
 const r=rule(24);r.maxRuns=3;r.runs=1;s.recurringRules=[r];
 plain=gunzipSync((await exportFinancistoCompatible(s,undefined,{includeScheduled:true})).bytes).toString('utf8');
 assert.match(plain,/~EXACTLY_TIMES:count@2#/);
});
test('old backups restore with the schedule option off; option stays only in local FieLanzen JSON backup',()=>{
 const s=setup();const old=exportBackup(s);assert.equal(parseBackup(old).snapshot.settings.exportScheduledToFinancisto,undefined);
 s.settings.exportScheduledToFinancisto=true;
 const round=parseBackup(exportBackup(s));assert.equal(round.snapshot.settings.exportScheduledToFinancisto,true);
 assert.deepEqual(round.snapshot.bookings,s.bookings);
});
test('authenticated session and bookings are handled as separate outcomes; no local-data fallback',()=>{
 const main=file('src/main.ts');
 assert.match(main,/remote\.session=session/);
 assert.match(main,/API-Schlüssel gültig, aber Serverdaten konnten nicht gelesen werden/);
 assert.match(main,/Servermodus ist nicht aktiviert/);
 const api=file('src/dashboard-api.ts');
 assert.match(api,/'Idempotency-Key':p\.idempotencyKey/);
 assert.match(api,/headers\['If-Match'\]=p\.ifMatch/);
});

test('strict original-Financisto SQLite import keeps templates outside ledger balances',async()=>{
 const s=setup();s.recurringRules=[rule(22)];
 const plain=gunzipSync((await exportFinancistoCompatible(s,undefined,{includeScheduled:true})).bytes).toString('utf8');
 const expected={1:accountBalance(s,1),2:accountBalance(s,2)};
 const r=spawnSync('python3',[new URL('./verify_original_financisto_sqlite.py',import.meta.url).pathname],{
   input:JSON.stringify({plain,expectedCounts:{currency:1,account:2,category:2,payee:1,transactions:4},expectedBalances:expected}),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
});
test('large 14,959-booking export with seven scheduled templates preserves counts and balances',async()=>{
 const s=setup();s.bookings=[];
 for(let id=1;id<=14959;id++)s.bookings.push({id,type:'income',accountId:1,otherAccountId:null,
   categoryId:3,payeeId:null,amountCents:25,date:'2026-11-22',note:'Synthetische Testdaten',createdAt:'2026-11-22T12:00:00.000Z'});
 s.recurringRules=Array.from({length:7},(_,i)=>rule(20000+i,'monthly',i+1));
 const before=accountBalance(s,1);
 const result=await exportFinancistoCompatible(s,undefined,{includeScheduled:true});
 const plain=gunzipSync(result.bytes).toString('utf8');
 assert.equal(result.summary.bookings,14959);
 assert.equal(result.summary.scheduledExported,7);
 assert.equal((plain.match(/is_template:2\n/g)||[]).length,7);
 const restored=convertLegacyTables(parseLegacyText(plain)).snapshot;
 assert.equal(restored.bookings.length,14959);
 assert.equal(accountBalance(restored,1),before);
 assert.equal(accountBalance(restored,2),accountBalance(s,2));
});
