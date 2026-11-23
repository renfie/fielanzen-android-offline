// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {Snapshot, BookingType} from './types.js';
import {accountBalance} from './types.js';
export interface ReconciliationPlan {
  kind:Extract<BookingType,'income'|'expense'>;
  amountCents:number;
  categoryName:string;
  categoryId:number|null;
  note:string;
  date:string;
  oldBalance:number;
  targetBalance:number;
}
/**
 * A transparent account reconciliation creates a regular adjustment booking,
 * never silently rewriting imported history or the account opening balance.
 * Amounts are whole cents; no floating-point arithmetic.
 */
export function planAccountReconciliation(s:Snapshot,accountId:number,targetBalance:number,date:string,note:string):ReconciliationPlan|null{
  if(!s.accounts.some(a=>a.id===accountId))throw new Error('Konto zum Abgleich nicht gefunden.');
  if(!Number.isSafeInteger(targetBalance))throw new Error('Bitte einen gültigen Kontostand eingeben.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`)))throw new Error('Ungültiges Abgleichdatum.');
  if(note.length>500)throw new Error('Die Notiz darf höchstens 500 Zeichen enthalten.');
  const oldBalance=accountBalance(s,accountId,date);
  const delta=targetBalance-oldBalance;
  if(!Number.isSafeInteger(delta))throw new Error('Differenz außerhalb des zulässigen Betragsbereichs.');
  if(delta===0)return null;
  const kind=delta>0?'income':'expense';
  const categoryName=delta>0?'Kontostandskorrektur (Zugang)':'Kontostandskorrektur (Abgang)';
  const category=s.categories.find(c=>c.kind===kind&&c.name.toLocaleLowerCase('de')===categoryName.toLocaleLowerCase('de'));
  return {kind,amountCents:Math.abs(delta),categoryName,categoryId:category?.id??null,
    note:note.trim()||'Kontostand abgeglichen',date,oldBalance,targetBalance};
}
