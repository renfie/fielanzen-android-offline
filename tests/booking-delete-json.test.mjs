// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mobileWriteBody,mobileErrorDetail} from '../preview/src/server-write-payload.js';
import {parsePending} from '../preview/src/dashboard-protocol.js';
import {emptyServerData,serverPageHtml} from '../preview/src/server-ui.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uuid='96f990d2-f587-4e31-b52e-9596bb257372';
const pending={
 server:'https://finance.example.com',method:'DELETE',path:'/api/mobile/v1/bookings/782',
 data:null,ifMatch:'a'.repeat(32),idempotencyKey:uuid,createdAt:'2026-11-26T14:23:25Z'
};

test('booking DELETE sends empty JSON object required by Dashboard Flask handler',()=>{
 const original=JSON.stringify(pending);
 assert.deepEqual(mobileWriteBody(pending),{});
 assert.equal(JSON.stringify(pending),original,'encrypted pending intent and UUID must remain unchanged');
 const restored=parsePending(original);
 assert.deepEqual(restored,pending);
 assert.deepEqual(mobileWriteBody(restored),{});
});
test('recurring-rule DELETE retains required confirm_title and never silently replaces it',()=>{
 const recurring={...pending,path:'/api/mobile/v1/recurring/72',data:{confirm_title:'Garten'}};
 assert.deepEqual(mobileWriteBody(recurring),{confirm_title:'Garten'});
 const malformed={...recurring,data:null};
 assert.equal(mobileWriteBody(malformed),null,'do not invent confirmation for recurring delete');
 const post={...pending,method:'POST',path:'/api/mobile/v1/bookings',data:{amount_minor:1295}};
 assert.deepEqual(mobileWriteBody(post),{amount_minor:1295});
});
test('only exact booking IDs trigger DELETE normalization',()=>{
 for(const bad of ['/api/mobile/v1/recurring/20','/api/mobile/v1/bookings/0',
  '/api/mobile/v1/bookings/all','/api/mobile/v1/bookings/20/mode']){
  assert.equal(mobileWriteBody({...pending,path:bad}),null);
 }
 assert.throws(()=>mobileWriteBody({...pending,data:'unexpected'}));
 assert.throws(()=>mobileWriteBody({...pending,data:[1,2]}));
});
test('error details are safe, bounded and preserve Flask JSON rejection reason',()=>{
 assert.equal(mobileErrorDetail({error:'JSON-Objekt erforderlich.'}),'JSON-Objekt erforderlich.');
 assert.equal(mobileErrorDetail('{"error":"Exakten Regelnamen zur Archivierung bestätigen."}'),
  'Exakten Regelnamen zur Archivierung bestätigen.');
 for(const invalid of ['<html><body>Proxy</body></html>',{error:42},
   {error:'a'.repeat(290)},{error:'line\npass'},['invalid']]){
  assert.equal(mobileErrorDetail(invalid),null);
 }
});
test('pending UI shows exact target and never sends a DELETE automatically',()=>{
 const page=serverPageHtml({...emptyServerData(),pending},'home');
 assert.match(page,/Offener Server-Schreibauftrag/);
 assert.match(page,/\/api\/mobile\/v1\/bookings\/782/);
 assert.match(page,/Nach Kontrolle freigeben/);
 const main=source('src/main.ts');
 assert.match(main,/remote\.pending\.method==='DELETE'&&!window\.confirm/);
 assert.match(main,/if\(isReconciliationPending\(remote\.pending\)\)/);
 const api=source('src/dashboard-api.ts');
 assert.match(api,/mobileWriteBody\(p\)/);
 assert.match(api,/mobileErrorDetail\(result\.data\)/);
});
