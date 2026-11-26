// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** Local and remote overview: same month comparison, isolated data inputs. */
export type HomeComparisonFilter={
  first:string; second:string;currency:string;account:string;category:string;
};
export type HomeCompareAccount={id:number;name:string;currency:string;decimals:number};
export type HomeCompareCategory={id:number;name:string};
export type HomeCompareBooking={
  date:string;kind:'income'|'expense'|'transfer';accountId:number;
  categoryId:number;amountMinor:number;
};
export type HomeMonthTotals={month:string;income:number;expense:number;count:number};
const escape=(value:unknown):string=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const monthName=(value:string)=>new Date(value+'-15T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
export function calendarMonth(value:string,change:number):string {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||!Number.isInteger(change)||Math.abs(change)>120)
    throw new Error('Ungültiger Vergleichsmonat.');
  const [y,m]=value.split('-').map(Number);
  const d=new Date(y,m-1+change,15);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
export function homeMonthTotals(
  bookings:readonly HomeCompareBooking[],month:string,filter:HomeComparisonFilter,
  accounts:readonly HomeCompareAccount[]
):HomeMonthTotals {
  const accountIds=new Set(accounts.filter(a=>a.currency===filter.currency).map(a=>a.id));
  let income=0,expense=0,count=0;
  for(const b of bookings){
    if(!b.date.startsWith(month)||b.kind==='transfer'||!accountIds.has(b.accountId))continue;
    if(filter.account!=='all'&&String(b.accountId)!==filter.account)continue;
    if(filter.category!=='all'&&String(b.categoryId)!==filter.category)continue;
    if(!Number.isSafeInteger(b.amountMinor)||b.amountMinor<0)continue;
    count++;
    if(b.kind==='income')income+=b.amountMinor;
    else expense+=b.amountMinor;
  }
  return {month,income,expense,count};
}
export function renderHomeComparison(args:{
  prefix:string;filter:HomeComparisonFilter;accounts:readonly HomeCompareAccount[];
  categories:readonly HomeCompareCategory[];bookings:readonly HomeCompareBooking[];
  complete:boolean;defaultCurrency:string;filtersOpen?:boolean;
}):string {
  const {prefix,filter,accounts,categories,bookings,complete}=args;
  const currencies=[...new Set(accounts.map(a=>a.currency))].sort();
  const currency=currencies.includes(filter.currency)?filter.currency:args.defaultCurrency;
  const selected={...filter,currency};
  const a=homeMonthTotals(bookings,filter.first,selected,accounts);
  const b=homeMonthTotals(bookings,filter.second,selected,accounts);
  const account=accounts.find(x=>x.currency===currency);
  const format=(value:number)=>{
    const decimals=account?.decimals??2;
    return new Intl.NumberFormat('de-DE',{style:'currency',currency,minimumFractionDigits:decimals,
      maximumFractionDigits:decimals}).format(value/Math.pow(10,decimals));
  };
  const max=Math.max(1,a.income,a.expense,b.income,b.expense);
  const label=(v:number)=>Math.max(0,Math.min(100,Math.round(v/max*100)));
  const opt=(value:string,name:string,chosen:string)=>`<option value="${escape(value)}" ${value===chosen?'selected':''}>${escape(name)}</option>`;
  const monthCard=(totals:HomeMonthTotals,index:1|2)=>{
    const known=complete||totals.count>0;
    const money=(value:number)=>known?escape(format(value)):'–';
    return `<div class="home-compare-month">
    <div class="home-compare-title ${index===1?'first':'second'}"><small>MONAT ${index}${index===1?' · AUSWAHL':' · VERGLEICH'}</small>
      <strong>${escape(monthName(totals.month))}</strong></div>
    <div class="home-compare-metrics"><div><span>Einnahmen</span><strong class="income">${money(totals.income)}</strong></div>
      <div><span>Ausgaben</span><strong class="expense">${money(totals.expense)}</strong></div>
      <div class="home-compare-net"><span>Saldo</span><strong class="${totals.income-totals.expense<0?'expense':'income'}">${money(totals.income-totals.expense)}</strong></div></div>
    <div class="home-compare-bars" aria-label="Einnahmen und Ausgaben in Relation zu den zwei Monaten">
      <div><span>Einnahmen</span><div class="home-compare-track">${totals.income>0?`<i class="home-compare-income" style="width:${label(totals.income)}%"></i>`:''}</div></div>
      <div><span>Ausgaben</span><div class="home-compare-track">${totals.expense>0?`<i class="home-compare-expense" style="width:${label(totals.expense)}%"></i>`:''}</div></div></div>
    <p class="muted small">${!known?'Keine Daten für diesen Monat geladen':`${totals.count} ${complete?'Buchungen':'bisher geladene Buchungen'}`} (ohne Umbuchungen)</p></div>`;
  };
  return `<section class="card home-compare-card"><details id="${prefix}-month-filters" class="home-compare-filter-disclosure" ${args.filtersOpen?'open':''}>
    <summary><strong>Filter und Zeitraum</strong><span class="muted small">${escape(monthName(filter.first))} / ${escape(monthName(filter.second))} · ${escape(currency)} · ${selected.account==='all'?'Alle Konten':'Konto ausgewählt'}</span></summary>
    <div class="home-compare-fields">
      <label class="field">Monat 1<input type="month" id="${prefix}-month-a" value="${escape(filter.first)}"></label>
      <label class="field">Monat 2<input type="month" id="${prefix}-month-b" value="${escape(filter.second)}"></label>
      <label class="field">Währung<select id="${prefix}-currency">${currencies.map(x=>opt(x,x,currency)).join('')}</select></label>
      <label class="field">Konto<select id="${prefix}-account">${opt('all','Alle Konten',selected.account)}${accounts.filter(x=>x.currency===currency).map(x=>opt(String(x.id),x.name,selected.account)).join('')}</select></label>
      <label class="field">Kategorie<select id="${prefix}-category">${opt('all','Alle Kategorien',selected.category)}${categories.map(x=>opt(String(x.id),x.name,selected.category)).join('')}</select></label>
      <button type="button" class="btn secondary home-compare-reset" data-action="${prefix}-reset">Aktueller Monat / Vormonat</button>
    </div></details>
    <div class="section-title"><h2>Monatsvergleich</h2><span class="muted small">${complete?'Vollständige Buchungen':'Vorläufig · geladene Serverseiten'}</span></div>
    <div class="home-compare-grid">${monthCard(a,1)}${monthCard(b,2)}</div>
    ${!complete?'<p class="notice">Die Mobile-API liefert hier nur bereits geladene Buchungen. Diese Werte sind vorläufig und können vom vollständigen Dashboard-Monatsbericht abweichen. Fehlende Monate bedeuten nicht 0 €.</p>':''}
  </section>`;
}
