// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {exportBackup,parseBackup,validateSnapshot} from '../preview/src/backup.js';

const original={
  accounts:[{id:1,name:'Giro',openingCents:100050},{id:2,name:'Bargeld',openingCents:-500}],
  categories:[{id:1,name:'Essen',kind:'expense'},{id:2,name:'Arbeit',kind:'income'}],
  payees:[{id:1,name:'Rewe'}],
  bookings:[
    {id:1,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:1,amountCents:1050,date:'2026-11-17',note:'Test',createdAt:'2026-11-17T09:00:00.000Z'},
    {id:2,type:'transfer',accountId:1,otherAccountId:2,categoryId:null,payeeId:null,amountCents:2500,date:'2026-11-17',note:'',createdAt:'2026-11-17T09:01:00.000Z'},
    {id:3,type:'income',accountId:1,otherAccountId:null,categoryId:2,payeeId:null,amountCents:1000,date:'2026-11-17',note:'',createdAt:'2026-11-17T09:02:00.000Z'}
  ], recurringRules:[], importReports:[], settings:{defaultAccountId:null,theme:'system'}
};
const clone=x=>structuredClone(x);
test('Backup ist JSON und kann vollständig importiert werden',()=>{
  const text=exportBackup(original);
  const {snapshot,exportedAt}=parseBackup(text);
  assert.deepEqual(snapshot,original);
  assert.ok(Date.parse(exportedAt)>0);
});
test('Leeres Backup funktioniert',()=>{
  const empty={accounts:[],categories:[],payees:[],bookings:[],recurringRules:[],importReports:[],settings:{defaultAccountId:null,theme:'system'}};
  assert.deepEqual(parseBackup(exportBackup(empty)).snapshot,empty);
});
test('Falsches Format, falsche Schema-Version und kaputtes JSON werden zurückgewiesen',()=>{
  assert.throws(()=>parseBackup('abc'),/JSON/);
  assert.throws(()=>parseBackup(JSON.stringify({format:'financisto',schemaVersion:1,data:original})),/kein FieLanzen/);
  assert.throws(()=>parseBackup(exportBackup(original).replace('"schemaVersion": 4','"schemaVersion": 5')),/unbekannte/);
});
test('Sicherung mit ungültigen Buchungs-Referenzen wird zurückgewiesen',()=>{
  const broken=clone(original);broken.bookings[0].categoryId=123;
  assert.throws(()=>validateSnapshot(broken),/Kategorie/);
});
test('Doppelte IDs, doppelte Kontonamen und doppelte Kategorienamen werden zurückgewiesen',()=>{
  const x=clone(original);x.accounts.push({id:1,name:'Zweitkonto',openingCents:0});
  assert.throws(()=>validateSnapshot(x),/doppelte ID/);
  const y=clone(original);y.accounts.push({id:3,name:'giro',openingCents:0});
  assert.throws(()=>validateSnapshot(y),/doppelter Name/);
  const z=clone(original);z.categories.push({id:7,name:'essen',kind:'expense'});
  assert.throws(()=>validateSnapshot(z),/doppelter Name/);
});
test('Überlange Notizen, ungültige Datumswerte und falsche Kategorieart werden zurückgewiesen',()=>{
  const a=clone(original);a.bookings[0].note='z'.repeat(1001);
  assert.throws(()=>validateSnapshot(a),/Notiz/);
  const b=clone(original);b.bookings[0].date='2026-02-31';
  assert.throws(()=>validateSnapshot(b),/Datum/);
  const c=clone(original);c.bookings[0].categoryId=2;
  assert.throws(()=>validateSnapshot(c),/Kategorie/);
});

test('Alte Alpha-3-JSON-Sicherung wird weiterhin angenommen',()=>{
  const previous=JSON.parse(exportBackup(original));
  previous.schemaVersion=1;delete previous.data.recurringRules;delete previous.data.settings;
  assert.deepEqual(parseBackup(JSON.stringify(previous)).snapshot,original);
});
