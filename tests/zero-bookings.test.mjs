import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {parseLegacyText,convertLegacyTables,expandGzip} from '../preview/src/financisto.js';
import {exportBackup,parseBackup} from '../preview/src/backup.js';
import {accountBalance,checkBooking,parseEuro} from '../preview/src/types.js';
import {checkRecurring} from '../preview/src/recurring.js';

const source = [
  'PACKAGE:ru.orangesoftware.financisto', '#START',
  '$ENTITY:currency','_id:1','name:Euro','symbol:€','decimals:2','$$',
  '$ENTITY:account','_id:1','title:Girokonto','currency_id:1','total_amount:9750','$$',
  '$ENTITY:account','_id:2','title:Sparkonto','currency_id:1','total_amount:5000','$$',
  '$ENTITY:category','_id:1','title:Lebensmittel','$$',
  '$ENTITY:payee','_id:2','title:Rewe','$$',
  '$ENTITY:transactions','_id:2112','datetime:1794913200000','from_account_id:1',
    'from_amount:0','category_id:1','payee_id:2','note:Informationsbuchung','$$',
  '$ENTITY:transactions','_id:2113','datetime:1794913200000','from_account_id:1',
    'to_account_id:2','from_amount:0','note:Umbuchung ohne Betrag','$$',
  '$ENTITY:transactions','_id:2114','datetime:1794913200000','from_account_id:1',
    'from_amount:-250','category_id:1','payee_id:2','note:Normale Buchung','$$',
  '#END'
].join('\n');

test('zero-value legacy bookings are retained, identified and do not change account balances', async () => {
  const bytes = gzipSync(Buffer.from(source, 'utf8'));
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
  const restored = await expandGzip(ab);
  const {snapshot,notes} = convertLegacyTables(parseLegacyText(restored));
  assert.equal(snapshot.bookings.length, 3);
  assert.equal(snapshot.bookings.find(x=>x.id===2112).amountCents,0);
  assert.equal(snapshot.bookings.find(x=>x.id===2112).note,'Informationsbuchung');
  assert.equal(snapshot.bookings.find(x=>x.id===2112).type,'expense');
  assert.equal(snapshot.bookings.find(x=>x.id===2113).type,'transfer');
  assert.equal(snapshot.bookings.find(x=>x.id===2113).amountCents,0);
  assert.equal(snapshot.bookings.find(x=>x.id===2114).amountCents,250);
  assert.equal(accountBalance(snapshot,1),9750);
  assert.equal(accountBalance(snapshot,2),5000);
  assert(notes.some(x=>x.startsWith('Hinweis: 2 Nullbuchungen') && x.includes('2112') && x.includes('2113')));
  const restoredBackup=parseBackup(exportBackup(snapshot)).snapshot;
  assert.equal(restoredBackup.bookings.length,3);
  assert.equal(restoredBackup.bookings.find(x=>x.id===2112).amountCents,0);
});

test('zero value editable for existing imported bookings but new entries still require a positive amount',()=>{
  assert.equal(parseEuro('0,00',true),0);
  assert.throws(()=>parseEuro('0,00'),/größer als 0/);
  const {snapshot}=convertLegacyTables(parseLegacyText(source));
  const zero=snapshot.bookings.find(x=>x.id===2112);
  assert.doesNotThrow(()=>checkBooking(zero,snapshot));
  const first=snapshot.bookings.find(x=>x.id===2114);
  const rule={...first,title:'Jeden Monat',frequency:'monthly',interval:1,startOn:'2026-11-17',nextOn:'2026-11-17',dayOfMonth:17,endOn:null,maxRuns:null,runs:0,active:true,amountCents:0};
  assert.throws(()=>checkRecurring(rule,snapshot),/größer als 0/);
});
