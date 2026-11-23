// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');

test('Capacitor plugin proxy is returned synchronously (never promise-assimilated)',()=>{
  assert.match(code,/function nativeBackup\(\):typeof NativeAutoBackup\{/);
  assert.match(code,/return NativeAutoBackup;/);
  assert.doesNotMatch(code,/Promise\.resolve\(NativeAutoBackup\)/);
  assert.doesNotMatch(code,/await nativeBackup\(\)(?!\.)/);
  assert.doesNotMatch(code,/nativeBackup\(\)\.then\(/);
  assert.doesNotMatch(code,/checkedBackupStep\([^;]*nativeBackup\(\)/);
});

test('Capacitor Proxy thenable trap reproduces broken Alpha 15 and safe Alpha 16 behavior',async()=>{
  let wrongNativeThenCalls=0;
  const nativePlugin=new Proxy({getStatus(){return Promise.resolve({selected:true,destination:'downloads'});}}, {
    get(target,key,receiver){
      if(key==='then')return ()=>{wrongNativeThenCalls++;};
      return Reflect.get(target,key,receiver);
    }
  });
  // Simulates Alpha 15: Promise.resolve(proxy) invokes a fake .then() method
  void Promise.resolve(nativePlugin);
  await Promise.resolve(); // flush the thenable-assimilation microtask
  assert.equal(wrongNativeThenCalls,1);
  // Alpha 16: only actual method calls return Promises; the proxy itself never does
  const plugin=()=>nativePlugin;
  const status=await plugin().getStatus();
  assert.equal(status.selected,true);
  assert.equal(wrongNativeThenCalls,1);
});

test('all native plugin call sites use method Promises not proxy Promises',()=>{
  assert.match(code,/const plugin=nativeBackup\(\);/);
  assert.match(code,/plugin\.getStatus\(\)/);
  assert.match(code,/nativeBackup\(\)\.selectFolder\(\)/);
  assert.match(code,/nativeBackup\(\)\.useDownloadsFolder\(\)/);
  assert.match(code,/nativeBackup\(\)\.configure\(/);
});
