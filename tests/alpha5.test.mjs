// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {expandGzip,parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';
import {dueBookings} from '../preview/src/recurring.js';
import {accountBalance} from '../preview/src/types.js';
import {exportBackup,parseBackup} from '../preview/src/backup.js';

const lines=[
'PACKAGE:ru.orangesoftware.financisto','#START',
'$ENTITY:currency','_id:1','name:EUR','symbol:€','decimals:2','$$',
'$ENTITY:account','_id:10','title:Giro','currency_id:1','total_amount:34000','$$',
'$ENTITY:account','_id:11','title:Bargeld','currency_id:1','total_amount:2500','$$',
'$ENTITY:category','_id:100','title:Lebensmittel','$$',
'$ENTITY:payee','_id:15','title:Rewe','$$',
'$ENTITY:transactions','_id:1','datetime:1794913200000','from_account_id:10','from_amount:-2000','category_id:100','payee_id:404','note:Einkauf A','$$',
'$ENTITY:transactions','_id:2','datetime:1794913200000','from_account_id:10','from_amount:-1000','category_id:100','payee_id:404','note:Einkauf B','$$',
'$ENTITY:transactions','_id:3','datetime:1794913200000','from_account_id:10','to_account_id:11','from_amount:-500','category_id:0','payee_id:0','$$',
'$ENTITY:transactions','_id:4','datetime:1794913200000','from_account_id:10','from_amount:3500','category_id:100','payee_id:15','$$',
'$ENTITY:transactions','_id:301','datetime:1794913200000','from_account_id:10','from_amount:-1299','category_id:100','payee_id:404','is_template:2',
'recurrence:2024-01-31T12:00:00~MONTHLY:monthly_pattern_0@EVERY_NTH_DAY#count@1#interval@1#monthly_pattern_params_0@31#~INDEFINETELY:null','note:Abo','$$',
'$ENTITY:transactions','_id:302','datetime:1794913200000','from_account_id:10','from_amount:-1200','category_id:100','is_template:2','recurrence:UNKNOWN:MONTHLY','$$',
'#END'];

const source=lines.join('\n');

test('Alpha 5: deleted payee has one placeholder but counts two affected ledger entries',async()=>{
 const bytes=gzipSync(Buffer.from(source,'utf8'));
 const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const {snapshot,notes,missingPayeeIds,affectedPayeeBookings,accountChecks}=convertLegacyTables(parseLegacyText(await expandGzip(arrayBuffer)),'2026-11-17');
 assert.equal(missingPayeeIds,1);
 assert.equal(affectedPayeeBookings,2);
 const orphan=snapshot.payees.find(p=>p.id===404);
 assert.match(orphan.name,/Unbekannter Empfänger \(ID 404\)/);
 assert.equal(snapshot.bookings.filter(b=>b.payeeId===404).length,2);
 assert.equal(snapshot.bookings.length,4);
 assert.equal(accountBalance(snapshot,10),34000);
 assert.equal(accountBalance(snapshot,11),2500);
 assert(accountChecks.every(a=>a.differenceCents===0));
 assert(notes.some(n=>n.includes('möglicherweise früher gelöscht')));
});

test('Alpha 5: recognized monthly template is imported inactive with future next due and persists in JSON',()=>{
 const {snapshot,importedTemplates,skippedTemplates,notes}=convertLegacyTables(parseLegacyText(source),'2026-11-17');
 assert.equal(importedTemplates,1);
 assert.equal(skippedTemplates,1);
 assert.equal(snapshot.recurringRules.length,1);
 const rule=snapshot.recurringRules[0];
 assert.equal(rule.id,301);
 assert.equal(rule.amountCents,1299);
 assert.equal(rule.active,false);
 assert.equal(rule.frequency,'monthly');
 assert.equal(rule.dayOfMonth,31);
 assert.equal(rule.startOn,'2024-01-31');
 assert.equal(rule.nextOn,'2026-11-30');
 assert.equal(dueBookings(rule,'2027-01-31').bookings.length,0,'imported templates must not auto-post');
 const plan=dueBookings({...rule,active:true},'2027-01-31');
 assert.deepEqual(plan.bookings.map(b=>b.date),['2026-11-30','2026-12-31','2027-01-31']);
 assert(notes.some(n=>n.includes('302') && n.includes('nicht unterstützt')));
 const restored=parseBackup(exportBackup(snapshot)).snapshot;
 assert.deepEqual(restored.recurringRules, snapshot.recurringRules);
 assert.equal(restored.bookings.length,4);
});

test('Alpha 5: no template changes source balances or ledger totals',()=>{
 const {snapshot,accountChecks}=convertLegacyTables(parseLegacyText(source),'2026-11-17');
 assert.equal(snapshot.bookings.reduce((sum,b)=>sum+b.amountCents,0),7000);
 assert.equal(accountChecks.length,2);
 assert.equal(accountChecks[0].actualCents,accountChecks[0].expectedCents);
 assert.equal(accountChecks[1].actualCents,accountChecks[1].expectedCents);
});
