// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {PendingWrite,RemoteAccount,DashboardSession} from './dashboard-protocol.js';

export interface ReconciliationPayload{
  actual_balance_minor:number;
  expected_balance_minor:number;
  note:string;
}
export interface ReconciliationResult{
  success:true;accountId:number;currency:string;decimals:number;
  previousBalanceMinor:number;actualBalanceMinor:number;changeMinor:number;
  bookingId:number|null;unchanged:boolean;balanceMinor:number;projectedBalanceMinor:number;
}
const isObject=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function reconciliationCapability(raw:unknown):boolean{
  const v=isObject(raw)&&isObject(raw.capabilities)?raw.capabilities:isObject(raw)&&isObject(raw.data)?raw.data:raw;
  return isObject(v)&&isObject(v.features)&&v.features.account_reconciliation===true;
}
export function canReconcile(session:DashboardSession|null,capability:boolean):boolean{
  return capability===true&&session?.canWrite===true&&session.financeMode==='web'
    &&session.access==='write'&&(session.role==='admin'||session.role==='editor');
}
function decimalsAllowed(decimals:number):boolean{return Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=3;}
/** Strict German display/input format, parsed entirely as minor-unit integers. */
export function parseReconciliationAmount(input:string,decimals:number):number{
  if(!decimalsAllowed(decimals))throw new Error('Das Konto verwendet nicht unterstützte Nachkommastellen (0 bis 3).');
  const raw=input.trim().replace(/[\u00a0\u202f ]/g,'');
  const match=raw.match(/^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/);
  if(!match)throw new Error('Bitte einen gültigen Kontostand eingeben (z. B. -1.234,56).');
  const fraction=match[3]??'';
  if(fraction.length>decimals||(decimals===0&&fraction.length>0))
    throw new Error('Dieser Kontostand darf höchstens '+decimals+' Nachkommastellen haben.');
  const rawDigits=(match[2]??'').replace(/\./g,'');
  const minor=(match[1]==='-'?-1n:1n)*(BigInt(rawDigits)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0'));
  if(minor>1000000000000000n||minor< -1000000000000000n)
    throw new Error('Kontostand außerhalb des zulässigen Bereichs.');
  return Number(minor);
}
export function formatReconciliationInput(amountMinor:number,decimals:number):string{
  if(!Number.isSafeInteger(amountMinor)||!decimalsAllowed(decimals))throw new Error('Ungültiger Serverkontostand.');
  const negative=amountMinor<0?'-':'';
  const units=String(Math.abs(amountMinor)).padStart(decimals+1,'0');
  const left=(decimals?units.slice(0,-decimals):units).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  const right=decimals?','+units.slice(-decimals):'';
  return negative+left+right;
}
export function reconciliationPreview(actual:number,expected:number):number{
  const delta=actual-expected;
  if(!Number.isSafeInteger(delta))throw new Error('Differenz ist zu groß.');
  return delta;
}
export function makeReconciliationPending(server:string,account:RemoteAccount,
 actualMinor:number,note:string):PendingWrite{
  if(!account.active||!Number.isSafeInteger(account.balanceMinor))throw new Error('Konto ist inaktiv oder ohne gültigen Ist-Kontostand.');
  if(!Number.isSafeInteger(account.id)||account.id<=0||!decimalsAllowed(account.decimals))
    throw new Error('Ungültige Kontodaten. Nur 0 bis 3 Nachkommastellen werden unterstützt.');
  if(!Number.isSafeInteger(actualMinor)||Math.abs(actualMinor)>1e15||Math.abs(account.balanceMinor)>1e15)
    throw new Error('Ungültiger Kontostand.');
  if(typeof note!=='string'||note.length>500||/[\x00-\x08\x0b-\x1f\x7f]/.test(note))
    throw new Error('Die Notiz darf höchstens 500 Zeichen enthalten.');
  if(typeof crypto.randomUUID!=='function')throw new Error('Sichere UUID-Erzeugung ist nicht verfügbar.');
  return {server,method:'POST',path:'/api/mobile/v1/accounts/'+account.id+'/reconcile',
    data:{actual_balance_minor:actualMinor,expected_balance_minor:account.balanceMinor,note},
    idempotencyKey:crypto.randomUUID(),createdAt:new Date().toISOString()};
}
export function isReconciliationPending(p:PendingWrite):boolean{
  return p.method==='POST'&&/^\/api\/mobile\/v1\/accounts\/[1-9]\d*\/reconcile$/.test(p.path);
}
export function parseReconciliationResult(raw:unknown,expectedAccount?:number):ReconciliationResult{
  if(!isObject(raw)||raw.success!==true||raw.unchanged!==true&&raw.unchanged!==false)
    throw new Error('Ungültige Antwort auf den Server-Kontostandsabgleich.');
  const number=(field:string):number=>{
    const v=raw[field];
    if(typeof v!=='number'||!Number.isSafeInteger(v))throw new Error('Ungültiger Betrag in der Serverantwort: '+field);
    return v;
  };
  const id=number('account_id'),decimals=number('decimals');
  if(id<=0||expectedAccount!==undefined&&id!==expectedAccount||!decimalsAllowed(decimals))
    throw new Error('Falsches Konto oder Währung in der Serverantwort.');
  const currency=raw.currency;
  if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))throw new Error('Ungültige Währung in der Serverantwort.');
  const previousBalanceMinor=number('previous_balance_minor');
  const actualBalanceMinor=number('actual_balance_minor');
  const changeMinor=number('change_minor');
  const balanceMinor=number('balance_minor');
  const projectedBalanceMinor=number('projected_balance_minor');
  if(actualBalanceMinor-previousBalanceMinor!==changeMinor||balanceMinor!==actualBalanceMinor)
    throw new Error('Der Server meldet widersprüchliche Kontostände.');
  const bookingId=raw.booking_id===null?null:number('booking_id');
  if(raw.unchanged===true?(changeMinor!==0||bookingId!==null):(changeMinor===0||bookingId===null||bookingId<=0))
    throw new Error('Ungültige Korrekturbuchung in der Serverantwort.');
  return {success:true,accountId:id,currency,decimals,
    previousBalanceMinor,actualBalanceMinor,changeMinor,bookingId,
    unchanged:raw.unchanged, balanceMinor,projectedBalanceMinor};
}
