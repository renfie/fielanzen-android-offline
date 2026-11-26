// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rankSuggestions,suggestionLayout} from '../preview/src/suggestion-ui.js';
const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Android suggestions search umlauts, prefer matching prefixes and recent payees',()=>{
  const rows=[{id:1,name:'Flüge'},{id:2,name:'Überweisung'},{id:3,name:'Müllabfuhr'},{id:4,name:'Müller'}];
  assert.deepEqual(rankSuggestions(rows,'mull').map(x=>x.id),[3,4]);
  assert.deepEqual(rankSuggestions(rows,'ueber').map(x=>x.id),[]); // NFKD handles accents, not "ue" transliteration
  const options=[{id:1,name:'Adler'},{id:2,name:'Rewe'},{id:3,name:'Rewe Markt'}];
  assert.deepEqual(rankSuggestions(options,'re',7,new Map([[3,8],[2,1]])).map(x=>x.id),[3,2]);
  assert.deepEqual(rankSuggestions(options,'',2,new Map([[2,8],[3,2]])).map(x=>x.id),[2,3]);
});
test('suggestions choose free space above Android keyboard and remain compact',()=>{
  const field={left:25,top:420,bottom:465,width:290};
  const small={left:0,right:360,top:0,bottom:490};
  const result=suggestionLayout(field,small,25);
  assert.ok(result?.above);
  assert.ok(result.maxHeight<=188);
  assert.ok(result.top>=0);
  const higher=suggestionLayout({left:25,top:100,bottom:145,width:290},small,12);
  assert.equal(higher?.above,false);
  assert.equal(suggestionLayout(field,{...small,top:411,bottom:470},5),null);
});
test('both local and server booking/rule editors share viewport-aware suggestion menu',()=>{
  const main=read('src/main.ts');
  assert.match(main,/attachDialogSuggestions\(dlg,payee,menu\)/);
  assert.match(main,/attachDialogSuggestions\(dlg,input,menu\)/);
  assert.match(main,/attachDialogSuggestions\(dlg,field,menu\)/);
  assert.match(main,/rankSuggestions\(items\(\),query,7/);
  assert.match(read('style.css'),/\.keyboard-aware-menu/);
  assert.match(read('src/suggestion-ui.ts'),/visualViewport/);
  assert.match(read('package.json'),/0\.1\.0-alpha\.33/);
});
