// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (p) => readFileSync(new URL('../'+p,import.meta.url), 'utf8');
test('Native Android content root alone handles all system insets',()=>{
 const cfg=read('scripts/configure-android.py');
 assert.match(cfg,/WindowCompat.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
 assert.match(cfg,/android\.R\.id\.content/);
 assert.match(cfg,/WindowInsetsCompat\.Type\.systemBars\(\)/);
 assert.match(cfg,/WindowInsetsCompat\.Type\.displayCutout\(\)/);
 assert.match(cfg,/WindowInsetsCompat\.Type\.ime\(\)/);
 assert.match(cfg,/view\.setPadding\(system\.left, system\.top, system\.right, bottom\)/);
 assert.doesNotMatch(cfg,/getLocationOnScreen/);
 assert.match(read('capacitor.config.ts'),/insetsHandling: 'disable'/);
 const css=read('style.css');
 assert.match(css,/html\.native-android\{--ui-safe-top:0px;--ui-safe-bottom:0px;/);
 assert.match(css,/safe-area-inset-top/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('GPL v2 rights and duties are directly visible in both settings views',()=>{
 const s=read('src/main.ts');
 assert.match(s,/GPLv2 · Rechte & Pflichten/);
 assert.match(s,/Deine Rechte/);
 assert.match(s,/Deine Pflichten bei Weitergabe/);
 assert.match(s,/Private Änderungen nur für dich verwenden/);
 assert.match(s,/\$\{esc\(gplText\)\}/);
 assert.match(s,/serverSettingsHtml\(remote\)\+appLockSettingsHtml\(\)\+licenseSettingsHtml\(\)/);
 assert.match(s,/\$\{licenseSettingsHtml\(\)\}/);
});
test('Android alpha 30 keeps the package identity and finance export calls',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'0.1.0-alpha.31');
 assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
 assert.match(read('src/main.ts'),/APP_VERSION='0\.1\.0-alpha\.31'/);
 assert.equal((read('src/main.ts').match(/exportFinancistoCompatible\(state\)/g)||[]).length,4);
});
