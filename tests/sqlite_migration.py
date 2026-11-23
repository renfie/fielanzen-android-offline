# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 René Fieler (RenFie)
#
# This program is free software under the GNU GPL v2.
# See LICENSE for the complete license text.

"""Offline regression test: existing Alpha 5 SQLite records survive Alpha 6 DDL."""
from pathlib import Path
import json,re,sqlite3
src=(Path(__file__).resolve().parent.parent/'src/database.ts').read_text()
blocks=re.findall(r'await this\.db\.execute\(`(.*?)`\);',src,re.S)
assert len(blocks)==1, 'expected native SQLite DDL block'
schema=blocks[0]
assert 'CREATE TABLE IF NOT EXISTS import_reports' in schema
with sqlite3.connect(':memory:') as db:
    # Simulate existing native Alpha 5 database; the new table is intentionally missing.
    previous=re.sub(r'CREATE TABLE IF NOT EXISTS app_settings\s*\(.*?\);','',schema,flags=re.S)
    previous=re.sub(r'CREATE TABLE IF NOT EXISTS import_reports\s*\(.*?\);','',previous,flags=re.S)
    db.executescript(previous)
    db.execute("INSERT INTO accounts (id,name,opening_cents) VALUES (12,'Girokonto',10000)")
    db.execute("INSERT INTO categories (id,name,kind) VALUES (23,'Lebensmittel','expense')")
    db.execute("INSERT INTO payees (id,name) VALUES (34,'Unbekannter Empfänger (ID 34)')")
    db.execute("""INSERT INTO bookings
    (id,type,account_id,other_account_id,category_id,payee_id,amount_cents,booking_date,note,created_at)
    VALUES (99,'expense',12,NULL,23,34,100,'2026-11-17','Test','2026-11-17T12:00:00.000Z')""")
    db.executescript(schema)
    assert db.execute('SELECT COUNT(*) FROM bookings').fetchone()[0]==1
    db.execute('INSERT INTO app_settings (key,value) VALUES (?,?)',('preferences',json.dumps({'defaultAccountId':12,'theme':'dark'})))
    assert json.loads(db.execute("SELECT value FROM app_settings WHERE key='preferences'").fetchone()[0])['defaultAccountId']==12
    assert db.execute('SELECT name FROM accounts WHERE id=12').fetchone()[0]=='Girokonto'
    report={'id':'report-test-1','kind':'inventory','payeeGaps':[{'id':34,'bookingIds':[99],'templateIds':[]}]}
    db.execute('INSERT INTO import_reports (id,report_json) VALUES (?,?)',('report-test-1',json.dumps(report)))
    assert json.loads(db.execute("SELECT report_json FROM import_reports WHERE id='report-test-1'").fetchone()[0])==report
print('PASS: SQLite migration adds import_reports and app_settings without deleting existing finance data')
