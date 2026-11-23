import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {calculateBalances} from '../preview/src/analysis.js';
import {planAccountReconciliation} from '../preview/src/reconcile.js';
const src=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const example=()=>{
 const s=emptySnapshot();
 s.accounts=[{id:1,name:'Giro',openingCents:100000},{id:2,name:'Bargeld',openingCents:5000}];
 s.categories=[{id:1,name:'Einkauf',kind:'expense'}];
 s.bookings=[
  {id:1,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:null,amountCents:10000,date:'2026-11-18',note:'alt',createdAt:'2026-11-18T10:00:00.000Z'},
  {id:2,type:'transfer',accountId:1,otherAccountId:2,categoryId:null,payeeId:null,amountCents:3000,date:'2026-11-19',note:'umbuchung',createdAt:'2026-11-19T10:00:00.000Z'},
  {id:3,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:null,amountCents:20000,date:'2026-12-01',note:'zukünftig',createdAt:'2026-11-19T10:00:00.000Z'}
 ];return s;
};
test('current balances ignore future transactions while retaining their records',()=>{
 const s=example();const before=JSON.stringify(s);
 assert.equal(accountBalance(s,1,'2026-11-19'),87000);
 assert.equal(calculateBalances(s,'2026-11-19').get(2),8000);
 assert.equal(accountBalance(s,1),67000);
 assert.equal(JSON.stringify(s),before);
});
test('account correction is planned as tracked adjustment booking, without modifying history',()=>{
 const s=example();const initial=JSON.stringify(s);
 const more=planAccountReconciliation(s,1,88000,'2026-11-19','Bankabgleich');
 assert.equal(more.kind,'income');assert.equal(more.amountCents,1000);
 assert.equal(more.categoryName,'Kontostandskorrektur (Zugang)');assert.equal(more.categoryId,null);
 const less=planAccountReconciliation(s,1,85000,'2026-11-19','');
 assert.equal(less.kind,'expense');assert.equal(less.amountCents,2000);
 assert.equal(less.note,'Kontostand abgeglichen');
 assert.equal(planAccountReconciliation(s,1,87000,'2026-11-19',''),null);
 assert.equal(JSON.stringify(s),initial);
});
test('reconciliation blocks missing accounts and invalid inputs',()=>{
 const s=example();assert.throws(()=>planAccountReconciliation(s,9,1,'2026-11-19',''),/Konto/);
 assert.throws(()=>planAccountReconciliation(s,1,NaN,'2026-11-19',''),/gültig/);
 assert.throws(()=>planAccountReconciliation(s,1,80000,'2026-11-19','z'.repeat(501)),/500/);
});
test('compact balances and filters default closed, quick search stays outside hidden filters',()=>{
 const srcCode=src('src/main.ts');
 assert.match(srcCode,/let bookingFiltersOpen=false/);assert.match(srcCode,/let homeBalancesOpen=false/);
 assert.match(srcCode,/id="home-account-balances" \$\{homeBalancesOpen\?'open':''\}/);
 assert.match(srcCode,/id="booking-advanced-filters" class="filter-disclosure" \$\{bookingFiltersOpen\?'open':''\}/);
 const quick=srcCode.indexOf('id="booking-quick-search"');const advanced=srcCode.indexOf('id="booking-advanced-filters"');
 assert.ok(quick>=0 && advanced>quick);
 assert.match(srcCode,/bookingPeriodExplicit/);
 assert.match(srcCode,/case 'reconcile-account':reconcileAccountDialog\(\)/);
 assert.match(srcCode,/storage.reconcileAccount\(id,amount,today\(\)/);
 assert.match(src('src/database.ts'),/beginTransaction\(\)/);
});
