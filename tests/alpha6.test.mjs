// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';
import {fromLegacyConversion,inventoryReport,prependReport,toPayeeCsv,validateImportReports} from '../preview/src/import-report.js';
import {exportBackup,parseBackup} from '../preview/src/backup.js';
import {accountBalance} from '../preview/src/types.js';

const legacyLines=['PACKAGE:ru.orangesoftware.financisto','#START',
 '$ENTITY:currency','_id:1','name:EUR','decimals:2','$$',
 '$ENTITY:account','_id:10','title:Girokonto','currency_id:1','total_amount:0','$$',
 '$ENTITY:category','_id:20','title:Lebensmittel','$$',
 '$ENTITY:payee','_id:30','title:Rewe','$$'];
const makeBooking=(id,payee)=>['$ENTITY:transactions',`_id:${id}`,'datetime:1794913200000','from_account_id:10','from_amount:-1',`payee_id:${payee}`,'category_id:20','$$'];
const size=3338,gapCount=720;
const source=[...legacyLines];
for(let i=0;i<size;i++)source.push(...makeBooking(10000+i,20000+i%gapCount));
source.push('$ENTITY:transactions','_id:90000','datetime:1794913200000','from_account_id:10','from_amount:-100','category_id:20','payee_id:20010','is_template:2','recurrence:WRONG','$$');
source.push('#END');

test('Alpha 6: all 720 orphan payees + 3338 references are preserved in detailed report',()=>{
 const conversion=convertLegacyTables(parseLegacyText(source.join('\n')),'2026-11-17');
 const report=fromLegacyConversion(conversion,'financisto-test.backup','import');
 assert.equal(report.payeeGaps.length,720);
 assert.equal(report.payeeGaps.reduce((sum,g)=>sum+g.bookingIds.length,0),3338);
 assert.equal(report.payeeGaps.reduce((sum,g)=>sum+g.templateIds.length,0),1);
 assert.equal(report.unsupportedTemplateIds[0],90000);
 assert.deepEqual(report.payeeGaps[0].bookingIds,[10000,10720,11440,12160,12880]);
 assert.equal(report.counts.bookings,3338);
 assert.equal(accountBalance(conversion.snapshot,10),0);
 assert.equal(report.accountChecks[0].differenceCents,0);
 const restored=parseBackup(exportBackup({...conversion.snapshot,importReports:[report]})).snapshot;
 assert.deepEqual(restored.importReports[0],report,'report survives JSON export/restore');
 assert.equal(restored.bookings.length,3338);
 assert.equal(restored.importReports[0].payeeGaps.length,720);
});

test('Alpha 6: old Alpha 5 without stored import report gets inventory without guessing source metadata',()=>{
 const conversion=convertLegacyTables(parseLegacyText(source.join('\n')),'2026-11-17');
 const alpha5=JSON.parse(exportBackup(conversion.snapshot));
 alpha5.schemaVersion=2;
 delete alpha5.data.importReports;
 const restored=parseBackup(JSON.stringify(alpha5)).snapshot;
 assert.deepEqual(restored.importReports,[]);
 const inventory=inventoryReport(restored);
 assert.equal(inventory.kind,'inventory');
 assert.equal(inventory.payeeGaps.length,720);
 assert.equal(inventory.payeeGaps.reduce((n,g)=>n+g.bookingIds.length,0),3338);
 assert.equal(inventory.sourceFile,null);
 assert.equal(inventory.counts.skippedTemplates,null);
 assert.deepEqual(inventory.unsupportedTemplateIds,[]);
 assert.match(inventory.notes[0],/kein vollständiges Original-Importprotokoll/);
});

test('Alpha 6: CSV export includes complete payee gap list, safe numerical identifiers only',()=>{
 const conversion=convertLegacyTables(parseLegacyText(source.join('\n')),'2026-11-17');
 const report=fromLegacyConversion(conversion,'test.backup','analysis');
 const csv=toPayeeCsv(report);
 assert(csv.startsWith('\ufeffEmpfaenger-ID;Buchungen;Vorlagen;'));
 assert.equal(csv.trim().split('\r\n').length,721);
 assert.match(csv,/20010;5;1;/);
 assert(csv.includes('10720'));
});

test('Alpha 6: saved reports are capped at 10 and invalid report content is rejected',()=>{
 const conversion=convertLegacyTables(parseLegacyText(source.join('\n')),'2026-11-17');
 const r=fromLegacyConversion(conversion,'test.backup','analysis');
 let reports=[];
 for(let i=0;i<13;i++)reports=prependReport(reports,{...r,id:`report-test-${i}`});
 assert.equal(reports.length,10);
 assert.equal(reports[0].id,'report-test-12');
 assert.equal(reports.at(-1).id,'report-test-3');
 const bad=structuredClone(r);
 bad.payeeGaps[0].bookingIds.push(-1);
 assert.throws(()=>validateImportReports([bad]),/Importprotokoll ungültig/);
 assert.throws(()=>validateImportReports([r,r]),/Bericht-ID/);
});
