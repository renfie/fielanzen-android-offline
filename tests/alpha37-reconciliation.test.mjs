// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  reconciliationCapability,canReconcile,parseReconciliationAmount,formatReconciliationInput,
  reconciliationPreview,makeReconciliationPending,isReconciliationPending,parseReconciliationResult
} from '../preview/src/server-reconciliation.js';
import {parsePending,parseAccounts} from '../preview/src/dashboard-protocol.js';
import {emptyServerData,serverPageHtml} from '../preview/src/server-ui.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const currencyAccount=(decimals=2,balanceMinor=125000)=>({
  id:12,name:'Girokonto',currency:'EUR',symbol:'€',decimals,balanceMinor,
  projectedBalanceMinor:balanceMinor+300,active:true,includedInTotal:true
});
const session={financeMode:'web',access:'write',canWrite:true,role:'editor'};
const rawResult={
  success:true,account_id:12,currency:'EUR',decimals:2,
  previous_balance_minor:125000,actual_balance_minor:127500,change_minor:2500,
  booking_id:15432,unchanged:false,balance_minor:127500,projected_balance_minor:127800
};

test('Mobile-API capability requires strict true and authenticated editor/write/web rights',()=>{
 assert.equal(reconciliationCapability({features:{account_reconciliation:true}}),true);
 assert.equal(reconciliationCapability({features:{account_reconciliation:'true'}}),false);
 assert.equal(reconciliationCapability({features:{monthly_reports:true}}),false);
 assert.equal(canReconcile(session,true),true);
 for(const wrong of [
  {...session,financeMode:'import'}, {...session,access:'read'}, {...session,canWrite:false},
  {...session,role:'viewer'}
 ])assert.equal(canReconcile(wrong,true),false);
 assert.equal(canReconcile(session,false),false);
 assert.equal(canReconcile(null,true),false);
});

test('server account parsing retains signed today and projected balances with decimal count',()=>{
 const rows=parseAccounts({items:[
  {id:12,name:'Cash',currency:'JPY',symbol:'¥',decimals:0,balance_minor:-1500,projected_balance_minor:-1200,active:true},
  {id:13,name:'Depot',currency:'BHD',symbol:'BD',decimals:3,balance_minor:123456,projected_balance_minor:123457,active:true}
 ]});
 assert.equal(rows[0].balanceMinor,-1500);
 assert.equal(rows[0].projectedBalanceMinor,-1200);
 assert.equal(rows[1].decimals,3);
 assert.equal(rows[1].balanceMinor,123456);
});

test('German signed amounts are exact integers for 0-3 currency decimals',()=>{
 const cases=[
  [0,-1234,'-1.234'],
  [1,12345,'1.234,5'],
  [2,-125000,'-1.250,00'],
  [3,127501,'127,501']
 ];
 for(const [digits,cents,display] of cases){
  assert.equal(formatReconciliationInput(cents,digits),display);
  assert.equal(parseReconciliationAmount(display,digits),cents);
 }
 assert.equal(parseReconciliationAmount('0',0),0);
 assert.equal(parseReconciliationAmount('1.234,56',2),123456);
 assert.equal(parseReconciliationAmount('-0,001',3),-1);
 assert.equal(reconciliationPreview(-750,250),-1000);
 assert.equal(reconciliationPreview(250,250),0);
 for(const [amount,decimals] of [['1,23',1],['10,0',0],['1.23',2],['2,0000',3],['abc',2]])
  assert.throws(()=>parseReconciliationAmount(amount,decimals));
});

test('reconciliation pending uses dedicated POST endpoint, exact body and one UUID across reloads',()=>{
 const request=makeReconciliationPending('https://finance.example.com',currencyAccount(),127500,'Kontostand abgeglichen');
 assert.equal(request.method,'POST');
 assert.equal(request.path,'/api/mobile/v1/accounts/12/reconcile');
 assert.deepEqual(request.data,{actual_balance_minor:127500,expected_balance_minor:125000,note:'Kontostand abgeglichen'});
 assert.match(request.idempotencyKey,/^[0-9a-f]{8}-/i);
 assert.equal(isReconciliationPending(request),true);
 const stored=parsePending(JSON.stringify(request));
 assert.deepEqual(stored,request);
 assert.equal(stored.idempotencyKey,request.idempotencyKey);
 assert.throws(()=>parsePending(JSON.stringify({...request,data:{...request.data,amount_minor:2500}})));
 assert.throws(()=>makeReconciliationPending('https://finance.example.com',
   {...currencyAccount(),active:false},127500,''));
 assert.throws(()=>makeReconciliationPending('https://finance.example.com',currencyAccount(),
   127500,'x'.repeat(501)));
});

test('positive, negative, and no-op responses require consistent signed amounts',()=>{
 const positive=parseReconciliationResult(rawResult,12);
 assert.equal(positive.changeMinor,2500);
 assert.equal(positive.bookingId,15432);
 assert.equal(positive.projectedBalanceMinor,127800);
 const negative=parseReconciliationResult({...rawResult,previous_balance_minor:125000,
  actual_balance_minor:123000,change_minor:-2000,balance_minor:123000,projected_balance_minor:123300});
 assert.equal(negative.changeMinor,-2000);
 const unchanged=parseReconciliationResult({...rawResult,actual_balance_minor:125000,
  change_minor:0,balance_minor:125000,projected_balance_minor:125300,booking_id:null,unchanged:true});
 assert.equal(unchanged.bookingId,null);
 assert.equal(unchanged.unchanged,true);
 assert.throws(()=>parseReconciliationResult(rawResult,13));
 assert.throws(()=>parseReconciliationResult({...rawResult,balance_minor:127499}));
 assert.throws(()=>parseReconciliationResult({...rawResult,booking_id:null}));
 assert.throws(()=>parseReconciliationResult({...rawResult,change_minor:0}));
});

test('server overview offers same inline reconciliation control only with permission and capability',()=>{
 const base={...emptyServerData(),server:'https://finance.example.com',session,
  accounts:[currencyAccount()],reconciliationSupported:true,balancesOpen:true};
 const permitted=serverPageHtml(base,'home');
 assert.match(permitted,/data-action="server-reconcile-account"/);
 assert.doesNotMatch(permitted,/href="https:\/\/finance\.example\.com\/#kontostaende"/);
 const blocked=serverPageHtml({...base,reconciliationSupported:false},'home');
 assert.doesNotMatch(blocked,/data-action="server-reconcile-account"/);
 const readonly=serverPageHtml({...base,session:{...session,canWrite:false,access:'read'}},'home');
 assert.doesNotMatch(readonly,/data-action="server-reconcile-account"/);
 const withPending=serverPageHtml({...base,pending:makeReconciliationPending(base.server,currencyAccount(),127500,'')},'home');
 assert.doesNotMatch(withPending,/data-action="server-reconcile-account"/);
 assert.match(withPending,/Offener Kontostandsabgleich/);
 assert.match(withPending,/Denselben Abgleich erneut senden/);
});

test('server uses local-style form but never local storage, and handles ambiguous or rejected outcomes',()=>{
 const main=source('src/main.ts');
 assert.match(main,/function serverReconcileDialog/);
 for(const control of ['reconcile-account','reconcile-current','reconcile-target','reconcile-note','reconcile-delta'])
  assert.match(main,new RegExp('id="'+control+'"'));
 assert.match(main,/function reconcileAccountDialog/);
 assert.match(main,/storage\.reconcileAccount/); // Only original local function
 const remoteSection=main.slice(main.indexOf('function serverReconcileDialog('),main.indexOf('function reconcileAccountDialog('));
 assert.doesNotMatch(remoteSection,/storage\.(?:reconcileAccount|addBooking|updateAccount)/);
 assert.match(remoteSection,/makeReconciliationPending/);
 assert.match(main,/issueServerReconciliation\(remote\.pending,true\)/);
 assert.match(main,/await secure\.putPending\(\{json:JSON\.stringify\(request\)\}\)/);
 assert.match(main,/JSON\.stringify\(remote\.pending\)!==JSON\.stringify\(request\)/);
 assert.match(main,/needsReconfirmation/);
 assert.match(main,/error\.status===409/);
 assert.match(main,/client\.accounts\(\),client\.bookings\(\)/);
 assert.match(main,/loadMonthlyFor\('home'\)/);
 assert.match(source('src/dashboard-api.ts'),/reconciliationSupported/);
 assert.equal(JSON.parse(source('package.json')).version,'0.1.0-alpha.37');
});
