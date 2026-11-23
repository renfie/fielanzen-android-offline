// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';

const mkBooking=(id,type,accountId,otherAccountId,categoryId,amountCents)=>({id,type,accountId,otherAccountId,categoryId,payeeId:null,amountCents,date:'2026-11-18',note:'Testbuchung',createdAt:'2026-11-18T12:00:00.000Z'});
const base=()=>{
  const s=emptySnapshot();
  s.accounts=[{id:10,name:'Giro',openingCents:123456},{id:20,name:'Bar',openingCents:-1990}];
  s.categories=[{id:1,name:'Einkäufe',kind:'expense'},{id:2,name:'Lohn',kind:'income'}];
  s.payees=[{id:1,name:'REWE'}];
  s.bookings=[mkBooking(5,'expense',10,null,1,1260),mkBooking(8,'income',10,null,2,50000),mkBooking(9,'transfer',10,20,null,1700)];
  return s;
};
test('native SQL constraints accept standalone .backup and original-app balance recalculation agrees',async()=>{
  const s=base();const {bytes}=await exportFinancistoCompatible(s);
  const plain=gunzipSync(bytes).toString('utf8');
  assert.match(plain,/\$ENTITY:currency\n_id:1\nname:EUR\ntitle:Euro\nsymbol:€/);
  assert.match(plain,/VERSION_CODE:117\nVERSION_NAME:1\.8\.2\nDATABASE_VERSION:217\n/);
  assert.match(plain,/fielanzen_opening_balance:1/);
  assert.match(plain,/title:Lohn\nleft:\d+\nright:\d+\nlast_location_id:0\nlast_project_id:0\ntype:1/);
  const expectedCounts={currency:1,account:2,category:2,payee:1,transactions:5};
  const expectedBalances=Object.fromEntries(s.accounts.map(a=>[String(a.id),accountBalance(s,a.id)]));
  const out=spawnSync('python3',[new URL('./verify_original_financisto_sqlite.py',import.meta.url).pathname],{input:JSON.stringify({plain,expectedCounts,expectedBalances}),encoding:'utf8'});
  assert.equal(out.status,0,out.stderr||out.stdout);
  const restored=convertLegacyTables(parseLegacyText(plain)).snapshot;
  assert.equal(restored.bookings.length,s.bookings.length,'native-only opening balance markers must not become user bookings');
  assert.deepEqual(restored.accounts.map(a=>a.openingCents),s.accounts.map(a=>a.openingCents));
  for(const a of s.accounts)assert.equal(accountBalance(restored,a.id),accountBalance(s,a.id));
});
test('independent SQLite check detects missing required currency.title (Alpha 16 regression)',async()=>{
  const s=base();const {bytes}=await exportFinancistoCompatible(s);
  const plain=gunzipSync(bytes).toString('utf8').replace('title:Euro\n','');
  const out=spawnSync('python3',[new URL('./verify_original_financisto_sqlite.py',import.meta.url).pathname],{input:JSON.stringify({plain,expectedCounts:{currency:1,account:2,category:2,payee:1,transactions:5},expectedBalances:{}}),encoding:'utf8'});
  assert.notEqual(out.status,0);
  assert.match(out.stderr,/NOT NULL constraint failed: currency.title/);
});
