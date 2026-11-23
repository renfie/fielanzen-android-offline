// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(resolve(root,p),'utf8');

test('native exports use explicit Android Share; browser download stays separate',()=>{
  const src=file('src/file-export.ts');
  assert.match(src,/runningNatively\(\)/);
  assert.match(src, /Directory\.Cache/);
  assert.match(src, /Encoding\.UTF8/);
  assert.match(src, /Share\.share\(/);
  assert.match(src, /URL\.createObjectURL/);
  assert.doesNotMatch(src, /fetch\(/);
});
test('native finance import uses bounded SQLite batches and one transaction',()=>{
  const src=file('src/database.ts');
  assert.match(src, /batch\.length>=200/);
  assert.match(src, /this\.db\.executeSet\(items,false\)/);
  assert.match(src, /await this\.db\.rollbackTransaction\(/);
});
test('Capacitor Android plugins and CLI build present',()=>{
  const pkg=JSON.parse(file('package.json'));
  for(const dep of ['@capacitor/android','@capacitor/core','@capacitor-community/sqlite','@capacitor/filesystem','@capacitor/share','@capacitor/app'])
    assert.ok(pkg.dependencies[dep],dep);
  assert.ok(existsSync(resolve(root,'scripts/build-android-vm.sh')));
  assert.ok(existsSync(resolve(root,'scripts/configure-android.py')));
});
test('original wolf launcher icons and Android backup exclusions are bundled',()=>{
  const densities=['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'];
  for (const d of densities) for(const n of ['ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png'])
    assert.ok(existsSync(resolve(root,`assets/android-res/mipmap-${d}/${n}`)));
  const src=file('scripts/configure-android.py');
  assert.match(src,/allowBackup/);
  assert.match(src,/dataExtractionRules/);
  assert.match(src,/fullBackupContent/);
});
