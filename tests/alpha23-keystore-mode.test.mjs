// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Android Keystore AES/GCM generates IV itself, retains legacy decrypt compatibility',()=>{
 const java=read('native/de/fielanzen/offline/FieLanzenSecureSessionPlugin.java');
 assert.match(java,/setRandomizedEncryptionRequired\(true\)/);
 assert.match(java,/cipher\.init\(Cipher\.ENCRYPT_MODE,secret\(\)\)/);
 assert.match(java,/byte\[\] iv=cipher\.getIV\(\)/);
 assert.doesNotMatch(java,/cipher\.init\(Cipher\.ENCRYPT_MODE,secret\(\),new GCMParameterSpec/);
 assert.match(java,/cipher\.init\(Cipher\.DECRYPT_MODE,secret\(\),new GCMParameterSpec\(128,iv\)\)/);
 assert.match(java,/return "v1:"\+Base64\.encodeToString/);
 assert.match(java,/KeyStore\.getInstance\("AndroidKeyStore"\)/);
 assert.doesNotMatch(java,/ENCRYPTION_PADDING_PKCS7|AES\/ECB|MODE_PRIVATE.*token/);
});
test('local status is always explicit, server preview must be separately activated',()=>{
 const src=read('src/main.ts');
 assert.match(src,/AKTIV: DASHBOARD-SERVER/);
 assert.match(src,/AKTIV: LOKAL/);
 assert.match(src,/data-action="dashboard-activate-preview"/);
 assert.match(src,/data-action="dashboard-cancel-preview"/);
 assert.match(src,/data-action="server-switch-local"/);
 assert.match(src,/async function activateStagedDashboard/);
 const connect=src.split('async function connectServerFromSettings()')[1].split('async function activateStagedDashboard()')[0];
 assert.match(connect,/stagedDashboard=\{/);
 assert.doesNotMatch(connect,/setMode\(\{mode:'server'\}\)/);
 assert.doesNotMatch(connect,/serverMode=true/);
 const activation=src.split('async function activateStagedDashboard()')[1].split('async function resumeServerSession()')[0];
 assert.match(activation,/await secure\.saveToken\(/);
 assert.match(activation,/await secure\.setMode\(\{mode:'server'\}\)/);
 assert.ok(activation.indexOf('await secure.saveToken(')<activation.indexOf('await secure.setMode('));
 assert.match(activation,/serverMode=true/);
 assert.match(src,/stagedDashboard=null;\s*serverMode=false/);
 assert.doesNotMatch(connect,/window\.confirm/);
});
test('Android app ID and version advance, no DB migration',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.1.0-alpha.25');
 assert.match(read('scripts/configure-android.py'),/versionCode 25/);
 assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
 assert.match(read('scripts/build-android-vm.sh'),/VERSION="0\.1\.0-alpha\.25"/);
});
