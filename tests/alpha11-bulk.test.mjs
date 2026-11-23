import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseLegacyText,convertLegacyTables} from '../preview/src/financisto.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {accountBalance} from '../preview/src/types.js';

test('14,959 transactions + 12 accounts survive an experimental Financisto export roundtrip',async()=>{
 const rows=['PACKAGE:ru.orangesoftware.financisto','#START','$ENTITY:currency','_id:1','name:EUR','symbol:€','decimals:2','$$',
 '$ENTITY:category','_id:4','title:Lebensmittel','$$'];
 for(let i=1;i<=12;i++)rows.push('$ENTITY:account',`_id:${i}`,`title:Konto ${i}`,'currency_id:1','total_amount:100000','$$');
 for(let i=1;i<=14959;i++)rows.push('$ENTITY:transactions',`_id:${i}`,`datetime:${Date.parse('2026-11-18T12:00:00Z')}`,`from_account_id:${1+i%12}`,'from_amount:-101','category_id:4','payee_id:0','note:Lasttest','$$');
 rows.push('#END');
 const source=rows.join('\n');const initial=convertLegacyTables(parseLegacyText(source)).snapshot;
 assert.equal(initial.bookings.length,14959);
 const zipped=new File([gzipSync(source)],'original.backup');
 const result=await exportFinancistoCompatible(initial,zipped);
 assert.equal(result.summary.bookings,14959);
 const round=convertLegacyTables(parseLegacyText(gunzipSync(result.bytes).toString('utf8'))).snapshot;
 assert.equal(round.bookings.length,14959);
 assert.equal(round.accounts.length,12);
 for(const a of initial.accounts)assert.equal(accountBalance(initial,a.id),accountBalance(round,a.id));
});
