// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('regular 0.2.1 source and Android identity agree',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.2.1');
 assert.match(read('src/main.ts'),/export const APP_VERSION='0\.2\.1'/);
 assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
 const native=read('scripts/configure-android.py');
 assert.match(native,/stable=re\.fullmatch/);
 assert.match(native,/version_code=major\*1000000\+minor\*10000\+patch\*100/);
 assert.match(native,/version_code=int\(alpha\.group\(1\)\)-1/);
 const major=0,minor=2,patch=1;
 assert.equal(major*1000000+minor*10000+patch*100,20100);
 assert.ok(20100>20000,'patch release versionCode must exceed installed 0.2.0');
});

test('release workflow creates regular releases and enforces SemVer ordering',()=>{
 const ci=read('.github/workflows/android-apk.yml');
 assert.match(ci,/tags: \['v\*'\]/);
 assert.match(ci,/VERSION_CHECK/);
 assert.match(ci,/RELEASE_FLAGS=\(\)/);
 assert.match(ci,/if \[\[ "\$TAG" == \*-alpha\.\* \]\]/);
 assert.match(ci,/--notes-file "\$RUNNER_TEMP\/release-notes\.md"/);
 assert.match(ci,/gh release create/);
 assert.match(ci,/gh release edit/);
 assert.match(ci,/apksigner.*verify/);
 assert.match(ci,/ANDROID_KEYSTORE_BASE64/);
});

test('0.2.1 release notes are substantive and bilingual',()=>{
 const notes=read('docs/releases/v0.2.1.md');
 for(const heading of ['## Änderungen (Deutsch)','## Changes (English)','Saldoanpassung',
   'Löschauftrag','UUID','20100','SHA256']){
   assert.ok(notes.includes(heading),heading);
 }
 assert.ok(notes.length>1500);
});

test('historical alpha release notes use each version’s actual changelog entry',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fielanzen-release-'));
 try{
   for(const v of ['v0.1.0-alpha.29','v0.1.0-alpha.30','v0.1.0-alpha.31','v0.1.0-alpha.37','v0.2.0','v0.2.1']){
     const dest=join(dir,v+'.md');
     const runner=spawnSync(process.execPath,['scripts/release-notes.mjs',v,dest],{
       cwd:new URL('..',import.meta.url),encoding:'utf8'
     });
     assert.equal(runner.status,0,(runner.stderr||runner.stdout||'')+' '+v);
     const notes=readFileSync(dest,'utf8');
     assert.ok(notes.length>500);
     assert.match(notes,/Änderungen \(Deutsch\)|Änderungen \(Deutsch\)/);
     assert.match(notes,/Changes \(English\)/);
     assert.match(notes,/LICENSE/);
   }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
