// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {convertLegacyTables,parseLegacyText} from '../preview/src/financisto.js';
import {accountBalance} from '../preview/src/types.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const backupText=`PACKAGE:ru.orangesoftware.financisto
#START
$ENTITY:currency
_id:1
name:Euro
symbol:€
decimals:2
$$
$ENTITY:account
_id:1
title:Giro
total_amount:15000
currency_id:1
$$
$ENTITY:category
_id:9
title:Essen
$$
$ENTITY:transactions
_id:70
datetime:1794913200000
from_account_id:1
from_amount:-1000
payee_id:123
category_id:9
$$
$ENTITY:transactions
_id:71
datetime:1794913200000
from_account_id:1
from_amount:-2000
payee_id:123
category_id:55
$$
$ENTITY:transactions
_id:72
datetime:1794913200000
from_account_id:1
from_amount:3000
payee_id:-1
category_id:0
$$
#END`;

test('orphan payee is retained as a labelled placeholder without aborting import',()=>{
 const {snapshot,notes}=convertLegacyTables(parseLegacyText(backupText));
 assert.equal(snapshot.bookings.length,3);
 assert.equal(snapshot.payees.length,1);
 assert.equal(snapshot.payees[0].id,123);
 assert.match(snapshot.payees[0].name,/Unbekannter Empfänger.*123/);
 assert.equal(snapshot.bookings[0].payeeId,123);
 assert.equal(snapshot.bookings[1].payeeId,123);
 assert.equal(snapshot.bookings[2].payeeId,null);
 assert(notes.some(x=>x.includes('123')));
 assert.equal(accountBalance(snapshot,1),15000);
});
test('orphan category is retained as separately identified category',()=>{
 const {snapshot,notes}=convertLegacyTables(parseLegacyText(backupText));
 const orphan=snapshot.categories.find(c=>c.name.includes('55'));
 assert.ok(orphan);
 assert.equal(snapshot.bookings[1].categoryId,orphan.id);
 assert(notes.some(x=>x.includes('55')));
});
test('preview has real wolf favicon and enforced desktop scroll area',()=>{
 const html=readFileSync(resolve(root,'preview/index.html'),'utf8');
 const css=readFileSync(resolve(root,'preview/style.css'),'utf8');
 assert.match(html, /wolf-favicon\.png\?v=alpha24-1/);
 assert.doesNotMatch(html, /favicon\.svg/);
 const png=readFileSync(resolve(root,'preview/wolf-favicon.png'));
 assert.deepEqual([...png.subarray(0,8)], [137,80,78,71,13,10,26,10]);
 assert.match(css,/overflow-y:scroll/);
 assert.ok(existsSync(resolve(root,'preview/src/main.js')));
 assert.match(html,/src="\.\/src\/main\.js\?v=alpha24-1"/);
});
