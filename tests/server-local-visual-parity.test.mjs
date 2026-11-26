// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const {bookingCardHtml}=await import('../preview/src/booking-card-ui.js');
const {emptyServerData,serverPageHtml,serverBookingResultsHtml,serverBookingSummaryHtml,displayedServerBookings}=await import('../preview/src/server-ui.js');

const account={id:1,name:'Giro',currency:'EUR',symbol:'€',decimals:2,balanceMinor:50000,projectedBalanceMinor:50000,active:true,includedInTotal:true};
const category={id:2,name:'Lebensmittel',kind:'expense'};
const booking={id:3,revision:'rev-1',kind:'expense',date:'2026-11-21',accountId:1,toAccountId:null,categoryId:2,
  amountMinor:4298,payeeTitle:'Supermarkt',note:'Einkauf',isRecurring:true};
function sample(){
  return {...emptyServerData(),server:'https://example.org',accounts:[account],categories:[category],
    bookings:[booking],session:{financeMode:'household',access:'read-write',canWrite:true},period:'all',reportMonth:'2026-11'};
}

test('LOCAL and SERVER use one booking card renderer and identical styling',()=>{
  assert.match(source('src/main.ts'),/return bookingCardHtml\(\{/);
  assert.match(source('src/server-ui.ts'),/return bookingCardHtml\(\{/);
  const local=bookingCardHtml({id:3,source:'local',expanded:false,title:'Supermarkt',dateLabel:'21.11.2026',
    categoryLabel:'Lebensmittel',kind:'expense',kindLabel:'Ausgabe',amountLabel:'−42,98 €',
    recurring:true,details:[],actions:[]});
  const remote=bookingCardHtml({...{id:3,source:'server',expanded:false,title:'Supermarkt',dateLabel:'21.11.2026',
    categoryLabel:'Lebensmittel',kind:'expense',kindLabel:'Ausgabe',amountLabel:'−42,98 €',
    recurring:true,details:[],actions:[]}});
  for(const css of ['booking-entry','class="booking"','booking-title','booking-meta','booking-tags','booking-side','booking-amount expense','booking-chevron','booking-type-chip recurring']){
    assert.ok(local.includes(css),css);
    assert.ok(remote.includes(css),css);
  }
  assert.match(remote,/aria-expanded="false"/);
  assert.doesNotMatch(remote,/class="booking-details"/);
});

test('server home and bookings have the same local component structure',()=>{
  const data=sample();
  const home=serverPageHtml(data,'home');
  for(const value of ['<h1>Übersicht</h1>','Gesamtvermögen','Kontostände','account-disclosure','Monatsvergleich','Filter und Zeitraum','id="server-home-search"','class="booking-entry','id="server-booking-results"']){
    assert.ok(home.includes(value),value);
  }
  const list=serverPageHtml(data,'bookings');
  for(const value of ['<h1>Buchungen</h1>','<h2>Verlauf</h2>','server-booking-advanced-filters','filter-disclosure',
    'server-filter-period','server-filter-kind','server-filter-account','server-filter-category','server-filter-from','server-filter-to',
    'server-list-sort','server-bookings-summary','class="mini-summary"','class="booking-entry']){
    assert.ok(list.includes(value),value);
  }
  assert.match(serverBookingSummaryHtml(data),/Einnahmen/);
  assert.doesNotMatch(home,/Alle Daten lokal auf diesem Gerät/);
});

test('server cards remain collapsed; permissions and pending writes protect actions',()=>{
  const data=sample();
  const collapsed=serverBookingResultsHtml(data,'bookings');
  assert.match(collapsed,/aria-expanded="false"/);
  assert.doesNotMatch(collapsed,/server-edit-booking/);
  data.expandedBookingId=booking.id;
  const expanded=serverBookingResultsHtml(data,'bookings');
  assert.match(expanded,/aria-expanded="true"/);
  assert.match(expanded,/server-edit-booking/);
  assert.match(expanded,/server-delete-booking/);
  assert.match(expanded,/Wiederkehrend/);
  data.pending={method:'PUT',createdAt:'2026-11-21',idempotencyKey:'test',server:data.server,path:'',data:null};
  assert.doesNotMatch(serverBookingResultsHtml(data,'bookings'),/server-edit-booking/);
  data.pending=null;data.session.canWrite=false;
  assert.doesNotMatch(serverBookingResultsHtml(data,'bookings'),/server-delete-booking/);
});

test('server search, category/account/type/date filters only use loaded pages',()=>{
  const data=sample();
  data.bookings.push({...booking,id:4,kind:'income',date:'2026-07-01',categoryId:0,payeeTitle:'Arbeitgeber',isRecurring:false});
  data.searchBookings='Supermarkt';
  assert.deepEqual(displayedServerBookings(data,'bookings').map(x=>x.id),[3]);
  data.searchBookings='';data.kindFilter='income';
  assert.deepEqual(displayedServerBookings(data,'bookings').map(x=>x.id),[4]);
  data.kindFilter='all';data.categoryFilter='2';
  assert.deepEqual(displayedServerBookings(data,'bookings').map(x=>x.id),[3]);
  data.categoryFilter='all';data.accountFilter='99';
  assert.equal(displayedServerBookings(data,'bookings').length,0);
  data.accountFilter='all';data.dateFrom='2026-10-01';
  assert.deepEqual(displayedServerBookings(data,'bookings').map(x=>x.id),[3]);
  assert.match(source('src/main.ts'),/case 'server-reset-filters'/);
  assert.match(source('src/main.ts'),/case 'toggle-server-booking'/);
});

test('report and recurring pages match local layout but clearly mark API limits',()=>{
  const data=sample();
  data.nextBefore='200'; // Verify warning for incompletely paged mobile reports.
  const report=serverPageHtml(data,'reports');
  for(const heading of ['<h1>Historie</h1>','Filter und Zeitraum','server-history-month-a','server-history-month-b',
    'server-history-account','server-history-currency','Keine vollständige Monatsauswertung']){
    assert.ok(report.includes(heading),heading);
  }
  const recurring=serverPageHtml(data,'recurring');
  assert.match(recurring,/<h1>Wiederkehrend<\/h1>/);
  assert.match(recurring,/<h2>Regeln/);
  assert.match(recurring,/Mobile-API/);
  assert.match(recurring,/disabled/);
  const settings=source('src/server-ui.ts');
  assert.match(settings,/<h1>Einstellungen<\/h1>/);
  assert.doesNotMatch(settings,/openStorage\(|state\.bookings/);
});

test('different currencies are never silently added together',()=>{
  const data=sample();
  data.accounts.push({...account,id:20,name:'Dollar',currency:'USD',symbol:'$',balanceMinor:9999});
  const overview=serverPageHtml(data,'home');
  assert.match(overview,/Monatsvergleich/);
  assert.match(overview,/server-home-currency/);
  assert.match(overview,/EUR/);
  assert.doesNotMatch(overview,/Mehrere Währungen/);
});

test('html escaping prevents server titles and notes from becoming markup',()=>{
  const data=sample();
  data.bookings=[{...booking,payeeTitle:'<script>alert(1)</script>',note:'<img src=x>'}];
  data.expandedBookingId=3;
  const html=serverBookingResultsHtml(data,'bookings');
  assert.doesNotMatch(html,/<script>alert/);
  assert.doesNotMatch(html,/<img src=x>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;img src=x&gt;/);
});

test('project package, version and private-data separation remain unchanged',()=>{
  const currentVersion=JSON.parse(source('package.json')).version;
  assert.match(currentVersion, /^(?:\d+\.\d+\.\d+|0\.1\.0-alpha\.\d+)$/);
  assert.ok(source('src/main.ts').includes("export const APP_VERSION='"+currentVersion+"'"));
  assert.match(source('capacitor.config.ts'),/de\.fielanzen\.offline/);
  const main=source('src/main.ts');
  assert.equal((main.match(/exportFinancistoCompatible\(state\)/g)||[]).length,4);
  assert.match(main,/serverMode\?\(view==='settings'\?serverSettingsHtml\(remote\)\+appLockSettingsHtml\(\)\+licenseSettingsHtml\(\)/);
});
