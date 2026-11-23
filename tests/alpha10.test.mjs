import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {filterManagedCategories,categorySuggestions} from '../preview/src/category-ui.js';
import {checkBooking,emptySnapshot,accountBalance} from '../preview/src/types.js';
import {checkRecurring} from '../preview/src/recurring.js';
import {exportBackup,parseBackup} from '../preview/src/backup.js';
const src=(f)=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
const cats=[
  {id:1,name:'Lebensmittel',kind:'expense'},
  {id:2,name:'Miete',kind:'expense'},
  {id:3,name:'Lohn',kind:'income'},
  {id:4,name:'Mieterstattung',kind:'income'},
  {id:5,name:'Äpfel & Birnen',kind:'expense'},
];
test('categories: case insensitive search by name, Unicode, original IDs and kind',()=>{
  assert.deepEqual(filterManagedCategories(cats,'MIETE','expense').map(x=>x.id),[2]);
  assert.deepEqual(filterManagedCategories(cats,'äpfel').map(x=>x.id),[5]);
  assert.deepEqual(filterManagedCategories(cats,'3').map(x=>x.id),[3]);
  assert.deepEqual(filterManagedCategories(cats,'miete','income').map(x=>x.id),[4]);
  assert.deepEqual(filterManagedCategories(cats,'', 'income').map(x=>x.id),[3,4]);
});
test('category suggestions prioritize frequently used and never mix income/expense',()=>{
  const usage=new Map([[1,31],[2,151],[3,800],[5,90]]);
  assert.deepEqual(categorySuggestions(cats,'expense','',usage).map(x=>x.id),[2,5,1]);
  assert.deepEqual(categorySuggestions(cats,'income','miE',usage).map(x=>x.id),[4]);
  assert.equal(categorySuggestions(cats,'expense','absolut nicht vorhanden',usage).length,0);
  assert.equal(categorySuggestions(cats,'expense','',usage,1).length,1);
});
test('new category picker used for booking and recurring; category creation is explicit',()=>{
  const m=src('src/main.ts');
  for(const marker of ['function categoryPickerHtml(',"setupCategoryPicker(dlg,'book')","setupCategoryPicker(dlg,'rule')",'data-category-create','await storage.addCategory(name,kind)','selected.value=String(c.id)','category-query']) assert.ok(m.includes(marker),`missing ${marker}`);
  assert.match(m,/input\.addEventListener\('input',\(\)=>\{selected\.value='';populate\(\);\}\)/);
  assert.match(m,/checkBooking\(input,state\)/);
  assert.match(m,/checkRecurring\(input,state\)/);
  assert.match(m,/categoryPickerHtml\('rule',type,selectedCategory\)/);
});
test('two collapsed management lists, searchable category admin with kind filter and paged results',()=>{
  const m=src('src/main.ts');
  for(const marker of ["let categoriesOpen=false","let payeesOpen=false","category-search","category-kind-filter","category-results","category-management","payee-management","toggle-categories","toggle-payees","more-categories","updateCategoryResults()"])
    assert.ok(m.includes(marker),`missing ${marker}`);
  assert.match(m,/categoriesOpen\?'':'hidden'/);
  assert.match(m,/payeesOpen\?'':'hidden'/);
  const css=src('style.css');
  assert.match(css,/#category-management\[hidden\],#payee-management\[hidden\]/);
  assert.match(css,/html\[data-theme="dark"\] \.category-query/);
});
test('recurring rules now offer the same payee selection and manual new-name support as bookings',()=>{
  const m=src('src/main.ts');
  assert.match(m,/payeePickerHtml\('rule',rule\?\.payeeId\)/);
  assert.match(m,/setupPayeePicker\(dlg,'rule'\)/);
  assert.match(m,/if\(payeeName\)input\.payeeId=await storage\.addPayee\(payeeName\)/);
});
test('existing snapshot and old backups retain all IDs, balances, settings and recurring data',()=>{
  const s=emptySnapshot();
  s.accounts=[{id:1,name:'Giro',openingCents:12500},{id:2,name:'Bargeld',openingCents:2500}];
  s.categories=cats;
  s.payees=[{id:10,name:'X & Y'}];
  s.settings={defaultAccountId:1,theme:'dark'};
  for(let i=1;i<=14959;i++)s.bookings.push({id:i,type:'expense',accountId:1,otherAccountId:null,categoryId:1,payeeId:10,amountCents:100,date:'2026-11-19',note:'',createdAt:'2026-11-19T10:00:00Z'});
  const before=accountBalance(s,1);
  const restored=parseBackup(exportBackup(s)).snapshot;
  assert.equal(restored.bookings.length,14959);
  assert.equal(accountBalance(restored,1),before);
  assert.deepEqual(restored.settings,s.settings);
  assert.equal(restored.categories[3].name,'Mieterstattung');
  assert.match(src('src/database.ts'),/createConnection\('fielanzen_offline'/);
  assert.match(src('src/database.ts'),/indexedDB\.open\('fielanzen-offline-preview', 4\)/);
});
test('version is 13 in Android and browser, stable package ID, no Linux GUI needed',()=>{
  const p=JSON.parse(src('package.json'));
  assert.equal(p.version,'0.1.0-alpha.25');
  assert.match(src('capacitor.config.ts'),/de\.fielanzen\.offline/);
  assert.match(src('scripts/configure-android.py'),/versionCode 25/);
  assert.match(src('scripts/build-android-vm.sh'),/VERSION="0\.1\.0-alpha\.25"/);
  assert.match(src('preview/src/main.js'),/0\.1\.0-alpha\.25/);
  assert.equal(src('preview/style.css'),src('style.css'));
  assert.ok(existsSync(new URL('../preview/src/category-ui.js',import.meta.url)));
});
