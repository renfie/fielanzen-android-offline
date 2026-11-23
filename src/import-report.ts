// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** Import audit records are strictly local; no telemetry or server calls. */
import type {ImportReport,ImportGap,Snapshot} from './types.js';
import type {LegacyConversion} from './financisto.js';
export const REPORT_LIMIT=10;
const isObject=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const int=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
const positive=(x:unknown)=>int(x)&&Number(x)>0;
const reasonableString=(x:unknown,max:number)=>typeof x==='string'&&x.length<=max;
function check(ok:unknown,what:string):asserts ok {if(!ok)throw new Error(`Importprotokoll ungültig: ${what}`);}
function gapList(x:unknown):ImportGap[]{
  check(Array.isArray(x)&&x.length<=50000,'zu viele Referenzen');
  const ids=new Set<number>();
  return x.map((row:unknown)=>{
    check(isObject(row)&&positive(row.id)&&!ids.has(Number(row.id)),'ungültige/mehrfache Referenz-ID');
    const id=Number(row.id);ids.add(id);
    const parseIds=(a:unknown)=>{
      check(Array.isArray(a)&&a.length<=500000,'zu viele Buchungsreferenzen');
      const ids=a as unknown[];
      check(ids.every(positive)&&new Set(ids).size===ids.length,'ungültige Buchungsreferenzen');
      return ids as number[];
    };
    return {id,bookingIds:parseIds(row.bookingIds),templateIds:parseIds(row.templateIds)};
  });
}
export function validateImportReports(raw:unknown):ImportReport[]{
  check(Array.isArray(raw)&&raw.length<=REPORT_LIMIT,'zu viele Berichte');
  const reportIds=new Set<string>();
  return raw.map((item:unknown)=>{
    check(isObject(item)&&reasonableString(item.id,100)&&/^[a-zA-Z0-9_.-]{1,100}$/.test(item.id as string)
      &&!reportIds.has(item.id as string),'Bericht-ID');
    const id=item.id as string;reportIds.add(id);
    check(item.kind==='import'||item.kind==='analysis'||item.kind==='inventory','Berichtsart');
    check(reasonableString(item.createdAt,50)&&!Number.isNaN(Date.parse(item.createdAt as string)),'Zeitpunkt');
    check(item.sourceFile===null||reasonableString(item.sourceFile,255),'Quelldatei');
    check(isObject(item.counts),'Zählwerte');
    const c=item.counts;
    for(const k of ['accounts','categories','payees','bookings'])check(int(c[k]),`Anzahl ${k}`);
    for(const k of ['importedTemplates','skippedTemplates'])check(c[k]===null||int(c[k]),`Anzahl ${k}`);
    const payeeGaps=gapList(item.payeeGaps),categoryGaps=gapList(item.categoryGaps);
    const numericIds=(rawIds:unknown,label:string)=>{
      check(Array.isArray(rawIds)&&rawIds.length<=500000&&rawIds.every(positive),'IDs '+label);
      return rawIds as number[];
    };
    const zeroBookingIds=numericIds(item.zeroBookingIds,'Nullbuchungen');
    const unsupportedTemplateIds=numericIds(item.unsupportedTemplateIds,'Vorlagen');
    check(Array.isArray(item.accountChecks)&&item.accountChecks.length<=10000,'Kontenabgleich');
    const accountChecks=item.accountChecks.map((a:unknown)=>{
      check(isObject(a)&&positive(a.id)&&reasonableString(a.name,100)&&['expectedCents','actualCents','differenceCents'].every(k=>Number.isSafeInteger(a[k])),'Kontenabgleich-Werte');
      check((a.actualCents as number)-(a.expectedCents as number)===a.differenceCents,'Kontenabgleich-Differenz');
      return {id:a.id as number,name:a.name as string,expectedCents:a.expectedCents as number,
        actualCents:a.actualCents as number,differenceCents:a.differenceCents as number};
    });
    check(Array.isArray(item.notes)&&item.notes.length<=100&&item.notes.every((n:unknown)=>reasonableString(n,4000)),'Hinweise');
    return {id,kind:item.kind,createdAt:item.createdAt as string,sourceFile:item.sourceFile as string|null,
      counts:{accounts:c.accounts as number,categories:c.categories as number,payees:c.payees as number,bookings:c.bookings as number,
        importedTemplates:c.importedTemplates as number|null,skippedTemplates:c.skippedTemplates as number|null},
      payeeGaps,categoryGaps,zeroBookingIds,unsupportedTemplateIds,accountChecks,notes:item.notes as string[]};
  });
}
export function newReportId():string {return `report-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;}
export function fromLegacyConversion(result:LegacyConversion,fileName:string,kind:'import'|'analysis'):ImportReport {
  return {id:newReportId(),kind,createdAt:new Date().toISOString(),sourceFile:fileName.slice(0,255),
    counts:{accounts:result.snapshot.accounts.length,categories:result.snapshot.categories.length,
      payees:result.snapshot.payees.length,bookings:result.snapshot.bookings.length,
      importedTemplates:result.importedTemplates,skippedTemplates:result.skippedTemplates},
    payeeGaps:result.payeeGaps,categoryGaps:result.categoryGaps,zeroBookingIds:result.zeroBookingIds,
    unsupportedTemplateIds:result.unsupportedTemplateIds,accountChecks:result.accountChecks,notes:result.notes};
}
/** A legacy Alpha 5 import cannot retroactively recover its file name/unused templates.
 *  This inventory is an honest snapshot, *not* an original import audit. */
export function inventoryReport(snapshot:Snapshot):ImportReport {
  const payeeGaps:ImportGap[]=[];
  const catGaps:ImportGap[]=[];
  const bookingsByPayee=new Map<number,number[]>();
  const bookingsByCategory=new Map<number,number[]>();
  const templatesByPayee=new Map<number,number[]>();
  const templatesByCategory=new Map<number,number[]>();
  for(const b of snapshot.bookings){
    if(b.payeeId!==null){const arr=bookingsByPayee.get(b.payeeId)??[];arr.push(b.id);bookingsByPayee.set(b.payeeId,arr);}
    if(b.categoryId!==null){const arr=bookingsByCategory.get(b.categoryId)??[];arr.push(b.id);bookingsByCategory.set(b.categoryId,arr);}
  }
  for(const r of snapshot.recurringRules){
    if(r.payeeId!==null){const arr=templatesByPayee.get(r.payeeId)??[];arr.push(r.id);templatesByPayee.set(r.payeeId,arr);}
    if(r.categoryId!==null){const arr=templatesByCategory.get(r.categoryId)??[];arr.push(r.id);templatesByCategory.set(r.categoryId,arr);}
  }
  for(const p of snapshot.payees){
    const match=/^Unbekannter Empfänger \(ID (\d+)\)(?: \(\d+.*\))?$/.exec(p.name);
    if(match)payeeGaps.push({id:p.id,bookingIds:[...(bookingsByPayee.get(p.id)??[])].sort((a,b)=>a-b),
      templateIds:[...(templatesByPayee.get(p.id)??[])].sort((a,b)=>a-b)});
  }
  for(const c of snapshot.categories){
    const match=/^Unbekannte Kategorie \(ID (\d+)\)/.exec(c.name);
    if(match)catGaps.push({id:Number(match[1]),bookingIds:[...(bookingsByCategory.get(c.id)??[])].sort((a,b)=>a-b),
      templateIds:[...(templatesByCategory.get(c.id)??[])].sort((a,b)=>a-b)});
  }
  return {id:newReportId(),kind:'inventory',createdAt:new Date().toISOString(),sourceFile:null,
    counts:{accounts:snapshot.accounts.length,categories:snapshot.categories.length,payees:snapshot.payees.length,
      bookings:snapshot.bookings.length,importedTemplates:null,skippedTemplates:null},
    payeeGaps:payeeGaps.sort((a,b)=>a.id-b.id),categoryGaps:catGaps.sort((a,b)=>a.id-b.id),
    zeroBookingIds:snapshot.bookings.filter(b=>b.amountCents===0).map(b=>b.id).sort((a,b)=>a-b),
    unsupportedTemplateIds:[],accountChecks:[],notes:[
      'Bestandsanalyse aus der aktuell lokalen Datenbank: Es liegt kein vollständiges Original-Importprotokoll aus Alpha 5 vor.',
      'Gezählt werden noch vorhandene, am Namen erkennbare Platzhalter. Umbenannte oder bereits korrigierte Platzhalter sind nicht mehr erkennbar.',
      'Originaldateiname, nicht übernommene Vorlagen und damaliger Kontostandsabgleich lassen sich ohne Original-Backup nicht nachträglich rekonstruieren.'
    ]};
}
export function prependReport(existing:ImportReport[],report:ImportReport):ImportReport[]{
  return validateImportReports([report,...existing.filter(r=>r.id!==report.id)].slice(0,REPORT_LIMIT));
}
export function toPayeeCsv(report:ImportReport):string {
  const lines=['Empfaenger-ID;Buchungen;Vorlagen;Buchungs-IDs;Vorlagen-IDs'];
  for(const item of report.payeeGaps){
    lines.push(`${item.id};${item.bookingIds.length};${item.templateIds.length};"${item.bookingIds.join(', ')}";"${item.templateIds.join(', ')}"`);
  }
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
