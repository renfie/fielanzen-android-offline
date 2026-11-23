// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('server default account is server-specific and editable in server settings',()=>{
  const ui=file('src/server-ui.ts'),main=file('src/main.ts');
  assert.match(ui,/srv-default-account/);
  assert.match(ui,/server-save-default/);
  assert.match(main,/fielanzen-server-default:'\+remote\.server/);
  assert.match(main,/booking\?\.accountId\)\?\?remote\.accounts\.find\(a=>a\.id===remoteDefaultAccount\(\)\)/);
});
test('server category and payee are searchable and not native long selects/datalist',()=>{
  const src=file('src/main.ts').split('function serverCreateDialog(')[1].split('async function issueServerWrite(')[0];
  assert.match(src,/remotePicker\(dlg,'srv-category-search'/);
  assert.match(src,/remotePicker\(dlg,'srv-payee'/);
  assert.doesNotMatch(src,/<datalist id="srv-payee-suggestions"/);
  assert.match(src,/Bitte die Kategorie aus der Vorschlagsliste auswählen/);
  const css=file('style.css');assert.match(css,/bottom:calc\(100% \+ 3px\)/);
});
test('backup exports include schedules with no hidden setting or confirmation',()=>{
 const src=file('src/main.ts');
 assert.doesNotMatch(src,/confirmScheduledExport|include-financisto-schedules|save-financisto-schedules-settings/);
 assert.doesNotMatch(src,/state\.settings\.exportScheduledToFinancisto/);
 assert.match(src,/async function stageCurrentSnapshot[\s\S]*?exportFinancistoCompatible\(state\)/);
 assert.match(src,/async function backupNow[\s\S]*?exportFinancistoCompatible\(state\)/);
 assert.match(src,/case 'backup-share-export':[\s\S]*?exportFinancistoCompatible\(state\)/);
 assert.match(src,/summary\.scheduledExported/);
});
