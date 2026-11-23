// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {emptySnapshot} from '../preview/src/types.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('all three UI backup pathways export everything without any old switch',()=>{
 const m=read('src/main.ts');
 assert.equal((m.match(/exportFinancistoCompatible\(state\)/g)||[]).length,4);
 assert.doesNotMatch(m,/confirmScheduledExport|include-financisto-schedules|save-financisto-schedules-settings|settings\.exportScheduledToFinancisto/);
});
test('even old opt-out parameter cannot strip recurrence',async()=>{
 const s=emptySnapshot();
 s.accounts=[{id:1,name:'Giro',openingCents:0}];
 s.categories=[{id:2,name:'Einkauf',kind:'expense'}];
 s.payees=[];
 s.bookings=[];
 s.recurringRules=[{id:1,title:'Miete',type:'expense',accountId:1,otherAccountId:null,categoryId:2,payeeId:null,amountCents:1000,note:'',frequency:'monthly',interval:1,startOn:'2026-12-01',nextOn:'2026-12-01',dayOfMonth:1,endOn:null,maxRuns:null,runs:0,active:true}];
 const result=await exportFinancistoCompatible(s,undefined,{includeScheduled:false});
 const text=gunzipSync(result.bytes).toString('utf8');
 assert.equal((text.match(/is_template:2/g)||[]).length,1);
 assert.equal(result.summary.scheduledExported,1);
});
