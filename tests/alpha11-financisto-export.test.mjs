import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';
import {accountBalance} from '../preview/src/types.js';

const plain=[
 'PACKAGE:ru.orangesoftware.financisto','#START',
 '$ENTITY:currency','_id:1','name:EUR','symbol:€','decimals:2','$$',
 '$ENTITY:account','_id:101','title:Giro','currency_id:1','total_amount:13200','type:CASH','$$',
 '$ENTITY:account','_id:102','title:Bar','currency_id:1','total_amount:5600','$$',
 '$ENTITY:category','_id:200','title:Lebensmittel','left:1','right:2','$$',
 '$ENTITY:category','_id:201','title:Arbeit','left:3','right:4','$$',
 '$ENTITY:payee','_id:30','title:Rewe','$$',
 '$ENTITY:transactions','_id:501','datetime:1794913200000','from_account_id:101','to_account_id:0','from_amount:-1000','category_id:200','payee_id:30','note:Äpfel','custom_legacy_extension:abc123','$$',
 '$ENTITY:transactions','_id:502','datetime:1794913200000','from_account_id:101','to_account_id:102','from_amount:-1000','to_amount:1000','category_id:0','payee_id:0','note:Umbuchung','$$',
 '$ENTITY:transactions','_id:503','datetime:1794913200000','from_account_id:101','from_amount:2000','category_id:201','payee_id:0','note:Gehaltsbonus','$$',
 '$ENTITY:transactions','_id:550','datetime:1794913200000','from_account_id:101','from_amount:-9000','category_id:200','is_template:2','recurrence:unknown','$$',
 '$ENTITY:unknown_plugin','_id:1','secret_extension:hello','$$',
 '#END'
].join('\n');
const file=(content=plain)=>new File([gzipSync(Buffer.from(content,'utf8'))],'financisto-original.backup',{type:'application/gzip'});
const initial=()=>convertLegacyTables(parseLegacyText(plain)).snapshot;

test('native Financisto gzip return export preserves unknown fields and safely omits old templates',async()=>{
 const snapshot=initial();
 snapshot.bookings.push({id:601,type:'expense',accountId:101,otherAccountId:null,
  categoryId:snapshot.categories.find(c=>c.kind==='expense').id,payeeId:30,amountCents:55,
  date:'2026-11-19',note:'Neuer Einkauf',createdAt:'2026-11-19T12:00:00Z'});
 const result=await exportFinancistoCompatible(snapshot,file());
 const decoded=gunzipSync(result.bytes).toString('utf8');
 assert.match(decoded,/custom_legacy_extension:abc123/);
 assert.match(decoded,/\$ENTITY:unknown_plugin/);
 assert.doesNotMatch(decoded,/_id:550\n/);
 const again=convertLegacyTables(parseLegacyText(decoded)).snapshot;
 assert.equal(again.bookings.length,4);
 assert.equal(again.bookings.find(b=>b.id===601).amountCents,55);
 assert.equal(accountBalance(again,101),accountBalance(snapshot,101));
 assert.equal(accountBalance(again,102),accountBalance(snapshot,102));
 assert.equal(result.summary.originalTemplatesOmitted,1);
});

test('unsafe source is rejected without creating any export',async()=>{
 const snapshot=initial();
 await assert.rejects(()=>exportFinancistoCompatible(snapshot,new File([gzipSync('not a backup')],'no.backup')),/Unbekanntes|unvollständig/i);
 snapshot.bookings.pop();
 await assert.rejects(()=>exportFinancistoCompatible(snapshot,file()),/Originalbuchungen fehlen/);
});

test('unsafe multiline note cannot inject a Financisto line or block',async()=>{
 const snapshot=initial();snapshot.bookings[0].note='Text\n$ENTITY:account';
 await assert.rejects(()=>exportFinancistoCompatible(snapshot,file()),/Zeilenumbruch/);
});
