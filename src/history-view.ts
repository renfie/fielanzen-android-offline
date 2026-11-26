// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {Snapshot} from './types.js';
import type {MonthlyReport,MonthRow,MonthCategory,HistoryHighlight} from './monthly-api.js';
import {monthIndex,monthFromIndex} from './monthly-api.js';

export type HistoryFilter={first:string;second:string;currency:string;account:string;category:string};
export type HistoryFilterAccount={id:number;name:string;currency:string};
export type HistoryFilterCategory={id:number;name:string};
const esc=(v:unknown):string=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
export function historyBounds(filter:HistoryFilter):{from:string;to:string}{
  const a=monthIndex(filter.first),b=monthIndex(filter.second);
  if(Math.abs(a-b)>35)throw new Error('Maximal 36 Monate für eine Historienauswertung auswählen.');
  return {from:monthFromIndex(Math.min(a,b)),to:monthFromIndex(Math.max(a,b))};
}
export function localHistoryReport(snapshot:Snapshot,filter:HistoryFilter,asOf:string):MonthlyReport{
  const {from,to}=historyBounds(filter);
  const months:MonthRow[]=Array.from({length:monthIndex(to)-monthIndex(from)+1},(_,i)=>({
    month:monthFromIndex(monthIndex(from)+i),
    incomeMinor:0,expenseMinor:0,balanceMinor:0,bookingCount:0,transferCount:0,transferMinor:0,
    categories:{income:[],expense:[]}
  }));
  const byMonth=new Map(months.map(m=>[m.month,m]));
  const accountIds=new Set(snapshot.accounts.map(a=>a.id));
  const categoryNames=new Map(snapshot.categories.map(c=>[c.id,c.name]));
  const payeeNames=new Map(snapshot.payees.map(p=>[p.id,p.name]));
  const groups=new Map<string,MonthCategory>();
  let largestIncome:HistoryHighlight|null=null,largestExpense:HistoryHighlight|null=null;
  for(const booking of snapshot.bookings){
    const row=byMonth.get(booking.date.slice(0,7));
    if(!row||booking.date>asOf||!accountIds.has(booking.accountId))continue;
    if(filter.account!=='all'&&booking.accountId!==Number(filter.account)&&
       !(booking.type==='transfer'&&booking.otherAccountId===Number(filter.account)))continue;
    if(booking.type==='transfer'){
      if(filter.category==='all'){row.transferCount++;row.transferMinor+=booking.amountCents;}
      continue;
    }
    if(filter.category!=='all'&&booking.categoryId!==Number(filter.category))continue;
    if(booking.amountCents<=0)continue;
    const kind=booking.type;
    if(kind==='income')row.incomeMinor+=booking.amountCents;
    else row.expenseMinor+=booking.amountCents;
    row.bookingCount++;
    const categoryId=booking.categoryId??0;
    const key=row.month+':'+kind+':'+categoryId;
    let group=groups.get(key);
    if(!group){
      group={categoryId,category:categoryNames.get(categoryId)??'Ohne Kategorie',amountMinor:0,bookingCount:0};
      groups.set(key,group);
      row.categories[kind].push(group);
    }
    group.amountMinor+=booking.amountCents;group.bookingCount++;
    const record:HistoryHighlight={date:booking.date,amountMinor:booking.amountCents,
      payee:payeeNames.get(booking.payeeId??-1)??'',category:group.category};
    if(kind==='income'&&(!largestIncome||record.amountMinor>largestIncome.amountMinor))largestIncome=record;
    if(kind==='expense'&&(!largestExpense||record.amountMinor>largestExpense.amountMinor))largestExpense=record;
  }
  for(const row of months)row.balanceMinor=row.incomeMinor-row.expenseMinor;
  return {currency:'EUR',decimals:2,from,to,complete:true,months,
    highlights:{largestIncome,largestExpense}};
}
type CategoryTotal={id:number;name:string;amount:number;count:number};
function groupedCategories(report:MonthlyReport,kind:'income'|'expense'):CategoryTotal[]{
  const groups=new Map<string,CategoryTotal>();
  for(const month of report.months)for(const c of month.categories[kind]){
    const key=c.categoryId+':'+c.category;
    let row=groups.get(key);
    if(!row){row={id:c.categoryId,name:c.category,amount:0,count:0};groups.set(key,row);}
    row.amount+=c.amountMinor;row.count+=c.bookingCount;
  }
  return [...groups.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'de'));
}
const palette=['#087e83','#bd6a20','#698ab8','#70954d','#bc709d','#746bad','#d4a348','#4f7f8e','#8e9c60','#a96871','#477c77','#b18867'];
const monthLabel=(value:string)=>new Date(value+'-15T12:00:00').toLocaleDateString('de-DE',{month:'short',year:'numeric'});
const money=(minor:number,report:MonthlyReport)=>new Intl.NumberFormat('de-DE',{
  style:'currency',currency:report.currency,minimumFractionDigits:report.decimals,
  maximumFractionDigits:report.decimals
}).format(minor/10**report.decimals);
function pie(report:MonthlyReport,kind:'income'|'expense'):string{
  const title=kind==='expense'?'Ausgaben nach Kategorie':'Einnahmen nach Kategorie';
  const categories=groupedCategories(report,kind).filter(x=>x.amount>0);
  const total=categories.reduce((n,x)=>n+x.amount,0);
  if(!total)return '<section class="card history-pie-card"><h2>'+title+'</h2><p class="muted small">Keine Buchungen in diesem Zeitraum.</p></section>';
  let pct=0;
  const segments=categories.map((c,i)=>{
    const start=pct;
    pct+=c.amount/total*100;
    return palette[i%palette.length]+' '+start.toFixed(5)+'% '+pct.toFixed(5)+'%';
  });
  const legend=categories.map((c,i)=>'<div class="history-pie-legend-row"><span class="history-pie-color" style="background:'+
    palette[i%palette.length]+'"></span><span>'+esc(c.name)+'</span><strong>'+
    esc(money(c.amount,report))+' <small>('+String(Math.round(c.amount/total*100))+' %)</small></strong></div>').join('');
  return '<section class="card history-pie-card"><h2>'+title+'</h2>'+
    '<div class="history-pie-layout"><div class="history-pie" role="img" aria-label="'+title+
    '" style="background:conic-gradient('+segments.join(',')+')"><div class="history-pie-hole"></div></div>'+
    '<div class="history-pie-legend">'+legend+'</div></div></section>';
}
export function renderHistory(args:{
  prefix:string;filter:HistoryFilter;accounts:readonly HistoryFilterAccount[];
  categories:readonly HistoryFilterCategory[];report:MonthlyReport|null;
  loading?:boolean;error?:string;unsupported?:boolean;filtersOpen?:boolean;local?:boolean;
}):string{
  const {prefix,filter,accounts,categories,report}=args;
  const options=(value:string,label:string,chosen:string)=>'<option value="'+esc(value)+'" '+(chosen===value?'selected':'')+'>'+esc(label)+'</option>';
  const currencies=[...new Set(accounts.map(a=>a.currency))].sort();
  const currency=currencies.includes(filter.currency)?filter.currency:'EUR';
  const bounds=historyBounds(filter);
  const filters='<section class="card history-filters"><details id="'+prefix+'-filters" '+(args.filtersOpen?'open':'')+
    '><summary><strong>Filter und Zeitraum</strong><small>'+esc(monthLabel(bounds.from))+' – '+esc(monthLabel(bounds.to))+
    ' · '+esc(currency)+'</small></summary><div class="history-filter-grid">'+
    '<label class="field">Monat 1<input type="month" id="'+prefix+'-month-a" value="'+esc(filter.first)+'"></label>'+
    '<label class="field">Monat 2<input type="month" id="'+prefix+'-month-b" value="'+esc(filter.second)+'"></label>'+
    '<label class="field">Währung<select id="'+prefix+'-currency">'+currencies.map(x=>options(x,x,currency)).join('')+'</select></label>'+
    '<label class="field">Konto<select id="'+prefix+'-account">'+options('all','Alle Konten',filter.account)+
       accounts.filter(a=>a.currency===currency).map(a=>options(String(a.id),a.name,filter.account)).join('')+'</select></label>'+
    '<label class="field">Kategorie<select id="'+prefix+'-category">'+options('all','Alle Kategorien',filter.category)+
       categories.map(c=>options(String(c.id),c.name,filter.category)).join('')+'</select></label>'+
    '<div class="history-presets"><button class="btn secondary" type="button" data-action="'+prefix+'-last-2">2 Monate</button>'+
    '<button class="btn secondary" type="button" data-action="'+prefix+'-last-12">12 Monate</button>'+
    '<button class="btn secondary" type="button" data-action="'+prefix+'-reset">Zurücksetzen</button></div>'+
    '</div></details></section>';
  let output='<section class="intro"><div><div class="eyebrow">Langzeitvergleich</div><h1>Historie</h1>'+
    '<p class="muted small">'+esc(monthLabel(bounds.from))+' bis '+esc(monthLabel(bounds.to))+
    ' · '+String(monthIndex(bounds.to)-monthIndex(bounds.from)+1)+' Monate</p></div></section>'+filters;
  if(args.unsupported)return output+'<section class="card"><p class="notice">Der Dashboard-Server unterstützt die vollständige Monatsauswertung noch nicht. Bitte das Dashboard aktualisieren; geladene Einzelbuchungen werden nicht als vollständiger Bericht ausgegeben.</p></section>';
  if(args.loading)return output+'<section class="card"><p role="status">Vollständige Monatswerte werden vom Server geladen …</p></section>';
  if(args.error)return output+'<section class="card"><p class="error" role="alert">'+esc(args.error)+'</p><button class="btn secondary" data-action="'+prefix+'-reload">Erneut versuchen</button></section>';
  if(!report)return output+'<section class="card"><p class="notice">Keine vollständige Monatsauswertung verfügbar. Es werden keine Schätzwerte aus geladenen Buchungsseiten angezeigt.</p><button class="btn secondary" data-action="'+prefix+'-reload">Aktualisieren</button></section>';
  if(report.from!==bounds.from||report.to!==bounds.to||report.currency!==currency)
    return output+'<section class="card"><p class="notice">Die verfügbaren Monatsdaten passen nicht zum ausgewählten Zeitraum. Bitte erneut laden.</p></section>';
  const income=report.months.reduce((n,m)=>n+m.incomeMinor,0);
  const expense=report.months.reduce((n,m)=>n+m.expenseMinor,0);
  const count=report.months.reduce((n,m)=>n+m.bookingCount,0);
  const len=report.months.length;
  const avgExpenses=count>0?Math.round(expense/Math.max(1,report.months.reduce((n,m)=>n+m.categories.expense.reduce((a,c)=>a+c.bookingCount,0),0))):0;
  const avgIncome=count>0?Math.round(income/Math.max(1,report.months.reduce((n,m)=>n+m.categories.income.reduce((a,c)=>a+c.bookingCount,0),0))):0;
  const kpi=(title:string,value:string,extra:string,cl='')=>'<div class="history-kpi"><span>'+title+'</span><strong class="'+cl+'">'+esc(value)+'</strong><small>'+esc(extra)+'</small></div>';
  output+='<section class="history-kpi-grid">'+
    kpi('Einnahmen gesamt',money(income,report),'Ø monatlich: '+money(Math.round(income/len),report),'income')+
    kpi('Ausgaben gesamt',money(expense,report),'Ø monatlich: '+money(Math.round(expense/len),report),'expense')+
    kpi('Saldo im Zeitraum',money(income-expense,report),'Einnahmen − Ausgaben',income-expense<0?'expense':'income')+
    kpi('Buchungen im Zeitraum',String(count),'Ø Ausgabe: '+money(avgExpenses,report)+' · Ø Einnahme: '+money(avgIncome,report))+
    '</section>';
  const bestAvg=(kind:'income'|'expense')=>groupedCategories(report,kind).filter(c=>c.count>0)
    .sort((a,b)=>(b.amount/b.count)-(a.amount/a.count))[0];
  const high=(kind:'income'|'expense')=>report.highlights?.[kind==='expense'?'largestExpense':'largestIncome'];
  const highlight=(title:string,value:string,detail:string)=>'<article class="card history-highlight"><h3>'+title+
    '</h3><strong>'+esc(value)+'</strong><p class="muted small">'+esc(detail)+'</p></article>';
  const largestExpense=high('expense'),largestIncome=high('income');
  const topExpense=bestAvg('expense'),topIncome=bestAvg('income');
  const missing='Erfordert Erweiterung der Dashboard-API.';
  output+='<section class="history-highlight-grid">'+
    highlight('Höchste Einzelausgabe',largestExpense?money(largestExpense.amountMinor,report):report.highlights?'Keine Ausgaben':'–',
      largestExpense?(largestExpense.payee||largestExpense.category)+' · '+largestExpense.date:report.highlights?'Keine Ausgaben':missing)+
    highlight('Höchste Einzeleinnahme',largestIncome?money(largestIncome.amountMinor,report):report.highlights?'Keine Einnahmen':'–',
      largestIncome?(largestIncome.payee||largestIncome.category)+' · '+largestIncome.date:report.highlights?'Keine Einnahmen':missing)+
    highlight('Höchster Ø-Ausgabebetrag nach Kategorie',topExpense?money(Math.round(topExpense.amount/topExpense.count),report):'–',
      topExpense?topExpense.name+' · je Buchung':'Keine Ausgaben')+
    highlight('Höchster Ø-Einnahmebetrag nach Kategorie',topIncome?money(Math.round(topIncome.amount/topIncome.count),report):'–',
      topIncome?topIncome.name+' · je Buchung':'Keine Einnahmen')+'</section>';
  const max=Math.max(1,...report.months.flatMap(m=>[m.incomeMinor,m.expenseMinor]));
  const bar=(kind:'income'|'expense',amount:number)=>'<div class="history-bar-line"><span>'+(kind==='income'?'Einnahmen':'Ausgaben')+
    '</span><div class="history-bar-track">'+(amount>0?'<div class="history-bar '+(kind==='income'?'history-income-bar':'history-expense-bar')+
    '" style="width:'+Math.min(100,Math.round(amount/max*100))+'%"></div>':'')+'</div><strong>'+esc(money(amount,report))+'</strong></div>';
  output+='<section class="card history-timeline-card"><h2>Monatsverlauf: Einnahmen und Ausgaben</h2>'+
    '<p class="muted small">Alle '+len+' Monate · Beträge in '+esc(currency)+'</p>'+
    '<div class="history-timeline">'+report.months.map(m=>'<div class="history-month-row"><div class="history-month-name">'+
      esc(monthLabel(m.month))+'</div><div class="history-month-bars">'+bar('income',m.incomeMinor)+
      bar('expense',m.expenseMinor)+'</div></div>').join('')+'</div></section>';
  output+='<section class="history-pies">'+pie(report,'expense')+pie(report,'income')+'</section>'+
    '<p class="muted small history-footer">Vollständige Ist-Auswertung bis heute, ohne künftige Buchungen. Umbuchungen werden separat geführt. Durchschnittswerte beziehen sich auf alle Monate, auch auf Monate ohne Buchungen.</p>';
  return output;
}
