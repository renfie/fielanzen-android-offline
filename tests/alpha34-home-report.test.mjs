// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calendarMonth,homeMonthTotals,renderHomeComparison} from '../preview/src/home-comparison.js';
import {emptyServerData,serverPageHtml} from '../preview/src/server-ui.js';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const accounts=[
  {id:1,name:'Giro',currency:'EUR',decimals:2,balanceMinor:50000,projectedBalanceMinor:50000,active:true,includedInTotal:true,symbol:'€'},
  {id:2,name:'Sparkasse',currency:'EUR',decimals:2,balanceMinor:0,projectedBalanceMinor:0,active:false,includedInTotal:true,symbol:'€'},
  {id:3,name:'Dollar',currency:'USD',decimals:2,balanceMinor:10000,projectedBalanceMinor:10000,active:true,includedInTotal:true,symbol:'$'}
];
const bookings=[
  {id:3,date:'2026-11-15',kind:'income',amountMinor:12345,accountId:1,toAccountId:null,categoryId:10,payeeTitle:'Arbeit',note:'',revision:'rev1'},
  {id:4,date:'2026-11-17',kind:'expense',amountMinor:4500,accountId:1,toAccountId:null,categoryId:20,payeeTitle:'Rewe',note:'',revision:'rev2'},
  {id:5,date:'2026-11-19',kind:'transfer',amountMinor:1000,accountId:1,toAccountId:2,categoryId:0,payeeTitle:'',note:'',revision:'rev3'},
  {id:6,date:'2026-11-20',kind:'income',amountMinor:60000,accountId:3,toAccountId:null,categoryId:10,payeeTitle:'',note:'',revision:'rev4'},
  {id:7,date:'2026-10-02',kind:'expense',amountMinor:1500,accountId:1,toAccountId:null,categoryId:20,payeeTitle:'',note:'',revision:'rev5'}
];
const filter={first:'2026-11',second:'2026-10',currency:'EUR',account:'all',category:'all'};
test('calendar month chooser handles year changes',()=>{
 assert.equal(calendarMonth('2026-01',-1),'2025-12');
 assert.equal(calendarMonth('2026-12',1),'2027-01');
});
test('home comparison filters by currency, account and category, never counts transfers',()=>{
 const nov=homeMonthTotals(bookings,'2026-11',filter,accounts);
 assert.deepEqual(nov,{month:'2026-11',income:12345,expense:4500,count:2});
 const oct=homeMonthTotals(bookings,'2026-10',filter,accounts);
 assert.equal(oct.expense,1500);
 assert.deepEqual(homeMonthTotals(bookings,'2026-11',{...filter,currency:'USD'},accounts),
 {month:'2026-11',income:60000,expense:0,count:1});
 assert.deepEqual(homeMonthTotals(bookings,'2026-11',{...filter,account:'2'},accounts),
 {month:'2026-11',income:0,expense:0,count:0});
 assert.deepEqual(homeMonthTotals(bookings,'2026-11',{...filter,category:'20'},accounts),
 {month:'2026-11',income:0,expense:4500,count:1});
});
test('partial home summary shows unknown months as missing rather than financial zeros',()=>{
 const html=renderHomeComparison({prefix:'server-home',filter,accounts,categories:[],bookings:[],
   complete:false,defaultCurrency:'EUR',remoteSupported:false});
 assert.match(html,/Nicht vollständig|Keine Daten für diesen Monat geladen/);
 assert.match(html,/Serverwerte fehlen/);
 assert.match(html,/–/);
 assert.doesNotMatch(html,/<i class="home-compare-income"/);
 assert.match(html,/server-home-month-a/);
 assert.match(html,/server-home-month-b/);
 assert.match(html,/server-home-account/);
});
test('complete local comparison renders zero correctly and permits month changes',()=>{
 const html=renderHomeComparison({prefix:'local-home',filter,accounts:[accounts[0]],categories:[],bookings:[],
   complete:true,defaultCurrency:'EUR'});
 assert.match(html,/0,00/);
 assert.match(html,/local-home-month-a/);
 assert.match(html,/local-home-reset/);
});
test('server overview has comparison filters and read-only reconciliation link, never uses local ledger',()=>{
 const data={...emptyServerData(),server:'https://example.org',accounts,bookings,
   categories:[{id:20,name:'Einkaufen',kind:'expense'}],
   session:{financeMode:'web',access:'write',canWrite:true,role:'admin'},
   nextBefore:'200',balancesOpen:true};
 const home=serverPageHtml(data,'home');
 assert.match(home,/Filter und Zeitraum/);
 assert.match(home,/Monatsvergleich/);
 assert.match(home,/Kontostand im Dashboard abgleichen/);
 assert.match(home,/Inaktiv/);
 assert.match(home,/Serverwerte fehlen/);
 assert.doesNotMatch(home,/Alle Daten lokal auf diesem Gerät/);
});
test('server trend hides zero-width fake bars for unknown periods and separates currencies',()=>{
 const data={...emptyServerData(),server:'https://example.org',accounts,bookings,
   reportMonth:'2026-11',reportCurrencyFilter:'EUR',nextBefore:'200'};
 const html=serverPageHtml(data,'reports');
 assert.match(html,/Historie/);
 assert.match(html,/server-history-currency/);
 assert.match(html,/Keine vollständige Monatsauswertung/);
 assert.doesNotMatch(html,/style="width:0%"/);
 assert.match(read('src/server-ui.ts'),/currencyAccounts\.has\(b\.accountId\)/);
});
test('app provides local and remote filter actions and does not silently fetch all API pages',()=>{
 const main=read('src/main.ts');
 assert.match(main,/data-action="reconcile-account"/);
 assert.match(main,/server-more-history/);
 assert.match(main,/i<3&&remote\.nextBefore/);
 assert.match(main,/homeCompare:HomeComparisonFilter/);
 assert.match(main,/server-home-month-filters/);
 assert.match(main,/local-home-month-filters/);
 assert.match(JSON.parse(read('package.json')).version,/^0\.1\.0-alpha\.\d+$/);
});
