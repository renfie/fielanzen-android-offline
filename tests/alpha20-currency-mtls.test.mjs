import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {emptySnapshot} from '../preview/src/types.js';
import {exportFinancistoCompatible} from '../preview/src/financisto-export.js';
import {auditOriginalFinancisto} from '../preview/src/financisto-audit.js';
const read = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function legacyChar(value){return value.length>2?value.charAt(1):'\u0000';}

test('Alpha 20 exports quoted EUR separators consumed by original Financisto CurrencyCache',async()=>{
 const s=emptySnapshot();s.accounts=[{id:1,name:'Test',openingCents:2446900}];
 const {bytes}=await exportFinancistoCompatible(s);
 const plain=gunzipSync(bytes).toString('utf8');
 assert.match(plain,/\$ENTITY:currency\n[^]*?decimal_separator:','\ngroup_separator:'.'\n/);
 assert.equal(legacyChar("','"),',');assert.equal(legacyChar("'.'"),'.');
 assert.equal(legacyChar(','),'\u0000'); // precisely the Alpha 19 bug
 assert.doesNotThrow(()=>auditOriginalFinancisto(plain));
 assert.throws(()=>auditOriginalFinancisto(plain.replace("decimal_separator:','",'decimal_separator:,')),/Trennzeichen/);
});

test('Android mTLS asks the system KeyChain, never exports private keys, never disables TLS validation',()=>{
 const java=read('native/de/fielanzen/offline/FieLanzenMtlsHttpPlugin.java');
 assert.match(java,/KeyChain\.choosePrivateKeyAlias/);
 assert.match(java,/KeyChain\.getPrivateKey/);
 assert.match(java,/getCertificateChain/);
 assert.match(java,/SSLContext\.getInstance\("TLS"\)/);
 assert.match(java,/setInstanceFollowRedirects\(false\)/);
 assert.doesNotMatch(java,/setHostnameVerifier|checkServerTrusted\s*\(/);
 assert.match(java,/ALLOWED_HEADERS/);
 assert.match(java,/mTLS-Host oder API-Pfad/);
 assert.match(read('scripts/configure-android.py'),/registerPlugin\(FieLanzenMtlsHttpPlugin.class\)/);
 assert.match(read('src/main.ts'),/Client-Zertifikat manuell auswählen/);
 assert.match(read('src/dashboard-api.ts'),/await useMtlsFor\(normalized\)/);
 assert.match(read('src/dashboard-api.ts'),/If-Match/);
});
