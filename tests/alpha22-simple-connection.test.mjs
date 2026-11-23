// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {DashboardApiError} from '../preview/src/dashboard-protocol.js';
import {isClientCertificateChallenge,connectWithOptionalClientCertificate} from '../preview/src/dashboard-connection.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('only explicit reverse-proxy certificate challenges trigger KeyChain selection',()=>{
  assert.equal(isClientCertificateChallenge(400,'<html><h1>400 No required SSL certificate was sent</h1><center>nginx</center></html>'),true);
  assert.equal(isClientCertificateChallenge(400,'The SSL certificate error'),true);
  assert.equal(isClientCertificateChallenge(496,'client certificate required'),true);
  for(const [status,body] of [[400,'Bad Request'],[401,'Invalid API token'],[403,'Forbidden'],[404,'No required SSL certificate was sent'],[500,'client certificate required']])
    assert.equal(isClientCertificateChallenge(status,body),false,`${status}: ${body}`);
});
test('normal servers connect without certificate prompt',async()=>{
  let connectCalls=0,certCalls=0;
  const result=await connectWithOptionalClientCertificate(async()=>{connectCalls++;return 'OK';},async()=>{certCalls++;});
  assert.equal(result,'OK');assert.equal(connectCalls,1);assert.equal(certCalls,0);
});
test('explicit mTLS challenge causes ONE system prompt and ONE retry',async()=>{
  let connectCalls=0,certCalls=0;
  const result=await connectWithOptionalClientCertificate(async()=>{
    connectCalls++;if(connectCalls===1)throw new DashboardApiError(400,'client_certificate_required','Certificate needed');return 'READY';
  },async()=>{certCalls++;});
  assert.equal(result,'READY');assert.equal(connectCalls,2);assert.equal(certCalls,1);
});
test('no automatic cert prompt on invalid token, generic errors or network failures',async()=>{
  for(const error of [new DashboardApiError(401,'denied','401'),new DashboardApiError(400,'http','400'),new DashboardApiError(0,'network','TLS')]){
    let certCalls=0;
    await assert.rejects(connectWithOptionalClientCertificate(async()=>{throw error;},async()=>{certCalls++;}));
    assert.equal(certCalls,0);
  }
});
test('cancelled certificate selection aborts; repeated challenge does not loop',async()=>{
  const challenge=()=>new DashboardApiError(400,'client_certificate_required','Certificate needed');
  let count=0;
  await assert.rejects(connectWithOptionalClientCertificate(async()=>{count++;throw challenge();},async()=>{throw new Error('Abgebrochen');}),/Abgebrochen/);
  assert.equal(count,1);
  count=0;let picks=0;
  await assert.rejects(connectWithOptionalClientCertificate(async()=>{count++;throw challenge();},async()=>{picks++;}),/Certificate needed/);
  assert.equal(count,2);assert.equal(picks,1);
});
test('simple setup shows only one primary connect action and advanced certificate fallback',()=>{
  const main=read('src/main.ts');const ui=main.split('<div class="section-title"><h2>Datenquelle</h2>')[1]?.split('<div class="section-title"><h2>Datensicherung</h2>')[0]||'';
  assert.match(ui,/data-action="dashboard-connect"/);
  assert.match(ui,/id="dashboard-advanced"/);
  for(const action of ['save-dashboard-url','probe-dashboard','dashboard-resume'])assert.doesNotMatch(ui,new RegExp(`data-action="${action}"`));
  assert.match(main,/connectWithOptionalClientCertificate/);
  assert.match(main,/await secureSession\(\)\.getToken\(\)/);
  assert.match(main,/Servermodus aktivieren/);
  assert.doesNotMatch(ui,/Unsichere Verbindung akzeptieren/);
  const serverUI=read('src/server-ui.ts');assert.match(serverUI,/Weitere Verbindungsaktionen/);
});
