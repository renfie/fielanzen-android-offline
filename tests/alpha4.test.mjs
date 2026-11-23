// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {parseLegacyText,convertLegacyTables,expandGzip} from '../preview/src/financisto.js';
import {dueBookings,nextDueDate,checkRecurring} from '../preview/src/recurring.js';
import {exportBackup,parseBackup,validateSnapshot} from '../preview/src/backup.js';
import {accountBalance,emptySnapshot} from '../preview/src/types.js';

const lines=[
  'PACKAGE:ru.orangesoftware.financisto','#START',
  '$ENTITY:currency','_id:1','name:Euro','symbol:€','decimals:2','$$',
  '$ENTITY:account','_id:101','title:Girokonto','currency_id:1','total_amount:99000','$$',
  '$ENTITY:account','_id:102','title:Sparkonto','currency_id:1','total_amount:52500','$$',
  '$ENTITY:category','_id:200','title:Lebensmittel','$$',
  '$ENTITY:category','_id:201','title:Gehalt','$$',
  '$ENTITY:payee','_id:30','title:Rewe','$$',
  '$ENTITY:transactions','_id:501','datetime:1794913200000','from_account_id:101','from_amount:-1000','category_id:200','payee_id:30','note:Einkauf','$$',
  '$ENTITY:transactions','_id:502','datetime:1794913200000','from_account_id:101','to_account_id:102','from_amount:-2500','category_id:0','payee_id:0','$$',
  '$ENTITY:transactions','_id:503','datetime:1794913200000','from_account_id:101','from_amount:20000','category_id:201','payee_id:0','$$',
  '$ENTITY:transactions','_id:504','datetime:1794913200000','from_account_id:101','from_amount:-10000','category_id:200','is_template:2','$$',
  '#END'
];
const text=lines.join('\n');
const decoded=await expandGzip(new Uint8Array(gzipSync(Buffer.from(text))).buffer);
assert.equal(decoded,text);
const {snapshot,skippedTemplates}=convertLegacyTables(parseLegacyText(decoded));
assert.equal(skippedTemplates,1);
assert.equal(snapshot.bookings.length,3);
assert.equal(snapshot.accounts.length,2);
assert.equal(snapshot.recurringRules.length,0);
assert.equal(snapshot.accounts.find(a=>a.id===101).openingCents,82500);
assert.equal(snapshot.accounts.find(a=>a.id===102).openingCents,50000);
assert.equal(accountBalance(snapshot,101),99000);
assert.equal(accountBalance(snapshot,102),52500);
assert.equal(snapshot.bookings.find(b=>b.id===502).type,'transfer');
const saved=exportBackup(snapshot);
assert.equal(parseBackup(saved).snapshot.bookings.length,3);
const old=JSON.parse(saved);old.schemaVersion=1;delete old.data.recurringRules;
assert.equal(parseBackup(JSON.stringify(old)).snapshot.recurringRules.length,0);
const dateRule = {
 id:1,title:'Miete', type:'expense',accountId:101,otherAccountId:null,
 categoryId:snapshot.categories.find(c=>c.kind==='expense').id,payeeId:null,
 amountCents:120000,note:'',frequency:'monthly',interval:1,startOn:'2024-01-31',
 nextOn:'2024-01-31',dayOfMonth:31,endOn:'2024-04-30',maxRuns:null,runs:0,active:true
};
checkRecurring(dateRule,snapshot);
assert.equal(nextDueDate(dateRule,'2024-01-31'),'2024-02-29');
assert.equal(nextDueDate(dateRule,'2024-02-29'),'2024-03-31');
const plan=dueBookings(dateRule,'2024-04-30');
assert.deepEqual(plan.bookings.map(x=>x.date),['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
assert.equal(plan.active,false);
assert.equal(plan.runs,4);
assert.equal(dueBookings({...dateRule, ...plan},'2024-04-30').bookings.length,0);
const weekly={...dateRule,frequency:'weekly',interval:2,startOn:'2024-02-01',nextOn:'2024-02-01',dayOfMonth:1,endOn:null,maxRuns:2};
assert.deepEqual(dueBookings(weekly,'2024-08-01').bookings.map(x=>x.date),['2024-02-01','2024-02-15']);
let reject=false;
try{convertLegacyTables({...parseLegacyText(decoded),currency:[{_id:'1',name:'USD',decimals:'2'}]});}catch(e){reject=true;}
assert(reject,'USD should be rejected');
reject=false;
try{parseLegacyText('PACKAGE:other.app\n#START\n#END');}catch(e){reject=true;}
assert(reject,'unknown backup should be rejected');
const withRule=validateSnapshot({...snapshot,recurringRules:[dateRule]});
assert.equal(parseBackup(exportBackup(withRule)).snapshot.recurringRules[0].nextOn,'2024-01-31');
console.log('PASS: gzip, Financisto import, EUR validation, two accounts balances, transfer, templates, v1/v2 backup, recurring leap dates, weekly interval, limits');
