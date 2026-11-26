// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {RemoteAccount,RemoteCategory,PendingWrite,RemoteKind} from './dashboard-protocol.js';

/** Contract for the planned Dashboard Mobile API v1 recurring endpoint.
 * Never read, write, or execute the local SQLite recurring ledger in server mode. */
export type ServerRecurringMode='paused'|'manual'|'auto';
export type ServerRecurringFrequency='daily'|'weekly'|'monthly'|'quarterly'|'yearly';
export interface ServerRecurringRule {
  id:number; revision:string; title:string;kind:RemoteKind;
  accountId:number;toAccountId:number|null;categoryId:number;payeeId:number;payeeTitle:string;
  amountMinor:number;note:string;
  frequency:ServerRecurringFrequency;intervalCount:number;dayOfMonth:number;startOn:string;runAt:string;
  endOn:string|null;maxOccurrences:number|null;completedCount:number;nextOn:string|null;
  mode:ServerRecurringMode;needsReview:string;
}
export interface ServerRecurringDraft {
  title:string;kind:RemoteKind;account_id:number;to_account_id:number;category_id:number;
  payee_title:string;amount_minor:number;note:string;frequency:ServerRecurringFrequency;
  interval_count:number;day_of_month:number;start_on:string;run_at:string;
  end_on:string|null;max_occurrences:number|null;
}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown):number=>typeof value==='number'?value:typeof value==='string'&&/^-?\d+$/.test(value)?Number(value):NaN;
const positive=(value:unknown,name:string):number=>{
  const n=integer(value);
  if(!Number.isSafeInteger(n)||n<=0)throw new Error('Ungültig: '+name);
  return n;
};
const nonnegative=(value:unknown,name:string):number=>{
  const n=integer(value);
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Ungültig: '+name);
  return n;
};
const str=(value:unknown,name:string,max=1000):string=>{
  if(typeof value!=='string'||value.length>max)throw new Error('Ungültig: '+name);
  return value;
};
const day=(value:unknown,name:string):string=>{
  const v=str(value,name,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T12:00:00Z')))
    throw new Error('Ungültiges Datum: '+name);
  return v;
};
const freq=(v:unknown):v is ServerRecurringFrequency=>['daily','weekly','monthly','quarterly','yearly'].includes(String(v));
const kind=(v:unknown):v is RemoteKind=>['expense','income','transfer'].includes(String(v));
const mode=(v:unknown):v is ServerRecurringMode=>['paused','manual','auto'].includes(String(v));

export function recurringCapability(input:unknown):boolean {
  const value=record(input)&&record(input.data)?input.data:input;
  return record(value)&&record(value.features)&&value.features.recurring_rules===true&&
    (value.mobile_api===1||value.mobile_api==='1');
}
/** The JSON response uses the Dashboard's actual recurring_rules columns, not local SQLite names. */
export function parseServerRecurringRules(input:unknown):ServerRecurringRule[]{
  const value=record(input)&&record(input.data)?input.data:input;
  if(!record(value)||!Array.isArray(value.items)||value.items.length>2000)
    throw new Error('Dashboard liefert keine gültige Liste wiederkehrender Regeln.');
  const rows=value.items.map((raw:unknown):ServerRecurringRule=>{
    if(!record(raw))throw new Error('Ungültige Serverregel.');
    const id=positive(raw.id,'Regel-ID');
    const revision=str(raw.revision,'Revision',32);
    if(!/^[0-9a-f]{32}$/.test(revision))throw new Error('Serverregel '+id+': Revision fehlt oder ist ungültig.');
    if(!kind(raw.kind)||!freq(raw.frequency)||!mode(raw.mode))
      throw new Error('Serverregel '+id+': Buchungsart, Intervall oder Ausführungsmodus ungültig.');
    const title=str(raw.title,'Name',160);
    if(!title.trim())throw new Error('Serverregel '+id+': Titel fehlt.');
    const amount=Math.abs(integer(raw.amount_minor));
    if(!Number.isSafeInteger(amount)||amount===0)throw new Error('Serverregel '+id+': ungültiger Betrag.');
    const count=nonnegative(raw.completed_count,'Ausführungsanzahl');
    const max=raw.max_occurrences===null?null:positive(raw.max_occurrences,'max_occurrences');
    const interval=positive(raw.interval_count,'interval_count');
    const monthDay=positive(raw.day_of_month,'day_of_month');
    if(interval>120||monthDay>31||max!==null&&max>10000)throw new Error('Unzulässiger Wiederholungsabstand.');
    const runAt=str(raw.run_at,'run_at',5);
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(runAt))throw new Error('Unzulässige Uhrzeit.');
    return {
      id,revision,title,kind:raw.kind,
      accountId:positive(raw.account_id,'account_id'),
      toAccountId:raw.kind==='transfer'?positive(raw.to_account_id,'to_account_id'):null,
      categoryId:raw.kind==='transfer'?0:nonnegative(raw.category_id??0,'category_id'),
      payeeId:nonnegative(raw.payee_id??0,'payee_id'),payeeTitle:str(raw.payee_title??'','payee_title',100),
      amountMinor:amount,note:str(raw.note??'','note',1000),
      frequency:raw.frequency,intervalCount:interval,dayOfMonth:monthDay,
      startOn:day(raw.start_on,'start_on'),runAt,
      endOn:raw.end_on===null?null:day(raw.end_on,'end_on'),
      maxOccurrences:max,completedCount:count,
      nextOn:raw.next_on===null?null:day(raw.next_on,'next_on'),
      mode:raw.mode,needsReview:str(raw.needs_review??'','needs_review')
    };
  });
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Doppelte ID in Serverregel-Liste.');
  return rows;
}
export function validateServerRecurringDraft(
  draft:ServerRecurringDraft,accounts:RemoteAccount[],categories:RemoteCategory[]
):ServerRecurringDraft {
  const title=draft.title.trim(),payeeTitle=draft.payee_title.trim(),note=draft.note.trim();
  if(!title||title.length>160)throw new Error('Regelname fehlt oder ist zu lang.');
  if(!kind(draft.kind)||!freq(draft.frequency))throw new Error('Ungültige Buchungsart oder Wiederholung.');
  const account=accounts.find(a=>a.id===draft.account_id&&a.active);
  if(!account)throw new Error('Bitte ein aktives Quellkonto wählen.');
  if(!Number.isSafeInteger(draft.amount_minor)||draft.amount_minor<=0||draft.amount_minor>10**15)
    throw new Error('Bitte einen gültigen positiven Betrag wählen.');
  if(draft.kind==='transfer'){
    const target=accounts.find(a=>a.id===draft.to_account_id&&a.active);
    if(!target||target.id===account.id||target.currency!==account.currency)
      throw new Error('Umbuchung erfordert ein anderes aktives Konto derselben Währung.');
  }else if(draft.to_account_id!==0)throw new Error('Nur Umbuchungen dürfen ein Zielkonto haben.');
  if(draft.kind!=='transfer'&&draft.category_id!==0&&!categories.some(c=>c.id===draft.category_id&&c.kind===draft.kind))
    throw new Error('Kategorie passt nicht zur Buchungsart.');
  if(payeeTitle.length>100||note.length>1000)throw new Error('Empfänger oder Notiz zu lang.');
  if(!Number.isInteger(draft.interval_count)||draft.interval_count<1||draft.interval_count>120||
     !Number.isInteger(draft.day_of_month)||draft.day_of_month<1||draft.day_of_month>31)
    throw new Error('Wiederholungsabstand oder Monatstag ungültig.');
  const start=day(draft.start_on,'Startdatum');
  const end=draft.end_on===null?null:day(draft.end_on,'Enddatum');
  if(Number(start.slice(0,4))<2000||Number(start.slice(0,4))>2100||end!==null&&(end<start||Number(end.slice(0,4))>2100))
    throw new Error('Start- oder Enddatum außerhalb des erlaubten Bereichs.');
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.run_at))throw new Error('Uhrzeit muss HH:MM sein.');
  if(draft.max_occurrences!==null&&(!Number.isInteger(draft.max_occurrences)||draft.max_occurrences<1||draft.max_occurrences>10000))
    throw new Error('Maximalanzahl muss 1–10000 sein.');
  return {...draft,title,payee_title:payeeTitle,note,start_on:start,end_on:end};
}
export type RecurringWriteAction='create'|'update'|'mode'|'post'|'delete';
export function createRecurringPendingWrite(
  server:string,action:RecurringWriteAction,id:number|null,
  data:ServerRecurringDraft|{mode:ServerRecurringMode}|{confirm:'BUCHEN'}|{confirm_title:string},revision?:string
):PendingWrite {
  if(action==='create'&&id!==null||action!=='create'&&(!Number.isSafeInteger(id)||id===null||id<=0))
    throw new Error('Ungültige Regel-ID für Schreibauftrag.');
  if(action!=='create'&&(!revision||!/^[0-9a-f]{32}$/.test(revision)))
    throw new Error('Eine aktuelle Regelrevision ist erforderlich.');
  if(typeof crypto.randomUUID!=='function')throw new Error('Sichere UUID-Erzeugung ist nicht verfügbar.');
  const method=action==='delete'?'DELETE':action==='update'||action==='mode'?'PUT':'POST';
  const suffix=action==='create'?'':('/'+id)+(action==='mode'?'/mode':action==='post'?'/post':'');
  return {server,method,path:'/api/mobile/v1/recurring'+suffix,data,
    idempotencyKey:crypto.randomUUID(),...(revision?{ifMatch:revision}:{}),createdAt:new Date().toISOString()};
}
