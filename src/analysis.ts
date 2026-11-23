import type {Booking,Snapshot} from './types.js';
import {formatEuro} from './types.js';

export interface BookingTotals { incomeCents:number; expenseCents:number; transferCents:number; count:number; }
export interface MonthTotals extends BookingTotals { month:string; }
export interface InventoryIssue {kind:'warning'|'info'; title:string; detail:string;}
export interface InventoryCheck { totals:{accounts:number;categories:number;payees:number;bookings:number;rules:number;reports:number}; issues:InventoryIssue[]; balances:{id:number;name:string;cents:number}[]; }

export function calculateBalances(state:Snapshot,asOf?:string):Map<number,number>{
  const balances=new Map(state.accounts.map(a=>[a.id,a.openingCents]));
  for(const b of state.bookings){
    if(asOf && b.date>asOf)continue;
    if(balances.has(b.accountId)) balances.set(b.accountId,balances.get(b.accountId)!+(b.type==='income'?b.amountCents:-b.amountCents));
    if(b.type==='transfer'&&b.otherAccountId!==null&&balances.has(b.otherAccountId)) balances.set(b.otherAccountId,balances.get(b.otherAccountId)!+b.amountCents);
  }
  return balances;
}
export function bookingTotals(bookings:readonly Booking[]):BookingTotals{
  const totals:BookingTotals={incomeCents:0,expenseCents:0,transferCents:0,count:0};
  for(const b of bookings){totals.count++;if(b.type==='income')totals.incomeCents+=b.amountCents;else if(b.type==='expense')totals.expenseCents+=b.amountCents;else totals.transferCents+=b.amountCents;}
  return totals;
}
export function monthOffset(ym:string,offset:number):string{
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(ym)||!Number.isInteger(offset)||Math.abs(offset)>1200)throw new Error('Ungültiger Monat.');
  const [year,month]=ym.split('-').map(Number);
  const date=new Date(year!,month!-1+offset,1,12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
export function monthlyTrend(bookings:readonly Booking[],endMonth:string,count=12):MonthTotals[]{
  if(!Number.isInteger(count)||count<1||count>120)throw new Error('Ungültige Monatsanzahl.');
  const totals=new Map<string,MonthTotals>();
  for(let k=count-1;k>=0;k--){const ym=monthOffset(endMonth,-k);totals.set(ym,{month:ym,incomeCents:0,expenseCents:0,transferCents:0,count:0});}
  for(const b of bookings){const t=totals.get(b.date.slice(0,7));if(!t)continue;t.count++;if(b.type==='income')t.incomeCents+=b.amountCents;else if(b.type==='expense')t.expenseCents+=b.amountCents;else t.transferCents+=b.amountCents;}
  return [...totals.values()];
}
function escapeCsv(v:unknown,untrusted=false):string{
  let text=String(v??'');
  // Spreadsheet programs treat user-controlled =, +, -, @ as formula prefixes.
  // Protect names/notes without changing currency amounts.
  if(untrusted && /^[\s\x00-\x1f]*[=+\-@]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function exportBookingsCsv(bookings:readonly Booking[],state:Snapshot):string{
  const accountNames=new Map(state.accounts.map(a=>[a.id,a.name]));
  const categories=new Map(state.categories.map(c=>[c.id,c.name]));
  const payees=new Map(state.payees.map(p=>[p.id,p.name]));
  const header=['Datum','Buchungs-ID','Art','Quellkonto','Zielkonto','Kategorie','Empfänger / Zahler','Betrag (EUR)','Notiz'];
  const lines=[header.map(v=>escapeCsv(v)).join(';')];
  for(const b of bookings){
    const kind=b.type==='income'?'Einnahme':b.type==='expense'?'Ausgabe':'Umbuchung';
    const money=(b.type==='expense'?'-':'')+(b.amountCents/100).toFixed(2).replace('.',',');
    const row=[escapeCsv(b.date),escapeCsv(b.id),escapeCsv(kind),
      escapeCsv(accountNames.get(b.accountId)??'',true),
      escapeCsv(b.otherAccountId===null?'':accountNames.get(b.otherAccountId)??'',true),
      escapeCsv(b.categoryId===null?'':categories.get(b.categoryId)??'',true),
      escapeCsv(b.payeeId===null?'':payees.get(b.payeeId)??'',true),
      escapeCsv(money),escapeCsv(b.note,true)];
    lines.push(row.join(';'));
  }
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
export function lastPayeeUsage(bookings:readonly Booking[]):Map<number,number>{
  const last=new Map<number,number>();
  for(const b of bookings)if(b.payeeId!==null&&b.id>(last.get(b.payeeId)??0))last.set(b.payeeId,b.id);
  return last;
}

/** Read-only data inventory: diagnostics never change data, account balances or bookings. */
export function inspectSnapshot(state:Snapshot,asOf:string):InventoryCheck{
  const issues:InventoryIssue[]=[];
  const a=new Set(state.accounts.map(v=>v.id));const c=new Set(state.categories.map(v=>v.id));const p=new Set(state.payees.map(v=>v.id));
  const invalidB:string[]=[];
  const invalidR:string[]=[];
  let zero=0,future=0,negative=0;
  const seen=new Set<number>();
  for(const b of state.bookings){
    if(seen.has(b.id))invalidB.push(`#${b.id}: doppelte ID`);
    seen.add(b.id);
    if(!a.has(b.accountId)||(b.type==='transfer'&&!a.has(b.otherAccountId??-1))||(b.type!=='transfer'&&!c.has(b.categoryId??-1))||(b.payeeId!==null&&!p.has(b.payeeId)))invalidB.push(`#${b.id}: fehlender Bezug`);
    if(b.amountCents===0)zero++;
    if(b.date>asOf)future++;
    if(b.amountCents<0)negative++;
  }
  for(const r of state.recurringRules){
    if(!a.has(r.accountId)||(r.type==='transfer'&&!a.has(r.otherAccountId??-1))||(r.type!=='transfer'&&!c.has(r.categoryId??-1))||(r.payeeId!==null&&!p.has(r.payeeId)))invalidR.push(`#${r.id}`);
  }
  if(invalidB.length)issues.push({kind:'warning',title:`${invalidB.length} ungültige Buchungsreferenzen`,detail:invalidB.slice(0,15).join(', ')+(invalidB.length>15?' …':'')});
  if(invalidR.length)issues.push({kind:'warning',title:`${invalidR.length} ungültige Regelreferenzen`,detail:invalidR.slice(0,15).join(', ')});
  if(negative)issues.push({kind:'warning',title:`${negative} negative Buchungsbeträge`,detail:'Buchungsbeträge sollten als positive Centwerte mit separater Buchungsart gespeichert werden.'});
  if(zero)issues.push({kind:'info',title:`${zero} Nullbuchungen`,detail:'Importierte Nullbuchungen sind zulässig und verändern keine Salden.'});
  if(future)issues.push({kind:'info',title:`${future} Buchungen mit künftigem Datum`,detail:'Hinweis: Sie sind im derzeitigen Datenmodell bereits im Kontostand enthalten. Keine Änderung durch die Datenprüfung.'});
  const placeholder=state.payees.filter(x=>/^Unbekannter Empfänger \(ID \d+\)$/.test(x.name));
  if(placeholder.length)issues.push({kind:'info',title:`${placeholder.length} Platzhalter-Empfänger`,detail:'Vermutlich früher gelöschte Empfänger in alten Financisto-Buchungen. Die Buchungen bleiben erhalten.'});
  if(!issues.some(x=>x.kind==='warning'))issues.unshift({kind:'info',title:'Keine beschädigten Referenzen erkannt',detail:'Die lokale Prüfung ist keine externe Bankabstimmung.'});
  const balances=calculateBalances(state);
  return {totals:{accounts:state.accounts.length,categories:state.categories.length,payees:state.payees.length,
    bookings:state.bookings.length,rules:state.recurringRules.length,reports:state.importReports.length},issues,
    balances:state.accounts.map(x=>({id:x.id,name:x.name,cents:balances.get(x.id)??0}))};
}
export function inventoryAsText(check:InventoryCheck,asOf:string):string{
  return [`FieLanzen Offline – Lokale Datenprüfung ${asOf}`,'',
    `Konten: ${check.totals.accounts}; Kategorien: ${check.totals.categories}; Empfänger: ${check.totals.payees}; Buchungen: ${check.totals.bookings}; Regeln: ${check.totals.rules}; Berichte: ${check.totals.reports}`,
    '', 'Kontostände (berechnet):',...check.balances.map(b=>`  #${b.id}: ${b.name}: ${formatEuro(b.cents)}`),
    '', 'Hinweise:',...check.issues.map(v=>`  ${v.kind==='warning'?'WARNUNG':'INFO'}: ${v.title} – ${v.detail}`),'',
    'Diese Prüfung verändert keine Daten und ist kein Bankabgleich.'].join('\n');
}
