// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (p) => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('GPLv2 text and license menu are bundled for offline usage in both data modes',()=>{
  const s=read('src/main.ts');
  assert.match(s,/import gplText from '\.\.\/LICENSE\?raw'/);
  assert.match(s,/function licenseSettingsHtml\(/);
  assert.match(s,/function showLicenseDialog\(/);
  assert.match(s,/app-license/);
  assert.match(s,/serverSettingsHtml\(remote\)\+appLockSettingsHtml\(\)\+licenseSettingsHtml\(\)/);
  assert.match(s,/\$\{licenseSettingsHtml\(\)\}/);
  assert.match(s,/\$\{esc\(gplText\)\}/);
  assert.match(read('LICENSE'),/GNU GENERAL PUBLIC LICENSE/);
});
test('release workflow requires private signing secrets, verifies and publishes signed APK',()=>{
  const s=read('.github/workflows/android-apk.yml');
  for(const secret of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']) assert.match(s,new RegExp(secret));
  assert.match(s,/apksigner.*verify/);
  assert.match(s,/gh release create/);
  assert.match(s,/if-no-files-found: error/);
  assert.match(s,/build-tools;36\.0\.0/);
});
test('project version bumped while package ID remains compatible',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(pkg.version, /^(?:\d+\.\d+\.\d+|0\.1\.0-alpha\.\d+)$/);
  assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
  assert.match(read('scripts/configure-android.py'),/version_code=major\*1000000\+minor\*10000\+patch\*100/);
  assert.ok(read('src/main.ts').includes("export const APP_VERSION='"+pkg.version+"'"));
});
