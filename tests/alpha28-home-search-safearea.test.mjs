import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const main=source('src/main.ts');
const server=source('src/server-ui.ts');

test('local homepage uses same 30/50/100 preferences and incremental loading',()=>{
  assert.match(main,/let visibleHomeBookingCount = readBookingList\(\)\.pageSize/);
  assert.match(main,/homeBookings\(\):Booking\[\]\{return localSearchMatches\(sortedLocalBookings\(\),homeBookingQuery\);\}/);
  assert.match(main,/home-booking-search/);
  assert.match(main,/home-booking-results/);
  assert.match(main,/visibleHomeBookingCount\+=readBookingList\(\)\.pageSize/);
  assert.match(main,/updateHomeResults\(\)/);
});
test('both server pages search cached pages and optionally fetch more; no dashboard code',()=>{
  assert.match(server,/server-\$\{screen\}-search/);
  assert.match(server,/serverBookingResultsHtml\(data/);
  assert.match(server,/filterRemoteBookings\(/);
  assert.match(server,/Weitere Serverseiten durchsuchen/);
  assert.match(main,/loadMoreRemote\(view==='home'\)/);
  assert.match(main,/remote\.searchHome=field\.value/);
  assert.match(main,/remote\.searchBookings=field\.value/);
  assert.match(main,/remote\.nextBefore&&matches\(\)<desired/);
});
test('Android safe area is native-detected and supports PWA env fallback',()=>{
  const android=source('scripts/configure-android.py');
  const css=source('style.css');
  assert.match(android,/WindowCompat\.setDecorFitsSystemWindows/);
  assert.match(android,/WindowInsetsCompat\.Type\.statusBars/);
  assert.match(android,/getLocationOnScreen/);
  assert.match(android,/Math\.max\(0, bars\.top - position\[1\]\)/);
  assert.match(css,/safe-area-inset-top/);
  assert.match(css,/calc\(12px \+ var\(--ui-safe-top\)\)/);
  assert.match(css,/dialog\[open\]/);
  assert.match(main,/classList\.toggle\('native-android'/);
});
test('financisto export and original package identification unchanged',()=>{
  assert.equal((main.match(/exportFinancistoCompatible\(state\)/g)||[]).length,4);
  assert.equal(source('capacitor.config.ts').includes("appId: 'de.fielanzen.offline'"),true);
  assert.match(source('package.json'),/0\.1\.0-alpha\.28/);
});
test('server search recognizes categories, payees, amounts and excludes unrelated rows',async()=>{
  const m=await import('../preview/server-ui.js');
  const accounts=[{id:1,name:'Comdirect neu',currency:'EUR',symbol:'€',decimals:2,balanceMinor:0,projectedBalanceMinor:0,active:true,includedInTotal:true}];
  const categories=[{id:2,name:'Telekommunikation',kind:'expense'}];
  const bookings=[{id:3,revision:'rev',kind:'expense',date:'2026-11-21',accountId:1,toAccountId:null,categoryId:2,amountMinor:4298,payeeTitle:'Telekom',note:'Handy'}];
  for(const q of ['Telekommunikation','Telekom','Comdirect','42,98','Handy','2026-11-21','Ausgabe'])assert.equal(m.filterRemoteBookings(bookings,q,accounts,categories).length,1,q);
  assert.equal(m.filterRemoteBookings(bookings,'Supermarkt',accounts,categories).length,0);
  globalThis.localStorage={getItem:()=>null};
  const data={...m.emptyServerData(),server:'https://example.org',accounts,categories,bookings};
  for(const page of ['home','bookings']){
    const html=m.serverPageHtml(data,page);
    assert.match(html,new RegExp('server-'+page+'-search'));
    assert.match(html,/Telekom/);
    assert.match(html,/server-booking-results/);
  }
});
