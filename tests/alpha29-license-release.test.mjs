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
  assert.equal(pkg.version,'0.1.0-alpha.30');
  assert.match(read('capacitor.config.ts'),/de\.fielanzen\.offline/);
  assert.match(read('scripts/configure-android.py'),/version_code=int\(match.group\(1\)\)-1/);
  assert.match(read('src/main.ts'),/APP_VERSION='0\.1\.0-alpha\.30'/);
});
