// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const read = (path) => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ownPaths = [
  ...readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.ts')).map(f=>'src/'+f),
  ...readdirSync(new URL('../native/de/fielanzen/offline/',import.meta.url)).filter(f=>f.endsWith('.java')).map(f=>'native/de/fielanzen/offline/'+f),
  ...readdirSync(new URL('../scripts/',import.meta.url)).filter(f=>/\.(?:sh|py|ps1|ts)$/.test(f)).map(f=>'scripts/'+f),
  ...readdirSync(new URL('../tests/',import.meta.url)).filter(f=>/\.(?:mjs|py|java)$/.test(f)).map(f=>'tests/'+f),
  ...readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(f=>f.endsWith('.yml')).map(f=>'.github/workflows/'+f),
  'style.css','index.html','capacitor.config.ts','vite.config.ts'
];

test('all authored source files have SPDX GPL2 and full copyright holder headers',()=>{
  for(const path of ownPaths){
    const head=read(path).slice(0,750);
    assert.match(head,/SPDX-License-Identifier:\s*GPL-2\.0-only/,path);
    assert.match(head,/Copyright \(C\) 2026 René Fieler \(RenFie\)/,path);
  }
  assert.ok(ownPaths.length>=85,'unexpectedly few checked source files');
});
test('copyright is visible in both local and server settings and in license dialog',()=>{
  const s=read('src/main.ts');
  assert.match(s,/function licenseSettingsHtml\(/);
  assert.match(s,/Copyright © 2026 René Fieler \(RenFie\)/);
  assert.match(s,/class="copyright-notice"/);
  assert.match(s,/serverSettingsHtml\(remote\)\+appLockSettingsHtml\(\)\+licenseSettingsHtml\(\)/);
  assert.match(s,/\$\{licenseSettingsHtml\(\)\}/);
  assert.match(read('style.css'),/\.copyright-notice\{/);
  assert.match(read('scripts/configure-android.py'),/MainActivity\.java'\)\.write_text\('''\/\/ SPDX-License-Identifier: GPL-2\.0-only/);
});
test('copyright attribution and source license remain consistent',()=>{
  assert.match(read('NOTICE.md'),/Copyright \(C\) 2026 René Fieler \(RenFie\)/);
  assert.match(read('NOTICE.en.md'),/Copyright \(C\) 2026 René Fieler \(RenFie\)/);
  assert.match(read('README.md'),/Copyright © 2026 René Fieler \(RenFie\)/);
  assert.match(read('README.de.md'),/Copyright © 2026 René Fieler \(RenFie\)/);
  assert.match(read('LICENSE'),/GNU GENERAL PUBLIC LICENSE/);
  const currentVersion=JSON.parse(read('package.json')).version;
  assert.match(currentVersion, /^(?:\d+\.\d+\.\d+|0\.1\.0-alpha\.\d+)$/);
  assert.ok(read('src/main.ts').includes("export const APP_VERSION='"+currentVersion+"'"));
  assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
});
