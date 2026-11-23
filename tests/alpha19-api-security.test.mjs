// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {emptySnapshot} from '../preview/src/types.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {auditOriginalFinancisto} from '../preview/src/financisto-audit.js';
import {parseAccounts,parseCategories,parsePayees,parseBookings,parseSession,parseCapabilities,validateRemoteDraft,parsePending} from '../preview/src/dashboard-protocol.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const accounts=[{id:1,name:'Giro',currency:'EUR',symbol:'€',decimals:2,balance_minor:-1000,projected_balance_minor:-1000,active:true,included_in_total:true},
 {id:2,name:'Test JPY',currency:'JPY',symbol:'¥',decimals:0,balance_minor:15000,projected_balance_minor:15000,active:true,included_in_total:false}];
const categories=[{id:1,name:'Lohn',kind:'income'},{id:2,name:'Einkäufe',kind:'expense'}];
test('Dashboard response validation supports negative balances, multiple currencies, and explicit write rights',()=>{
  const parsed=parseAccounts({accounts});
  assert.equal(parsed[0].balanceMinor,-1000);assert.equal(parsed[1].decimals,0);
  assert.equal(parseCategories({data:{categories}}).length,2);
  assert.equal(parsePayees({payees:[{id:1,name:'REWE'}]}).length,1);
  assert.equal(parseSession({finance_mode:'web',access:'write',can_write:true}).canWrite,true);
  assert.equal(parseSession({finance_mode:'financisto',access:'write',can_write:true}).canWrite,false);
  assert.equal(parseSession({finance_mode:'web',access:'read',can_write:true}).canWrite,false);
  assert.equal(parseSession({finance_mode:'web',access:'write',can_write:false}).canWrite,false);
  assert.equal(parseCapabilities({mobile_api:1}),true);
  assert.equal(parseCapabilities({api_version:1}),true);
  assert.equal(parseCapabilities({mobile_api:9}),false);
});
test('paged bookings require revision and preserve cursor',()=>{
  const raw={bookings:[{id:3,revision:'"r3"',kind:'expense',date:'2026-11-22',account_id:1,
    category_id:2,amount_minor:1000,payee_title:'REWE',note:'Einkauf'}],next_before:'abc123'};
  const result=parseBookings(raw);
  assert.equal(result.nextBefore,'abc123');assert.equal(result.items[0].revision,'"r3"');
  assert.throws(()=>parseBookings({bookings:[{...raw.bookings[0],revision:null}]}),/revision/i);
  assert.throws(()=>parseBookings({bookings:[raw.bookings[0],raw.bookings[0]]}),/Doppelte/);
});
test('server drafts cannot mix categories/accounts or silently create transfers',()=>{
  const aa=parseAccounts({accounts});const cc=parseCategories({categories});
  const normal={kind:'expense',date:'2026-11-22',account_id:1,category_id:2,amount_minor:100,payee_title:'REWE',note:''};
  assert.equal(validateRemoteDraft(normal,aa,cc).amount_minor,100);
  assert.throws(()=>validateRemoteDraft({...normal,category_id:1},aa,cc),/Kategorie/);
  assert.throws(()=>validateRemoteDraft({...normal,amount_minor:0},aa,cc),/null/);
  assert.throws(()=>validateRemoteDraft({...normal,kind:'transfer',category_id:0,to_account_id:1},aa,cc),/Zielkonto/);
  const transfer={...normal,kind:'transfer',category_id:0,to_account_id:2};
  assert.equal(validateRemoteDraft(transfer,aa,cc).to_account_id,2);
});
test('uncertain server write keeps same UUID and payload; native storage uses Android Keystore AES/GCM',()=>{
  const id=randomUUID();const raw={server:'https://finance.example.de',method:'POST',path:'/api/mobile/v1/bookings',
    data:{kind:'income',date:'2026-11-22',account_id:1,category_id:1,amount_minor:500,payee_title:'',note:''},
    idempotencyKey:id,createdAt:'2026-11-22T10:00:00Z'};
  assert.deepEqual(parsePending(JSON.stringify(raw)),raw);
  assert.throws(()=>parsePending(JSON.stringify({...raw,idempotencyKey:'invalid'})),/ungültiges Format/);
  const api=read('src/dashboard-api.ts');
  assert.match(api,/'Idempotency-Key':p\.idempotencyKey/);
  assert.match(api,/headers\['If-Match'\]=p\.ifMatch/);
  assert.doesNotMatch(api,/retry\s*\(/);
  const main=read('src/main.ts');
  assert.match(main,/await secure\.putPending\(/);
  assert.match(main,/await secure\.clearPending\(/);
  assert.match(main,/remote\.pending/);
  assert.match(main,/server-switch-local/);
  assert.match(main,/serverMode\s*\?\s*\(/);
  const java=read('native/de/fielanzen/offline/FieLanzenSecureSessionPlugin.java');
  assert.match(java,/AndroidKeyStore/);assert.match(java,/AES\/GCM\/NoPadding/);
  assert.match(java,/putPending/);assert.match(java,/setMode/);
  assert.doesNotMatch(java,/Log\./);
});
test('Alpha 19 archive validates mandatory Financisto currency fields and distinct exporter version',async()=>{
  const s=emptySnapshot();s.accounts=[{id:1,name:'Test',openingCents:500}];
  const {bytes}=await exportFinancistoCompatible(s);
  const content=gunzipSync(bytes).toString('utf8');
  assert.match(content,/VERSION_CODE:117\nVERSION_NAME:1\.8\.2\nDATABASE_VERSION:217\nFIELANZEN_EXPORTER_VERSION:20\n/);
  assert.deepEqual(auditOriginalFinancisto(content),{accounts:1,currency:1,categories:0,payees:0,transactions:1});
  assert.throws(()=>auditOriginalFinancisto(content.replace('title:Euro\n','')),/currency.title/);
  assert.throws(()=>auditOriginalFinancisto(content.replace('FIELANZEN_EXPORTER_VERSION:20\n','')),/veraltete|Exportversion/i);
  const result=spawnSync('python3',[new URL('./verify_original_financisto_sqlite.py',import.meta.url).pathname],{
    input:JSON.stringify({plain:content,expectedCounts:{currency:1,account:1,category:0,payee:0,transactions:1},expectedBalances:{1:500}}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const java=read('native/de/fielanzen/offline/AutoBackupFiles.java');
  assert.match(java,/financisto_format_v20/);assert.match(java,/validateArchive\(verified\)/);
  assert.match(java,/FIELANZEN_EXPORTER_VERSION:20/);
});
test('restore chooser permits all MIME types and validates content after selection',()=>{
  const main=read('src/main.ts');
  assert.match(main,/id="backup-restore-input"/);
  assert.doesNotMatch(main,/accept="\.json,\.backup/);
  assert.match(main,/restoreBackup\(file\)/);
});
test('project keeps same Android ID and does not publish personal API tokens',()=>{
  assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
  assert.match(read('scripts/configure-android.py'),/versionCode 25/);
  assert.match(read('scripts/configure-android.py'),/registerPlugin\(FieLanzenSecureSessionPlugin.class\)/);
  assert.match(read('native/de/fielanzen/offline/FieLanzenSecureSessionPlugin.java'),/MODE_PRIVATE/);
  assert.match(read('src/backup.ts'),/settings\.dashboard/);
  assert.doesNotMatch(read('src/backup.ts'),/apiKey|api_key|bearerToken|deviceToken/);
});
