#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 René Fieler (RenFie)
#
# This program is free software under the GNU GPL v2.
# See LICENSE for the complete license text.

"""Compare Financisto backup structure without printing financial data.
Usage: python3 fielanzen-backup-diagnose.py failed.backup working.backup
The program reads local files only. It never transmits or prints account names,
bookings, transaction amounts, payees, or notes.
"""
import sys, gzip, re
from collections import Counter, defaultdict
from pathlib import Path

REQ = {
  'currency': {'_id','name','title','symbol'},
  'account': {'_id','title','creation_date','currency_id','total_amount'},
  'category': {'_id','title','left','right'},
  'payee': {'_id','title'},
  'transactions': {'_id','from_account_id','to_account_id','category_id','from_amount','to_amount','datetime'},
}
KNOWN = set(REQ)

def inspect(path):
    raw = Path(path).read_bytes()
    if raw.startswith(b'\x1f\x8b'):
        raw = gzip.decompress(raw)
        enc = 'gzip'
    else:
        enc = 'plain'
    plain = raw.decode('utf-8-sig')
    lines = plain.splitlines()
    counts=Counter(); fields=defaultdict(set); missing=Counter(); numeric=Counter(); dup=Counter(); ids=defaultdict(set)
    fk=Counter(); references=[]
    header={}; i=0; ended=False
    while i<len(lines):
        line=lines[i]; i+=1
        if line == '#END': ended=True; continue
        if line.startswith('$ENTITY:'):
            entity=line[len('$ENTITY:'):]
            vals={}; closed=False
            while i<len(lines):
                s=lines[i]; i+=1
                if s=='$$': closed=True; break
                if ':' in s:
                    k,v=s.split(':',1); vals[k]=v
            counts[entity]+=1; fields[entity].update(vals)
            if not closed: fk['unclosed_entity']+=1
            missing[entity]+=len(REQ.get(entity,set())-vals.keys())
            for k in ('_id','from_account_id','to_account_id','category_id','payee_id','currency_id','from_amount','to_amount','datetime'):
                if k in vals and not re.fullmatch(r'-?\d+',vals[k]): numeric[entity]+=1
            ident=vals.get('_id')
            if ident is not None:
                if ident in ids[entity]: dup[entity]+=1
                ids[entity].add(ident)
            if entity=='transactions': references.append({k:vals.get(k,'0') for k in ['from_account_id','to_account_id','category_id','payee_id']})
            if entity=='account': references.append({'account_currency':vals.get('currency_id','')})
        elif not counts and ':' in line and not line.startswith('#'):
            key,val=line.split(':',1)
            if key in ('PACKAGE','VERSION_CODE','VERSION_NAME','DATABASE_VERSION'): header[key]=val
    for refs in references:
        if 'account_currency' in refs and refs['account_currency'] not in ids['currency']:fk['unknown_account_currency']+=1
        if 'from_account_id' in refs and refs['from_account_id'] not in ids['account']:fk['unknown_transaction_account']+=1
        if refs.get('to_account_id') not in (None,'','0') and refs['to_account_id'] not in ids['account']:fk['unknown_transfer_account']+=1
        if refs.get('category_id') not in (None,'','0','-1') and refs['category_id'] not in ids['category']:fk['unknown_category_reference']+=1
        if refs.get('payee_id') not in (None,'','0') and refs['payee_id'] not in ids['payee']:fk['unknown_payee_reference']+=1
    return dict(encoding=enc, header=header, counts=counts, fields=fields, missing=missing, numeric=numeric, dup=dup, fk=fk, ended=ended)

def show(data,label):
    print('\n'+'='*68+'\n'+label)
    print('Format:',data['encoding'],'| Endmarkierung:', 'ja' if data['ended'] else 'NEIN')
    print('Kopf:', ' '.join(f'{k}={v}' for k,v in data['header'].items()))
    for entity in sorted(set(data['counts'])|KNOWN):
        count=data['counts'][entity]
        if not count and entity not in data['counts']: continue
        print(f'{entity}: {count} Datensaetze | Pflichtfelder fehlen: {data["missing"][entity]} | fehlerhafte Zahlen: {data["numeric"][entity]} | doppelte IDs: {data["dup"][entity]}')
    print('Referenzwarnungen (Anzahlen):', dict(data['fk']))
    print('Feldnamen der wichtigen Entitaeten (keine Werte):')
    for entity in sorted(KNOWN):
        if data['counts'][entity]:print(f'  {entity}: '+', '.join(sorted(data['fields'][entity])))

if __name__=='__main__':
    if len(sys.argv)<2:
        sys.exit('Aufruf: python3 fielanzen-backup-diagnose.py <alpha18.backup> [funktionierendes-dashboard.backup]')
    for path in sys.argv[1:]:
        try:show(inspect(path),Path(path).name)
        except Exception as exc: print(f'Fehler beim Lesen von {Path(path).name}: {type(exc).__name__}: {exc}')
    print('\nEs wurden keine Namen, Notizen oder Buchungsbetraege ausgegeben oder uebertragen.')
