# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 René Fieler (RenFie)
#
# This program is free software under the GNU GPL v2.
# See LICENSE for the complete license text.

#!/usr/bin/env python3
"""Strict SQLite import smoke test based on original Financisto CREATE TABLE SQL.

Does not claim to replace an Android app test. Independently checks required
columns and rebuilds balances from imported transactions, just as the
original app's IntegrityFix/recalculateAccountsBalances does.
"""
import json
import sqlite3
import sys

payload=json.load(sys.stdin)
raw=payload['plain']
conn=sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys=OFF')
# Required columns come directly from Financisto's original database/create/*.sql.
conn.executescript('''
CREATE TABLE currency(_id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, title TEXT NOT NULL, symbol TEXT NOT NULL,
 is_default INTEGER DEFAULT 0, decimals INTEGER DEFAULT 2);
CREATE TABLE account(_id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL, creation_date INTEGER NOT NULL,
 currency_id INTEGER NOT NULL, total_amount INTEGER NOT NULL DEFAULT 0);
CREATE TABLE category(_id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL, "left" INTEGER NOT NULL DEFAULT 0,
 "right" INTEGER NOT NULL DEFAULT 0, type INTEGER DEFAULT 0);
CREATE TABLE payee(_id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL);
CREATE TABLE transactions(_id INTEGER PRIMARY KEY AUTOINCREMENT,
 from_account_id INTEGER NOT NULL, to_account_id INTEGER NOT NULL DEFAULT 0,
 category_id INTEGER NOT NULL DEFAULT 0, project_id INTEGER NOT NULL DEFAULT 0,
 location_id INTEGER NOT NULL DEFAULT 0, note TEXT,
 from_amount INTEGER NOT NULL DEFAULT 0, to_amount INTEGER NOT NULL DEFAULT 0,
 datetime INTEGER NOT NULL, is_template INTEGER NOT NULL DEFAULT 0);
''')
known={'currency','account','category','payee','transactions'}
lines=raw.splitlines()
assert lines[0]=='PACKAGE:ru.orangesoftware.financisto'
assert '#START' in lines and lines[-1]=='#END'
current=None
fields={}
for line in lines:
    if line.startswith('$ENTITY:'):
        assert current is None
        current=line.split(':',1)[1]
        fields={}
    elif line=='$$':
        if current in known and int(fields.get('_id','0'))>0:
            columns={r[1] for r in conn.execute(f'PRAGMA table_info("{current}")')}
            values={k:v for k,v in fields.items() if k in columns}
            keys=list(values)
            try:
                conn.execute(f'INSERT INTO "{current}" ({",".join(chr(34)+k+chr(34) for k in keys)}) VALUES ({",".join("?" for _ in keys)})',list(values.values()))
            except sqlite3.IntegrityError as exc:
                raise AssertionError(f'{current} insert failed: {exc}; row {values}') from exc
        current=None
        fields={}
    elif current is not None:
        key,sep,val=line.partition(':')
        if sep:fields[key]=val
assert current is None
for kind,want in payload['expectedCounts'].items():
    got=conn.execute(f'SELECT count(*) FROM "{kind}"').fetchone()[0]
    assert got==want,(kind,got,want)
# Financisto does NOT trust account.total_amount after import: rebuild from
# transactions. An opening balance must therefore have its own transaction.
for acc,expected in payload['expectedBalances'].items():
    key=int(acc)
    debit=conn.execute('SELECT COALESCE(SUM(from_amount),0) FROM transactions WHERE from_account_id=? AND is_template=0',(key,)).fetchone()[0]
    credit=conn.execute('SELECT COALESCE(SUM(to_amount),0) FROM transactions WHERE to_account_id=? AND is_template=0',(key,)).fetchone()[0]
    got=debit+credit
    assert got==expected,(acc,got,expected)
print('strict Financisto SQLite import accepted; balances recalculated correctly')
