import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('static preview resolves to shipped JavaScript, not TypeScript source',()=>{
  const html=readFileSync(resolve(root,'preview/index.html'),'utf8');
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(scripts.length,1);
  const src=scripts[0].split('?')[0].replace(/^\.\//,'');
  assert.match(src,/\.js$/);
  assert.ok(existsSync(resolve(root,'preview',src)),`Missing preview asset ${src}`);
  assert.doesNotMatch(html,/src="\/src\/main\.ts"/);
});
