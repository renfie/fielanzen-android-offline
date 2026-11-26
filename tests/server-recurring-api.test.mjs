// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recurringCapability,parseServerRecurringRules,validateServerRecurringDraft,createRecurringPendingWrite}
  from '../preview/src/server-recurring.js';
import {parsePending} from '../preview/src/dashboard-protocol.js';
import {emptyServerData,serverPageHtml} from '../preview/src/server-ui.js';

const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const account={id:1,name:'Giro',currency:'EUR',symbol:'€',decimals:2,balanceMinor:50000,projectedBalanceMinor:50000,active:true,includedInTotal:true};
const category={id:2,name:'Wohnen',kind:'expense'};
const raw={
  id:11,revision:'a'.repeat(32),title:'Miete',kind:'expense',
  account_id:1,to_account_id:0,category_id:2,payee_id:0,payee_title:'Vermieter',
  amount_minor:-95000,note:'Wohnung',frequency:'monthly',interval_count:1,day_of_month:28,
  start_on:'2026-11-01',run_at:'09:30',end_on:null,max_occurrences:12,completed_count:3,
  next_on:'2026-11-28',mode:'manual',needs_review:''
};
const draft={
  title:'Miete',kind:'expense',account_id:1,to_account_id:0,category_id:2,
  payee_title:'Vermieter',amount_minor:95000,note:'Wohnung',frequency:'monthly',
  interval_count:1,day_of_month:28,start_on:'2026-11-01',run_at:'09:30',
  end_on:null,max_occurrences:12
};
const sample=()=>({...emptyServerData(),server:'https://example.org',
  accounts:[account],categories:[category],session:{financeMode:'web',access:'write',canWrite:true,role:'admin'},
  recurringSupported:true,recurringLoaded:true,recurringRules:parseServerRecurringRules({items:[raw]})});

test('feature flag gates recurring requests on older Dashboard versions',()=>{
  assert.equal(recurringCapability({mobile_api:1,features:{bookings:true}}),false);
  assert.equal(recurringCapability({mobile_api:1,features:{recurring_rules:false}}),false);
  assert.equal(recurringCapability({mobile_api:1,features:{recurring_rules:true}}),true);
  assert.equal(recurringCapability({mobile_api:2,features:{recurring_rules:true}}),false);
  const code=read('src/main.ts');
  assert.match(code,/const supported=await client\.recurringSupported\(\)/);
  assert.match(code,/if\(!supported\)/);
  assert.match(read('src/dashboard-api.ts'),/recurringRules\(\):Promise<ServerRecurringRule\[\]>/);
});
test('server recurring rules parse the Web ledger schema, not local SQLite data',()=>{
  const [rule]=parseServerRecurringRules({items:[raw]});
  assert.equal(rule.amountMinor,95000);
  assert.equal(rule.title,'Miete');
  assert.equal(rule.mode,'manual');
  assert.equal(rule.completedCount,3);
  assert.equal(rule.maxOccurrences,12);
  assert.equal(rule.runAt,'09:30');
  assert.equal(rule.nextOn,'2026-11-28');
  assert.throws(()=>parseServerRecurringRules({items:[{...raw,revision:'stale'}]}),/Revision/);
  assert.throws(()=>parseServerRecurringRules({items:[{...raw,mode:'automatic'}]}),/ungültig/);
  assert.throws(()=>parseServerRecurringRules({items:[raw,raw]}),/Doppelte/);
});
test('draft validation enforces positive minor amount, interval and active accounts',()=>{
  assert.deepEqual(validateServerRecurringDraft(draft,[account],[category]),draft);
  assert.throws(()=>validateServerRecurringDraft({...draft,amount_minor:-95000},[account],[category]),/positiven Betrag/);
  assert.throws(()=>validateServerRecurringDraft({...draft,interval_count:0},[account],[category]),/Wiederholungsabstand/);
  assert.throws(()=>validateServerRecurringDraft({...draft,account_id:99},[account],[category]),/Quellkonto/);
  assert.throws(()=>validateServerRecurringDraft({...draft,end_on:'2020-01-01'},[account],[category]),/Enddatum/);
});
test('each write uses a new UUID, exact endpoint and If-Match for existing rules',()=>{
  for(const [action,method,path,payload] of [
    ['create','POST','/api/mobile/v1/recurring',draft],
    ['update','PUT','/api/mobile/v1/recurring/11',draft],
    ['mode','PUT','/api/mobile/v1/recurring/11/mode',{mode:'manual'}],
    ['post','POST','/api/mobile/v1/recurring/11/post',{confirm:'BUCHEN'}],
    ['delete','DELETE','/api/mobile/v1/recurring/11',{confirm_title:'Miete'}]
  ]){
    const request=createRecurringPendingWrite('https://example.org',action,action==='create'?null:11,payload,
      action==='create'?undefined:raw.revision);
    assert.equal(request.method,method);
    assert.equal(request.path,path);
    assert.match(request.idempotencyKey,/^[0-9a-f-]{36}$/);
    assert.equal(request.ifMatch,action==='create'?undefined:raw.revision);
    assert.deepEqual(request.data,payload);
    assert.equal(parsePending(JSON.stringify(request))?.path,path);
  }
  assert.throws(()=>createRecurringPendingWrite('https://example.org','delete',11,
    {confirm_title:'Miete'},'stale'),/[Rr]evision/);
});
test('recurring UI follows local visual layout without substituting local rules',()=>{
  const data=sample();
  const html=serverPageHtml(data,'recurring');
  assert.match(html,/<h1>Wiederkehrend<\/h1>/);
  assert.match(html,/<h2>Regeln \(1\)<\/h2>/);
  assert.match(html,/Miete/);
  assert.match(html,/Manuelle Buchung/);
  assert.match(html,/server-recurring-save-mode/);
  assert.match(html,/server-recurring-edit/);
  assert.match(html,/server-recurring-delete/);
  const incompatible=sample();
  incompatible.recurringSupported=false;incompatible.recurringLoaded=false;incompatible.recurringRules=[];
  const blocked=serverPageHtml(incompatible,'recurring');
  assert.match(blocked,/noch nicht bereit/);
  assert.match(blocked,/data-action="server-recurring-add" disabled/);
  assert.doesNotMatch(blocked,/Fällige Buchung bestätigen/);
});
test('read-only keys cannot save or create recurrence in Android UI',()=>{
  const data=sample();
  data.session.canWrite=false;
  const html=serverPageHtml(data,'recurring');
  assert.match(html,/data-action="server-recurring-add" disabled/);
  assert.doesNotMatch(html,/data-action="server-recurring-save-mode"/);
  assert.doesNotMatch(html,/data-action="server-recurring-delete"/);
});
test('server recurring changes never go through local rule executor',()=>{
  const main=read('src/main.ts');
  for(const action of ['server-recurring-reload','server-recurring-add','server-recurring-edit',
    'server-recurring-save-mode','server-recurring-post','server-recurring-delete']){
    assert.match(main,new RegExp("case '"+action+"'"));
  }
  assert.match(main,/await issueServerWrite\(createRecurringPendingWrite\(/);
  assert.match(main,/if\(recurringWrite\)await loadRemoteRecurring\(\)/);
  assert.match(main,/await secure\.putPending\(/);
  assert.match(main,/if\(!remote\.recurringSupported\|\|!remote\.recurringLoaded/);
  assert.match(main,/const recurringWrite=request\.path\.startsWith\('\/api\/mobile\/v1\/recurring'\)/);
  assert.equal((main.match(/exportFinancistoCompatible\(state\)/g)||[]).length,4);
  const currentVersion=JSON.parse(read('package.json')).version;
  assert.match(currentVersion, /^0\.1\.0-alpha\.\d+$/);
  assert.ok(read('src/main.ts').includes("export const APP_VERSION='"+currentVersion+"'"));
});
