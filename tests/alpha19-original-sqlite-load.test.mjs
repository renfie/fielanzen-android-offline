import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {emptySnapshot,accountBalance} from '../preview/src/types.js';
import {exportFinancistoStandalone} from '../preview/src/financisto-export.js';
import {auditOriginalFinancisto} from '../preview/src/financisto-audit.js';

test('14,959 synthetic bookings and 12 accounts survive strict original SQLite-import and balance rebuild',async()=>{
  const s=emptySnapshot();
  s.accounts=Array.from({length:12},(_,i)=>({id:i+1,name:'Testkonto '+(i+1),openingCents:(i+1)*10437-60000}));
  s.categories=[{id:5,name:'Lebensmittel',kind:'expense'},{id:6,name:'Gehalt',kind:'income'}];
  s.payees=[{id:7,name:'Testempfänger'}];
  s.bookings=Array.from({length:14959},(_,i)=>{
    const accountId=(i%12)+1, type=i%3===0?'transfer':i%3===1?'expense':'income';
    return {id:i+1,type,accountId,otherAccountId:type==='transfer'?((accountId%12)+1):null,
      categoryId:type==='expense'?5:type==='income'?6:null,payeeId:type==='transfer'?null:7,
      amountCents:(i%2300)+1,date:'2026-11-17',note:'Synthetischer Test',createdAt:'2026-11-17T12:00:00.000Z'};
  });
  const {bytes}=await exportFinancistoStandalone(s);
  const plain=gunzipSync(bytes).toString('utf8');
  const audit=auditOriginalFinancisto(plain);
  assert.equal(audit.transactions,14959+12);
  assert.equal(audit.accounts,12);
  const expectedBalances=Object.fromEntries(s.accounts.map(a=>[String(a.id),accountBalance(s,a.id)]));
  const result=spawnSync('python3',[new URL('./verify_original_financisto_sqlite.py',import.meta.url).pathname],{
    input:JSON.stringify({plain,expectedCounts:{currency:1,account:12,category:2,payee:1,transactions:14959+12},expectedBalances}),
    encoding:'utf8',maxBuffer:24*1024*1024,timeout:45000
  });
  assert.equal(result.status,0,result.stderr?.slice(0,1500)||result.stdout?.slice(0,1500));
});
