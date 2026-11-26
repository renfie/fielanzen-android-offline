// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMonthlyReport,monthlyReportsCapability,buildMonthlyPath} from '../preview/src/monthly-api.js';
import {renderHistory,localHistoryReport,historyBounds} from '../preview/src/history-view.js';
import {renderHomeComparison} from '../preview/src/home-comparison.js';
import {emptyServerData,serverPageHtml} from '../preview/src/server-ui.js';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const input={
 currency:'EUR',decimals:2,from:'2026-09',to:'2026-11',complete:true,months:[
 {month:'2026-09',income_minor:0,expense_minor:0,balance_minor:0,booking_count:0,transfer_count:0,transfer_minor:0,
  categories:{income:[],expense:[]}},
 {month:'2026-10',income_minor:488949,expense_minor:412086,balance_minor:76863,booking_count:13,transfer_count:0,transfer_minor:0,
  categories:{income:[{category_id:7,category:'Gehalt',amount_minor:488949,booking_count:2}],
    expense:[{category_id:9,category:'Miete',amount_minor:412086,booking_count:11}]}},
 {month:'2026-11',income_minor:333386,expense_minor:373593,balance_minor:-40207,booking_count:14,transfer_count:1,transfer_minor:50000,
  categories:{income:[{category_id:7,category:'Gehalt',amount_minor:333386,booking_count:2}],
    expense:[{category_id:9,category:'Miete',amount_minor:373593,booking_count:12}]}}
]};
const filters={first:'2026-09',second:'2026-11',currency:'EUR',account:'all',category:'all'};
const accounts=[{id:1,name:'Giro',currency:'EUR',decimals:2}];
const categories=[{id:9,name:'Miete'},{id:7,name:'Gehalt'}];

test('capability strictly requires monthly_reports true; read-only request bounded to 36 months',()=>{
 assert.equal(monthlyReportsCapability({features:{monthly_reports:true}}),true);
 assert.equal(monthlyReportsCapability({features:{monthly_reports:'true'}}),false);
 assert.equal(monthlyReportsCapability({features:{recurring_rules:true}}),false);
 assert.equal(buildMonthlyPath({from:'2025-12',to:'2026-11',currency:'EUR',accountId:4,categoryId:7}),
 '/api/mobile/v1/reports/monthly?from=2025-12&to=2026-11&currency=EUR&account_id=4&category_id=7');
 assert.throws(()=>buildMonthlyPath({from:'2021-01',to:'2026-11',currency:'EUR'}),/maximal 36/);
});
test('full monthly API preserves true zero months and rejects page-shaped or incomplete input',()=>{
 const report=parseMonthlyReport(input);
 assert.equal(report.months.length,3);
 assert.deepEqual(report.months[0].categories,{income:[],expense:[]});
 assert.equal(report.months[1].incomeMinor,488949);
 assert.equal(report.months[2].balanceMinor,-40207);
 assert.throws(()=>parseMonthlyReport({...input,complete:false}),/vollständige/);
 assert.throws(()=>parseMonthlyReport({...input,months:input.months.slice(1)}),/Lücken/);
 assert.throws(()=>parseMonthlyReport({...input,months:[input.months[1],input.months[0],input.months[2]]}),/ungeordnete/);
 assert.throws(()=>parseMonthlyReport({...input,months:input.months.map((m,i)=>i===1?{...m,income_minor:NaN}:m)}),/Ungültiger/);
});
test('history matches web layout, includes full month bars and both donut charts',()=>{
 const report=parseMonthlyReport(input);
 const html=renderHistory({prefix:'server-history',filter:filters,accounts,categories,report});
 for(const fragment of ['Historie','Filter und Zeitraum','Einnahmen gesamt','Ausgaben gesamt',
  'Saldo im Zeitraum','Buchungen im Zeitraum','Höchste Einzelausgabe','Höchster Ø-Ausgabebetrag',
  'Monatsverlauf: Einnahmen und Ausgaben','history-income-bar','history-expense-bar',
  'Ausgaben nach Kategorie','Einnahmen nach Kategorie','history-donut-segment','stroke-dasharray','2026','0,00']){
  assert.ok(html.includes(fragment),fragment);
 }
 assert.doesNotMatch(html,/\\sstyle=/);
 assert.match(html,/Erfordert Erweiterung der Dashboard-API/);
 assert.doesNotMatch(html,/Nicht geladen/);
});
test('missing API never guesses partial historical amounts',()=>{
 const state={...emptyServerData(),accounts,historyFilter:filters,monthlySupported:false,historyMonthly:null};
 const html=serverPageHtml(state,'reports');
 assert.match(html,/nicht/);
 assert.match(html,/vollständige Monatsauswertung/);
 assert.doesNotMatch(html,/historischer.*Saldo/);
 const blank=renderHistory({prefix:'server-history',filter:filters,accounts,categories,report:null,error:'Timeout 401'});
 assert.match(blank,/Timeout 401/);
 assert.doesNotMatch(blank,/history-income-bar/);
});
test('remote home comparison is fully server-authoritative regardless of cached booking pages',()=>{
 const report=parseMonthlyReport(input);
 const html=renderHomeComparison({
   prefix:'server-home',filter:{...filters,first:'2026-10',second:'2026-11'},accounts,categories,bookings:[],
   complete:false,defaultCurrency:'EUR',remoteSupported:true,fullReport:report
 });
 assert.match(html,/4.889,49/);
 assert.match(html,/3.333,86/);
 const noApi=renderHomeComparison({
   prefix:'server-home',filter:{...filters,first:'2026-10',second:'2026-11'},accounts,categories,
   bookings:[{date:'2026-11-02',kind:'income',amountMinor:100000,accountId:1,categoryId:7}],
   complete:false,defaultCurrency:'EUR',remoteSupported:false
 });
 assert.doesNotMatch(noApi,/1.000,00/);
 assert.match(noApi,/Keine Daten/);
});
test('local history computes independently from offline snapshot including true empty months',()=>{
 const snapshot={accounts:[{id:1,name:'Giro',openingCents:0}],
  categories:[{id:7,name:'Lohn',kind:'income'},{id:9,name:'Miete',kind:'expense'}],
  payees:[{id:1,name:'Arbeitgeber'}],recurringRules:[],importReports:[],settings:{defaultAccountId:null,theme:'system'},
  bookings:[
    {id:1,type:'income',accountId:1,otherAccountId:null,categoryId:7,payeeId:1,amountCents:20000,date:'2026-11-01',note:'',createdAt:'2026-11-01'},
    {id:2,type:'expense',accountId:1,otherAccountId:null,categoryId:9,payeeId:null,amountCents:4500,date:'2026-11-02',note:'',createdAt:'2026-11-02'},
    {id:3,type:'expense',accountId:1,otherAccountId:null,categoryId:9,payeeId:null,amountCents:7500,date:'2026-12-01',note:'',createdAt:'2026-11-15'},
    {id:4,type:'transfer',accountId:1,otherAccountId:1,categoryId:null,payeeId:null,amountCents:1500,date:'2026-11-04',note:'',createdAt:'2026-11-04'}]
 };
 const report=localHistoryReport(snapshot,filters,'2026-11-26');
 assert.equal(report.months.length,3);
 assert.equal(report.months[0].incomeMinor,0);
 assert.equal(report.months[2].incomeMinor,20000);
 assert.equal(report.months[2].expenseMinor,4500);
 assert.equal(report.months[2].transferMinor,1500);
 assert.equal(report.highlights.largestExpense.amountMinor,4500);
 assert.equal(report.highlights.largestIncome.payee,'Arbeitgeber');
 assert.deepEqual(historyBounds(filters),{from:'2026-09',to:'2026-11'});
});
test('server history and local history are wired with one renderer, and developer version is current',()=>{
 const main=source('src/main.ts'),server=source('src/server-ui.ts');
 assert.match(main,/localHistoryReport\(state,historyFilter,today\(\)\)/);
 assert.match(main,/loadMonthlyFor\('history'\)/);
 assert.match(server,/renderHistory\(\{/);
 assert.match(server,/monthlySupported/);
 assert.match(source('src/dashboard-api.ts'),/monthlyReportsSupported/);
 assert.match(source('src/dashboard-api.ts'),/buildMonthlyPath/);
 assert.match(JSON.parse(source('package.json')).version,/^0\.1\.0-alpha\.\d+$/);
});
