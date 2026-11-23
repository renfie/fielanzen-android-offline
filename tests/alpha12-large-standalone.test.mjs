import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {convertLegacyTables,parseLegacyText} from '../preview/src/financisto.js';
test('14,959 synthetic freshly-created transactions / 12 accounts export without original file', async()=>{
 const s=emptySnapshot();
 s.accounts=Array.from({length:12},(_,i)=>({id:i+1,name:`Konto ${i+1}`,openingCents:100000*(i+1)}));
 s.categories=[{id:1,kind:'expense',name:'Einkauf'},{id:2,kind:'income',name:'Lohn'}];
 s.payees=[{id:1,name:'Ein Verkäufer'}];
 s.bookings=Array.from({length:14959},(_,i)=>({id:i+1,type:i%11===0?'income':'expense',accountId:i%12+1,
   otherAccountId:null,categoryId:i%11===0?2:1,payeeId:1,amountCents:(i%1500)+1,
   date:'2026-11-19',note:`Testbuchung ${i+1}`,createdAt:'2026-11-19T12:00:00Z'}));
 const out=await exportFinancistoCompatible(s);
 assert.equal(out.summary.bookings,14959);
 const round=convertLegacyTables(parseLegacyText(gunzipSync(out.bytes).toString('utf8'))).snapshot;
 assert.equal(round.bookings.length,14959);
 for(const acc of s.accounts)assert.equal(accountBalance(s,acc.id),accountBalance(round,acc.id),acc.name);
});
