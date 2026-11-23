// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEuro,parseSignedEuro,accountBalance,checkBooking} from '../preview/src/types.js';

test('Cent-Beträge werden exakt konvertiert',()=>{
  assert.equal(parseEuro('1.234,56'), 123456);
  assert.equal(parseEuro('0,01'), 1);
  assert.equal(parseEuro('1.23'), 123);
  assert.equal(parseSignedEuro('-25,50'), -2550);
  assert.equal(parseSignedEuro('0,00'), 0);
  assert.throws(()=>parseEuro('0,00'));
  assert.throws(()=>parseEuro('1,234'));
  assert.throws(()=>parseEuro('1e6'));
});
test('Umbuchungen erhöhen und vermindern Kontostände symmetrisch',()=>{
  const s={
    accounts:[{id:1,name:'Giro',openingCents:10000},{id:2,name:'Bar',openingCents:2000}],
    categories:[{id:1,name:'Essen',kind:'expense'},{id:2,name:'Gehalt',kind:'income'}],payees:[],
    bookings:[
      {id:1,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:null,amountCents:1550,date:'2026-11-17',note:'',createdAt:''},
      {id:2,type:'income',accountId:1,otherAccountId:null,categoryId:2,payeeId:null,amountCents:4000,date:'2026-11-17',note:'',createdAt:''},
      {id:3,type:'transfer',accountId:1,otherAccountId:2,categoryId:null,payeeId:null,amountCents:2300,date:'2026-11-17',note:'',createdAt:''}
    ]
  };
  assert.equal(accountBalance(s,1),10150);
  assert.equal(accountBalance(s,2),4300);
  assert.equal(accountBalance(s,1)+accountBalance(s,2),14450);
  checkBooking(s.bookings[2],s);
  assert.throws(()=>checkBooking({...s.bookings[2],otherAccountId:1},s));
  assert.throws(()=>checkBooking({...s.bookings[0],date:'2026-02-31'},s));
});
