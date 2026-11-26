// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('both sources use the same initially collapsed booking-card markup',()=>{
  const src=read('src/server-ui.ts'),local=read('src/main.ts'),shared=read('src/booking-card-ui.ts');
  assert.match(local,/return bookingCardHtml\(\{/);
  assert.match(src,/return bookingCardHtml\(\{/);
  assert.match(src,/expanded:data\.expandedBookingId===b\.id/);
  assert.match(src,/label:'Revision'/);
  assert.match(shared,/<article class="booking-entry/);
  assert.match(shared,/aria-expanded=/);
  assert.match(shared,/class="booking-details"/);
  assert.match(shared,/card\.expanded\?/);
  assert.match(src,/server-edit-booking/);
  assert.match(src,/server-delete-booking/);
  assert.doesNotMatch(src,/settings-line server-booking/);
});
test('same display settings on local and server with saved 30 50 100 and sort',()=>{
  const p=read('src/booking-list-preferences.ts'),main=read('src/main.ts'),server=read('src/server-ui.ts');
  for(const count of [30,50,100])assert.match(p,new RegExp(`value=\\"${count}\\"`));
  assert.match(p,/localStorage\.setItem\(STORAGE_KEY/);
  assert.match(main,/bookingListSettingsHtml\(readBookingList\(\)\)/);
  assert.match(server,/bookingListSettingsHtml\(readBookingList\(\)\)/);
  assert.match(server,/sortTransactionRows/);
  assert.match(main,/sortTransactionRows\(state\.bookings/);
});
test('matching category and payee field dimensions, mobile bounded popup',()=>{
  const css=read('style.css');
  assert.match(css,/server-search-field \.category-picker>input\[type="search"\]/);
  assert.match(css,/server-search-field \.payee-picker>input/);
  assert.match(css,/min-height:48px/);
  assert.match(css,/bottom:calc\(100% \+ 3px\)/);
});
test('booking type is always displayed and recurrence only when proven',()=>{
  const server=read('src/server-ui.ts'),local=read('src/main.ts'),parser=read('src/dashboard-protocol.ts');
  for(const type of ['Ausgabe','Einnahme','Umbuchung'])assert.match(server,new RegExp(type));
  assert.match(server,/b\.isRecurring===true/);
  assert.match(server,/b\.isRuleMatched===true/);
  assert.match(parser,/raw\.is_recurring/);
  assert.match(local,/b\.recurringRuleId/);
  assert.match(read('src/database.ts'),/ALTER TABLE bookings ADD COLUMN recurring_rule_id/);
  assert.match(read('src/recurring.ts'),/recurringRuleId:rule\.id/);
});
test('native Android app lock uses system credential or biometric, stored natively',()=>{
  const java=read('native/de/fielanzen/offline/FieLanzenAppLockPlugin.java');
  const config=read('scripts/configure-android.py'),main=read('src/main.ts');
  assert.match(java,/BiometricPrompt\.PromptInfo/);
  assert.match(java,/BIOMETRIC_STRONG/);
  assert.match(java,/DEVICE_CREDENTIAL/);
  assert.match(java,/FLAG_SECURE/);
  assert.match(java,/getSharedPreferences\(PREFS/);
  assert.match(config,/registerPlugin\(FieLanzenAppLockPlugin\.class\)/);
  assert.match(config,/androidx\.biometric:biometric:1\.1\.0/);
  assert.match(main,/lockScreen\(\)/);
  assert.match(main,/appLock\(\)\.getStatus\(\)/);
  assert.match(main,/if\(appLockEnabled&&!appUnlocked\)\{renderLocked\(\);return;\}/);
  assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
});
test('manual and automatic exports are unchanged and always export recurrence',()=>{
  const main=read('src/main.ts');
  assert.equal((main.match(/exportFinancistoCompatible\(state\)/g)||[]).length,4);
  assert.doesNotMatch(main,/confirmScheduledExport|include-financisto-schedules/);
});
