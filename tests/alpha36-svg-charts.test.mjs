// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHistory} from '../preview/src/history-view.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const filter={first:'2026-10',second:'2026-11',currency:'EUR',account:'all',category:'all'};
const cats=[
 {categoryId:11,category:'Miete',amountMinor:50000,bookingCount:1},
 {categoryId:12,category:'Einkauf / Lebensmittel',amountMinor:30000,bookingCount:4},
 {categoryId:13,category:'Verkehr & Wohnen',amountMinor:20000,bookingCount:2}
];
const report={currency:'EUR',decimals:2,from:'2026-10',to:'2026-11',complete:true,months:[
 {month:'2026-10',incomeMinor:200000,expenseMinor:100000,balanceMinor:100000,
  bookingCount:8,transferCount:0,transferMinor:0,
  categories:{expense:cats,income:[{categoryId:14,category:'Gehalt',amountMinor:200000,bookingCount:1}]}},
 {month:'2026-11',incomeMinor:0,expenseMinor:0,balanceMinor:0,bookingCount:0,
  transferCount:0,transferMinor:0,categories:{expense:[],income:[]}}
]};
const html=()=>renderHistory({
 prefix:'server-history',filter,accounts:[{id:1,name:'Giro',currency:'EUR'}],
 categories:cats.map(c=>({id:c.categoryId,name:c.category})),report
});

test('SVG donut is visible without unsafe inline CSS on Android WebView',()=>{
 const output=html();
 assert.match(output,/<svg class="history-donut" viewBox="0 0 100 100"/);
 assert.equal((output.match(/class="history-donut-segment"/g)||[]).length,4);
 assert.match(output,/pathLength="100"/);
 assert.match(output,/stroke-dasharray="50\.00000 50\.00000"/);
 assert.match(output,/stroke-dasharray="30\.00000 70\.00000"/);
 assert.match(output,/stroke-dashoffset="-50\.00000"/);
 assert.match(output,/>Einkauf \/ Lebensmittel</);
 assert.doesNotMatch(output,/\sstyle=/);
 assert.doesNotMatch(output,/conic-gradient/);
 assert.doesNotMatch(output,/<canvas/i);
});

test('monthly bars use proportional SVG rects, with no fake full-size zero bars',()=>{
 const output=html();
 assert.match(output,/<svg class="history-bar-svg" viewBox="0 0 100 12"/);
 assert.match(output,/class="history-bar history-income-bar"[^>]+width="100\.000"/);
 assert.match(output,/class="history-bar history-expense-bar"[^>]+width="50\.000"/);
 assert.equal((output.match(/class="history-bar history-income-bar"/g)||[]).length,1);
 assert.equal((output.match(/class="history-bar history-expense-bar"/g)||[]).length,1);
 assert.doesNotMatch(output,/style="width:/);
});

test('legend uses SVG fill attributes and escapes category names',()=>{
 const escaped={...report,months:[{...report.months[0],categories:{
    ...report.months[0].categories,expense:[{...cats[0],category:'<script>alert(1)</script>',amountMinor:100000}]
  }},report.months[1]]};
 const output=renderHistory({
  prefix:'local-history',filter,accounts:[{id:1,name:'Giro',currency:'EUR'}],categories:[],report:escaped
 });
 assert.match(output,/<svg class="history-pie-color"/);
 assert.match(output,/<rect width="12" height="12" rx="3" fill="#087e83"/);
 assert.doesNotMatch(output,/<script>alert/);
 assert.match(output,/&lt;script&gt;/);
 assert.doesNotMatch(output,/\sstyle=/);
});

test('external CSS is present and strict CSP remains active',()=>{
 const css=read('style.css');
 const htmlIndex=read('index.html');
 const history=read('src/history-view.ts');
 assert.match(css,/\.history-donut\{/);
 assert.match(css,/\.history-bar-svg\{/);
 assert.match(htmlIndex,/style-src 'self'/);
 assert.doesNotMatch(htmlIndex,/unsafe-inline/);
 assert.doesNotMatch(history,/style=/);
 assert.match(read('package.json'),/0\.1\.0-alpha\.36/);
});
