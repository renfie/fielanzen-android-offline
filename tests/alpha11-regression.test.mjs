// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('version 13, same package ID, full no-GUI project build and existing backup supported',()=>{
 assert.equal(JSON.parse(file('package.json')).version,'0.1.0-alpha.25');
 assert.match(file('scripts/configure-android.py'),/versionCode 25/);
 assert.match(file('scripts/build-android-vm.sh'),/VERSION="0\.1\.0-alpha\.25"/);
 assert.match(file('capacitor.config.ts'),/de\.fielanzen\.offline/);
 assert.match(file('src/backup.ts'),/export const BACKUP_SCHEMA = 4/);
});
test('automatic folder-selection errors can be retried and picker is started on UI thread',()=>{
 assert.doesNotMatch(file('src/main.ts'),/Promise\.resolve\(NativeAutoBackup\)/);
 assert.match(file('src/main.ts'),/return NativeAutoBackup;/);
 assert.match(file('src/main.ts'),/if\(!chosen\.selected\)throw/);
 assert.match(file('native/de/fielanzen/offline/FieLanzenAutoBackupPlugin.java'),/startActivityForResult\(call, intent, "folderChosen"\)/);
 assert.match(file('src/main.ts'),/Der ausgewählte Ordner|Ordnerfreigabe/);
});
test('collapsed filters, always visible quick search, collapsed home balances and tracked corrections',()=>{
 const main=file('src/main.ts');
 for(const part of ['let bookingFiltersOpen=false','let homeBalancesOpen=false','booking-quick-search','home-account-balances','reconcile-account'])assert.ok(main.includes(part));
 assert.ok(main.indexOf('booking-quick-search')<main.indexOf('booking-advanced-filters'));
 assert.match(file('src/database.ts'),/INSERT INTO bookings/);
});
test('one Financisto export path is used for both scheduled and manual .backup; no old test section',()=>{
 const main=file('src/main.ts');
 assert.match(main,/const \{bytes\}=await exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.match(main,/const \{bytes,summary\}=await exportFinancistoCompatible\(state,undefined,\{includeScheduled:/);
 assert.doesNotMatch(main,/Financisto-kompatibler Export \(Testfunktion\)/);
 assert.doesNotMatch(main,/financisto-export-template-input/);
 assert.match(main,/Automatische Sicherung aktivieren/);
 assert.match(main,/vollständige FieLanzen-Sicherung \(JSON\)/);
});
