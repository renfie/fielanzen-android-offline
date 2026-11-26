// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {RemoteAccount,RemoteBooking,RemoteCategory,DashboardSession,PendingWrite,RemotePayee} from './dashboard-protocol.js';
import {readBookingList,bookingListSettingsHtml,sortTransactionRows} from './booking-list-preferences.js';
import {bookingCardHtml} from './booking-card-ui.js';
import type {ServerRecurringRule} from './server-recurring.js';
export type ServerPeriod='7'|'30'|'90'|'180'|'all';
export interface ServerViewData {
  server:string;session:DashboardSession|null;accounts:RemoteAccount[];categories:RemoteCategory[];
  payees:RemotePayee[];bookings:RemoteBooking[];nextBefore:string|null;error:string;loading:boolean;
  pending:PendingWrite|null;visibleCount:number;homeVisibleCount:number;searchHome:string;searchBookings:string;
  expandedBookingId:number|null;balancesOpen:boolean;filtersOpen:boolean;
  period:ServerPeriod;periodExplicit:boolean;kindFilter:'all'|RemoteBooking['kind'];
  accountFilter:string;categoryFilter:string;dateFrom:string;dateTo:string;
  reportMonth:string;reportAccountFilter:string;
  recurringSupported:boolean;recurringLoaded:boolean;recurringLoading:boolean;
  recurringRules:ServerRecurringRule[];recurringError:string;
}
const currentMonth=():string=>{
  const now=new Date();
  return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
};
export const emptyServerData=():ServerViewData=>({
  server:'',session:null,accounts:[],categories:[],payees:[],bookings:[],nextBefore:null,
  error:'',loading:false,pending:null,visibleCount:readBookingList().pageSize,homeVisibleCount:readBookingList().pageSize,
  searchHome:'',searchBookings:'',expandedBookingId:null,balancesOpen:false,filtersOpen:false,
  period:'30',periodExplicit:false,kindFilter:'all',accountFilter:'all',categoryFilter:'all',
  dateFrom:'',dateTo:'',reportMonth:currentMonth(),reportAccountFilter:'all',
  recurringSupported:false,recurringLoaded:false,recurringLoading:false,recurringRules:[],recurringError:''
});
const esc=(v:unknown):string=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function formatMinor(amount:number,account:RemoteAccount|undefined):string{
  const decimals=account?.decimals??2,code=account?.currency??'EUR';
  try{return new Intl.NumberFormat('de-DE',{style:'currency',currency:code,minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(amount/(10**decimals));}
  catch{return `${(amount/(10**decimals)).toLocaleString('de-DE')} ${account?.symbol??code}`;}
}
function kindLabel(kind:RemoteBooking['kind']):string{return {expense:'Ausgabe',income:'Einnahme',transfer:'Umbuchung'}[kind];}
/** Search only cached server pages; never claim a global server search without an API endpoint. */
export function filterRemoteBookings(bookings:RemoteBooking[],query:string,accounts:RemoteAccount[],categories:RemoteCategory[]):RemoteBooking[]{
  const needle=query.trim().toLocaleLowerCase('de');
  if(!needle)return bookings;
  const accountNames=new Map(accounts.map(a=>[a.id,a.name]));
  const categoryNames=new Map(categories.map(c=>[c.id,c.name]));
  return bookings.filter(b=>{
    const amount=formatMinor(b.amountMinor,accounts.find(a=>a.id===b.accountId));
    const values=[b.date,b.date.split('-').reverse().join('.'),kindLabel(b.kind),b.payeeTitle,b.note,
      accountNames.get(b.accountId)??'',accountNames.get(b.toAccountId??0)??'',categoryNames.get(b.categoryId)??'',
      amount,String(b.amountMinor),b.isRecurring?'wiederkehrend':'',b.isRuleMatched?'regel zugeordnet':''];
    return values.some(value=>value.toLocaleLowerCase('de').includes(needle));
  });
}
/** Server filter mirrors LOCAL booking filters but applies exclusively to loaded API pages. */
export function displayedServerBookings(data:ServerViewData,screen:'home'|'bookings'):RemoteBooking[] {
  const forHome=screen==='home';
  const query=forHome?data.searchHome:data.searchBookings;
  let rows=filterRemoteBookings(data.bookings,query,data.accounts,data.categories);
  if(!forHome){
    if(data.period!=='all'&&!data.dateFrom&&!data.dateTo&&(!query.trim()||data.periodExplicit)){
      const since=new Date();since.setDate(since.getDate()-Number(data.period)+1);
      const date=since.getFullYear()+'-'+String(since.getMonth()+1).padStart(2,'0')+'-'+String(since.getDate()).padStart(2,'0');
      rows=rows.filter(b=>b.date>=date);
    }
    if(data.dateFrom)rows=rows.filter(b=>b.date>=data.dateFrom);
    if(data.dateTo)rows=rows.filter(b=>b.date<=data.dateTo);
    if(data.kindFilter!=='all')rows=rows.filter(b=>b.kind===data.kindFilter);
    if(data.categoryFilter!=='all')rows=rows.filter(b=>b.categoryId===Number(data.categoryFilter));
    if(data.accountFilter!=='all')rows=rows.filter(b=>b.accountId===Number(data.accountFilter)||(b.kind==='transfer'&&b.toAccountId===Number(data.accountFilter)));
  }
  return sortTransactionRows(rows,readBookingList().sort,b=>b.amountMinor);
}
const bookingDate=(date:string):string=>date.split('-').reverse().join('.');
function groupCurrency(data:ServerViewData):Map<string,RemoteAccount>{
  return new Map(data.accounts.map(a=>[a.currency,a]));
}
function formatServerSum(cents:number,data:ServerViewData):string{
  const currencies=groupCurrency(data);
  if(currencies.size>1)return '—';
  const ref=currencies.values().next().value as RemoteAccount|undefined;
  return formatMinor(cents,ref);
}
export function serverBookingSummaryHtml(data:ServerViewData):string{
  const rows=displayedServerBookings(data,'bookings');
  const income=rows.filter(b=>b.kind==='income').reduce((total,b)=>total+b.amountMinor,0);
  const expense=rows.filter(b=>b.kind==='expense').reduce((total,b)=>total+b.amountMinor,0);
  const transfers=rows.filter(b=>b.kind==='transfer').reduce((total,b)=>total+b.amountMinor,0);
  return `<div class="mini-summary"><span><small>Einnahmen</small><strong class="income">+${esc(formatServerSum(income,data))}</strong></span>
    <span><small>Ausgaben</small><strong class="expense">−${esc(formatServerSum(expense,data))}</strong></span>
    <span><small>Saldo</small><strong>${esc(formatServerSum(income-expense,data))}</strong></span>
    <span class="mini-transfer">${esc(formatServerSum(transfers,data))} Umbuchungen (separat)</span></div>`;
}
export function serverBookingResultsHtml(data:ServerViewData,screen:'home'|'bookings'):string{
  const accountMap=new Map(data.accounts.map(a=>[a.id,a]));
  const categories=new Map(data.categories.map(c=>[c.id,c.name]));
  const forHome=screen==='home';
  const filtered=displayedServerBookings(data,screen);
  const displayed=forHome?data.homeVisibleCount:data.visibleCount;
  const shown=filtered.slice(0,displayed);
  const prefs=readBookingList();
  const cards=shown.map(b=>{
    const acc=accountMap.get(b.accountId);
    const category=categories.get(b.categoryId)??(b.kind==='transfer'?'Umbuchung':'Ohne Kategorie');
    const title=b.kind==='transfer'
      ?(acc?.name??'Quellkonto')+' → '+(accountMap.get(b.toAccountId??0)?.name??'Zielkonto')
      :(b.payeeTitle||category);
    const prefix=b.amountMinor===0?'':b.kind==='income'?'+':b.kind==='expense'?'−':'⇄ ';
    const kindText=kindLabel(b.kind);
    return bookingCardHtml({
      id:b.id,source:'server',expanded:data.expandedBookingId===b.id,title,dateLabel:bookingDate(b.date),
      categoryLabel:b.kind==='transfer'?'Umbuchung':category,kind:b.kind,kindLabel:kindText,
      amountLabel:prefix+formatMinor(b.amountMinor,acc),recurring:b.isRecurring===true,
      ruleMatched:b.isRuleMatched===true,zeroBooking:b.amountMinor===0,
      details:[
        {label:'Art',value:kindText+(b.amountMinor===0?' · Nullbuchung':'')},
        {label:'Datum',value:bookingDate(b.date)},
        {label:'Quellkonto',value:acc?.name??('Konto '+b.accountId)},
        b.kind==='transfer'?{label:'Zielkonto',value:accountMap.get(b.toAccountId??0)?.name??'Zielkonto'}
          :{label:'Kategorie',value:category},
        ...(b.kind!=='transfer'?[{label:'Empfänger / Zahler',value:b.payeeTitle||'–'}]:[]),
        ...(b.note?[{label:'Notiz',value:b.note,isNote:true}]:[]),
        {label:'Revision',value:b.revision}
      ],
      actions:data.session?.canWrite&&!data.pending?[
        {action:'server-edit-booking',title:'Bearbeiten',style:'primary'},
        {action:'server-delete-booking',title:'Löschen',style:'danger'}
      ]:[]
    });
  }).join('');
  const hasMore=filtered.length>shown.length||data.nextBefore!==null;
  const label=filtered.length>shown.length?`Weitere ${prefs.pageSize} laden`:
    (forHome?data.searchHome:data.searchBookings).trim()?'Weitere Serverseiten durchsuchen':`Weitere ${prefs.pageSize} laden`;
  return `${cards||'<div class="empty">Keine passenden Buchungen in den bisher geladenen Daten.</div>'}
    ${hasMore?`<div class="bookings-more"><span>${Math.min(shown.length,filtered.length)} von ${filtered.length} Treffern in geladenen Daten</span>
      <button class="btn secondary" data-action="server-more-bookings">${label}</button></div>`:''}`;
}
const monthLabel=(ym:string):string=>new Date(ym+'-15T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
function offsetMonth(ym:string,delta:number):string {
  const [year,month]=ym.split('-').map(Number);
  const d=new Date(year!,month!-1+delta,15);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthlyServerRows(data:ServerViewData,ym:string):RemoteBooking[]{
  return data.bookings.filter(b=>b.date.startsWith(ym)&&
    (data.reportAccountFilter==='all'||b.accountId===Number(data.reportAccountFilter)||(b.kind==='transfer'&&b.toAccountId===Number(data.reportAccountFilter))));
}
function serverMonthReportHtml(data:ServerViewData,ym:string):string{
  const rows=monthlyServerRows(data,ym);
  const income=rows.filter(b=>b.kind==='income').reduce((v,b)=>v+b.amountMinor,0);
  const expense=rows.filter(b=>b.kind==='expense').reduce((v,b)=>v+b.amountMinor,0);
  const expenseCategories=new Map<number,number>();
  const incomeCategories=new Map<number,number>();
  for(const b of rows){
    const map=b.kind==='expense'?expenseCategories:b.kind==='income'?incomeCategories:null;
    if(map)map.set(b.categoryId,(map.get(b.categoryId)??0)+b.amountMinor);
  }
  const maxCategory=Math.max(1,...expenseCategories.values());
  const categories=new Map(data.categories.map(c=>[c.id,c.name]));
  return `<div class="report-month"><h2>${esc(monthLabel(ym))}</h2>
    <div class="report-metrics"><div><span>Einnahmen</span><strong class="income">+${esc(formatServerSum(income,data))}</strong></div>
      <div><span>Ausgaben</span><strong class="expense">−${esc(formatServerSum(expense,data))}</strong></div>
      <div class="report-net"><span>Saldo</span><strong class="${income-expense<0?'expense':'income'}">${esc(formatServerSum(income-expense,data))}</strong></div></div>
    <h3>Ausgaben nach Kategorien</h3>
    ${expenseCategories.size?[...expenseCategories].sort((x,y)=>y[1]-x[1]).map(([id,v])=>`<div class="report-category">
      <div class="report-line"><span>${esc(categories.get(id)??'Ohne Kategorie')}</span><strong>${esc(formatServerSum(v,data))}</strong></div>
      <div class="report-meter"><span style="width:${Math.max(1,Math.round(v/maxCategory*100))}%"></span></div></div>`).join(''):'<p class="muted small">Keine geladenen Ausgaben.</p>'}
    <h3>Einnahmen nach Kategorien</h3>
    ${incomeCategories.size?[...incomeCategories].sort((x,y)=>y[1]-x[1]).map(([id,v])=>`<div class="report-line"><span>${esc(categories.get(id)??'Ohne Kategorie')}</span><strong>${esc(formatServerSum(v,data))}</strong></div>`).join(''):'<p class="muted small">Keine geladenen Einnahmen.</p>'}
    <p class="muted small">${rows.length} geladene Buchungen in diesem Monat; ${rows.filter(b=>b.kind==='transfer').length} Umbuchungen (separat).</p></div>`;
}
function serverReportsHtml(data:ServerViewData):string{
  const ym=data.reportMonth;
  const trend=Array.from({length:12},(_,i)=>{
    const month=offsetMonth(ym,i-11);
    const rows=monthlyServerRows(data,month);
    return {month,income:rows.filter(b=>b.kind==='income').reduce((v,b)=>v+b.amountMinor,0),
      expense:rows.filter(b=>b.kind==='expense').reduce((v,b)=>v+b.amountMinor,0)};
  });
  const max=Math.max(1,...trend.map(x=>x.income+x.expense));
  const accountOptions=data.accounts.map(a=>`<option value="${a.id}" ${data.reportAccountFilter===String(a.id)?'selected':''}>${esc(a.name)}</option>`).join('');
  return `<section class="intro"><div><div class="eyebrow">Monatliche Auswertung</div><h1>Monatsbericht</h1></div>
    <button class="btn secondary no-print" data-action="print-report">Drucken</button></section>
    <section class="card no-print"><div class="report-toolbar">
      <button class="btn secondary" data-action="server-previous-report-month" aria-label="Vormonat">‹</button>
      <label class="field">Monat auswählen<input id="server-report-month" type="month" value="${esc(ym)}"></label>
      <button class="btn secondary" data-action="server-next-report-month" aria-label="Folgemonat">›</button></div>
      <label class="field">Kontofilter<select id="server-report-account-filter"><option value="all">Alle Konten</option>${accountOptions}</select></label>
      <p class="notice">Vorläufige Auswertung ausschließlich der ${data.bookings.length} geladenen Serverbuchungen. Die Mobile-API stellt noch keinen vollständigen Monatsbericht bereit; ältere Buchungen können fehlen. ${groupCurrency(data).size>1?'Bei mehreren Währungen werden Beträge nicht fälschlich zusammengerechnet.':''}</p>
    </section>
    <section class="card"><div class="section-title"><h2>Haushaltsauswertung</h2><span class="muted">2 Monate · geladen</span></div>
      <div class="report-grid">${serverMonthReportHtml(data,ym)}${serverMonthReportHtml(data,offsetMonth(ym,-1))}</div></section>
    <section class="card"><div class="section-title"><h2>Verlauf</h2><span class="muted">12 Monate bis ${esc(monthLabel(ym))}</span></div>
      <div class="trend-legend"><span class="trend-income-mark">Einnahmen</span><span class="trend-expense-mark">Ausgaben</span></div>
      <div class="trend-list">${trend.map(t=>`<div class="trend-row"><span>${esc(monthLabel(t.month))}</span>
        <div class="trend-bars"><i class="trend-income" style="width:${Math.round(t.income/max*100)}%"></i><i class="trend-expense" style="width:${Math.round(t.expense/max*100)}%"></i></div>
        <strong class="${t.income-t.expense<0?'expense':'income'}">${esc(formatServerSum(t.income-t.expense,data))}</strong></div>`).join('')}</div>
      <p class="muted small">Trend aus geladenen Serverseiten; Monate ohne geladene Buchungen sind nicht zwangsläufig buchungsfrei.</p></section>`;
}
const recurringFrequency=(f:ServerRecurringRule['frequency']):string=>
  ({daily:'Täglich',weekly:'Wöchentlich',monthly:'Monatlich',quarterly:'Vierteljährlich',yearly:'Jährlich'}[f]);
const recurringModeName=(m:ServerRecurringRule['mode']):string=>
  ({paused:'Pausiert',manual:'Manuelle Buchung',auto:'Automatische Buchung'}[m]);
function serverRecurringHtml(data:ServerViewData):string{
  const ready=data.recurringSupported;
  const canWrite=Boolean(data.session?.canWrite&&!data.pending&&ready&&data.recurringLoaded&&!data.recurringLoading);
  const admin=data.session?.role==='admin';
  const today=new Date();
  const date=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const rows=[...data.recurringRules].sort((a,b)=>Number(a.mode==='paused')-Number(b.mode==='paused')||
    (a.nextOn??'9999').localeCompare(b.nextOn??'9999')||a.title.localeCompare(b.title,'de'));
  const disabled=canWrite?'':'disabled';
  return `<section class="intro"><div><div class="eyebrow">Geplante Buchungen</div><h1>Wiederkehrend</h1></div>
    <button type="button" class="btn primary" data-action="server-recurring-add" ${disabled}>+ Regel</button></section>
    <section class="card">
      <div class="section-title"><h2>Regeln (${ready?rows.length:'–'})</h2>
        <button type="button" class="btn secondary" data-action="server-recurring-reload" ${data.recurringLoading?'disabled':''}>Aktualisieren</button></div>
      ${!ready?`<div class="notice">Die Mobile-API dieses Dashboards stellt wiederkehrende Regeln noch nicht bereit. Die Android-Oberfläche ist dafür vorbereitet; bis zur Freischaltung werden keine lokalen Regeln eingesetzt oder ausgeführt.</div>`:''}
      ${data.recurringLoading?'<p class="muted small" role="status">Serverregeln werden geladen …</p>':''}
      ${data.recurringError?`<div class="error" role="alert">${esc(data.recurringError)}</div>`:''}
      ${ready&&!data.recurringLoading&&data.recurringLoaded&&!rows.length?'<div class="empty">Noch keine wiederkehrenden Serverregeln vorhanden.</div>':''}
      ${ready?rows.map(rule=>{
        const account=data.accounts.find(a=>a.id===rule.accountId);
        const category=data.categories.find(c=>c.id===rule.categoryId);
        const kindText=kindLabel(rule.kind);
        const prefix=rule.kind==='income'?'+':rule.kind==='expense'?'−':'⇄ ';
        const recurringType=rule.kind==='transfer'? (account?.name??'Quellkonto')+' → '+
          (data.accounts.find(a=>a.id===rule.toAccountId)?.name??'Zielkonto'):
          (rule.payeeTitle||category?.name||rule.title);
        const canPost=canWrite&&rule.mode==='manual'&&Boolean(rule.nextOn)&&rule.nextOn! <= date;
        const options=['paused','manual','auto'].map(value=>
          `<option value="${value}" ${rule.mode===value?'selected':''} ${value==='auto'&&!admin?'disabled':''}>${recurringModeName(value as ServerRecurringRule['mode'])}</option>`).join('');
        return `<div class="settings-line server-recurring-rule" data-rule-id="${rule.id}">
          <div class="setting-details"><strong>${esc(rule.title)} ${rule.mode==='paused'?'(inaktiv)':''}</strong>
            <span>${esc(recurringType)} · ${esc(kindText)} · ${esc(prefix+formatMinor(rule.amountMinor,account))}</span>
            <span>${esc(recurringFrequency(rule.frequency))}${rule.intervalCount>1?' · alle '+rule.intervalCount:''} · ${esc(recurringModeName(rule.mode))}</span>
            <span>${rule.nextOn?'Nächste Fälligkeit: '+esc(rule.nextOn.split('-').reverse().join('.')):'Keine nächste Fälligkeit'} · ${rule.completedCount} ausgeführt</span>
            ${rule.endOn?`<span>Enddatum: ${esc(rule.endOn.split('-').reverse().join('.'))}</span>`:''}
            ${rule.maxOccurrences!==null?`<span>Maximal ${rule.maxOccurrences} Ausführungen</span>`:''}
            ${rule.needsReview?`<span class="warning">Prüfung nötig: ${esc(rule.needsReview)}</span>`:''}
            ${canWrite?`<div class="server-recurring-tools">
              <label class="field">Ausführungsmodus
                <select id="server-recurring-mode-${rule.id}" aria-label="Ausführungsmodus für ${esc(rule.title)}">${options}</select></label>
              <div class="btn-row"><button type="button" class="btn secondary" data-action="server-recurring-save-mode" data-id="${rule.id}">Übernehmen</button>
                <button type="button" class="btn secondary" data-action="server-recurring-edit" data-id="${rule.id}">Bearbeiten</button>
                <button type="button" class="btn danger" data-action="server-recurring-delete" data-id="${rule.id}">Löschen</button></div>
              ${canPost?`<button type="button" class="btn primary" data-action="server-recurring-post" data-id="${rule.id}">Fällige Buchung bestätigen</button>`:''}
            </div>`:''}
          </div></div>`;
      }).join(''):''}
      <p class="muted small">Die Ausführung erfolgt ausschließlich im Dashboard. Automatik ist nur für Administratoren freigebbar. Eine Änderung an Regelinhalten setzt die Regel zur Prüfung auf „Pausiert“.</p>
    </section>`;
}
function serverConnectionInfo(data:ServerViewData):string {
  return `<details class="card account-disclosure server-connection-info"><summary class="disclosure-toggle"><span><strong>Dashboard-Verbindung</strong>
    <small>Serverdetails und Aktualisieren</small></span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary>
    <div class="disclosure-body"><p class="muted small">${esc(data.server||'Noch nicht verbunden')}</p>
      ${data.session?`<p class="muted small">Finanzmodus: ${esc(data.session.financeMode)} · API: ${esc(data.session.access)} · Schreiben: ${data.session.canWrite?'ja':'nein'}</p>`:''}
      <div class="btn-row"><button class="btn secondary" data-action="server-reload">Serverdaten aktualisieren</button></div>
      <p class="muted small">Datenquelle: ausschließlich Dashboard-Server. Lokale Buchungen bleiben getrennt.</p></div></details>`;
}
export function serverPageHtml(data:ServerViewData,screen:'home'|'bookings'|'recurring'|'reports'|'settings'):string{
  const error=data.error?`<div class="error" role="alert">${esc(data.error)}</div>`:'';
  const loading=data.loading?'<p class="muted small" role="status">Serverdaten werden geladen …</p>':'';
  const pending=data.pending?`<section class="card"><h2>Offener Server-Schreibauftrag</h2>
    <p class="warning">Ein früherer Schreibversuch wurde nicht eindeutig bestätigt. Neue Schreibvorgänge sind gesperrt. Bitte zuerst den Server prüfen.</p>
    <p class="muted small">${esc(data.pending.method)} · ${esc(data.pending.createdAt)} · Idempotency-Key: ${esc(data.pending.idempotencyKey)}</p>
    <div class="btn-row"><button class="btn secondary" data-action="server-reload">Serverdaten laden</button>
      <button class="btn secondary" data-action="server-retry-pending">Denselben Auftrag erneut prüfen/senden</button>
      <button class="btn danger" data-action="server-discard-pending">Nach Kontrolle freigeben</button></div></section>`:'';
  const status=error+loading+pending;
  if(screen==='recurring')return status+serverRecurringHtml(data)+serverConnectionInfo(data);
  if(screen==='reports')return status+serverReportsHtml(data)+serverConnectionInfo(data);
  const prefs=readBookingList();
  const canWrite=Boolean(data.session?.canWrite&&!data.pending);
  if(screen==='home'){
    const totals=new Map<string,{cents:number;sample:RemoteAccount}>();
    for(const a of data.accounts){
      if(!a.includedInTotal)continue;
      const old=totals.get(a.currency);
      totals.set(a.currency,{cents:(old?.cents??0)+a.balanceMinor,sample:a});
    }
    const single=totals.size===1?[...totals.values()][0]:null;
    const overall=single?formatMinor(single.cents,single.sample):totals.size>1?'Mehrere Währungen':'–';
    const month=currentMonth();
    const monthly=data.bookings.filter(b=>b.date.startsWith(month));
    const income=monthly.filter(b=>b.kind==='income').reduce((v,b)=>v+b.amountMinor,0);
    const expense=monthly.filter(b=>b.kind==='expense').reduce((v,b)=>v+b.amountMinor,0);
    const accounts=data.accounts.map(a=>`<div class="account"><div class="account-name">${esc(a.name)}</div>
      <div class="account-value ${a.balanceMinor<0?'expense':''}">${esc(formatMinor(a.balanceMinor,a))}</div></div>`).join('');
    const homeResults=displayedServerBookings(data,'home');
    return `${status}<section class="intro"><div><div class="eyebrow">Deine Finanzen im Blick</div><h1>Übersicht</h1>
        <div class="muted small">Alle Daten vom Dashboard-Server</div></div>
        <button class="btn primary" data-action="server-add-booking" ${canWrite?'':'disabled'}>+ Buchung</button></section>
      <section class="card"><div class="section-title"><h2>Gesamtvermögen</h2><span class="muted">Alle Konten</span></div>
        <div class="balance-total ${single&&single.cents<0?'expense':''}">${esc(overall)}</div>
        ${totals.size>1?`<div class="muted small">${[...totals.values()].map(x=>esc(formatMinor(x.cents,x.sample))).join(' · ')} (getrennte Währungen)</div>`:''}</section>
      <details class="card account-disclosure" id="server-home-account-balances" ${data.balancesOpen?'open':''}>
        <summary class="disclosure-toggle"><span><strong>Kontostände</strong><small>${data.accounts.length} Konten · Gesamt ${esc(overall)}</small></span>
        <span class="disclosure-chevron" aria-hidden="true">⌄</span></summary>
        <div class="disclosure-body"><div class="accounts">${accounts||'<div class="empty">Keine Serverkonten vorhanden.</div>'}</div></div>
      </details>
      <section class="card"><div class="section-title"><h2>Dieser Monat</h2><span class="muted">${esc(monthLabel(month))}</span></div>
        <div class="stats"><div><strong class="income">+${esc(formatServerSum(income,data))}</strong><span>Einnahmen</span></div>
          <div><strong class="expense">−${esc(formatServerSum(expense,data))}</strong><span>Ausgaben</span></div></div>
        <p class="muted small">Monatswerte nur aus ${monthly.length} geladenen Serverbuchungen. Für vollständige Monatsberichte ist eine erweiterte API erforderlich.</p></section>
      <section class="card"><div class="section-title"><h2>Buchungen</h2><span class="muted small" id="server-home-booking-count">${homeResults.length} Treffer</span></div>
        <div class="booking-quick-bar"><label class="field" for="server-home-search">Buchungen durchsuchen
          <input id="server-home-search" type="search" autocomplete="off" placeholder="Empfänger, Kategorie, Konto, Notiz, Betrag …" value="${esc(data.searchHome)}"></label></div>
        <div id="server-booking-results">${serverBookingResultsHtml(data,'home')}</div>
        <p class="muted small">Suche in geladenen Serverbuchungen; ältere Daten über „Weitere Serverseiten durchsuchen“ nachladen.</p></section>
      ${serverConnectionInfo(data)}`;
  }
  const activeFilters=data.dateFrom||data.dateTo||data.kindFilter!=='all'||data.accountFilter!=='all'||data.categoryFilter!=='all';
  const accountOptions=data.accounts.map(a=>`<option value="${a.id}" ${data.accountFilter===String(a.id)?'selected':''}>${esc(a.name)}</option>`).join('');
  const categoryOptions=data.categories.slice().sort((x,y)=>x.name.localeCompare(y.name,'de'))
    .map(c=>`<option value="${c.id}" ${data.categoryFilter===String(c.id)?'selected':''}>${esc(c.name)} (${c.kind==='income'?'Einnahme':'Ausgabe'})</option>`).join('');
  const rows=displayedServerBookings(data,'bookings');
  return `${status}<section class="intro"><div><div class="eyebrow">Dein Haushaltsbuch</div><h1>Buchungen</h1></div>
    <button class="btn primary" data-action="server-add-booking" ${canWrite?'':'disabled'}>+ Neu</button></section>
    <section class="card"><div class="section-title"><h2>Verlauf</h2><span class="muted" id="server-booking-count">${rows.length} Buchungen</span></div>
      <div class="booking-quick-bar"><label class="field" for="server-bookings-search">Schnellsuche in allen geladenen Buchungen
        <input id="server-bookings-search" type="search" autocomplete="off" placeholder="Empfänger, Kategorie, Konto, Notiz, Betrag …" value="${esc(data.searchBookings)}"></label></div>
      <details id="server-booking-advanced-filters" class="filter-disclosure" ${data.filtersOpen?'open':''}>
        <summary class="disclosure-toggle"><span><strong>Filter und Zeitraum</strong>
          <small>Erweiterte Suche${activeFilters?' · Filter aktiv':''}</small></span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary>
        <div class="disclosure-body"><div class="book-filters">
          <label class="field">Zeitraum<select id="server-filter-period">
            <option value="7" ${data.period==='7'?'selected':''}>1 Woche</option>
            <option value="30" ${data.period==='30'?'selected':''}>1 Monat (30 Tage)</option>
            <option value="90" ${data.period==='90'?'selected':''}>3 Monate (90 Tage)</option>
            <option value="180" ${data.period==='180'?'selected':''}>6 Monate (180 Tage)</option>
            <option value="all" ${data.period==='all'?'selected':''}>Alle Buchungen</option></select></label>
          <label class="field">Buchungsart<select id="server-filter-kind">
            <option value="all" ${data.kindFilter==='all'?'selected':''}>Alle Arten</option>
            <option value="expense" ${data.kindFilter==='expense'?'selected':''}>Ausgaben</option>
            <option value="income" ${data.kindFilter==='income'?'selected':''}>Einnahmen</option>
            <option value="transfer" ${data.kindFilter==='transfer'?'selected':''}>Umbuchungen</option></select></label>
          <label class="field">Konto<select id="server-filter-account"><option value="all">Alle Konten</option>${accountOptions}</select></label>
          <label class="field">Kategorie<select id="server-filter-category"><option value="all">Alle Kategorien</option>${categoryOptions}</select></label>
          <label class="field">Ab Datum<input type="date" id="server-filter-from" value="${esc(data.dateFrom)}"></label>
          <label class="field">Bis Datum<input type="date" id="server-filter-to" value="${esc(data.dateTo)}"></label>
        </div><p class="muted small">Filter und Suche berücksichtigen ausschließlich geladene Serverseiten.</p>
        <div class="btn-row no-print"><button class="btn secondary" data-action="server-reset-filters">Filter zurücksetzen</button></div>
        ${data.dateFrom&&data.dateTo&&data.dateFrom>data.dateTo?'<div class="notice">Das Startdatum liegt hinter dem Enddatum. Bitte Filter korrigieren.</div>':''}
        </div></details>
      <div class="server-list-toolbar"><label class="field">Sortieren<select id="server-list-sort">
        <option value="newest" ${prefs.sort==='newest'?'selected':''}>Datum: neueste zuerst</option>
        <option value="oldest" ${prefs.sort==='oldest'?'selected':''}>Datum: älteste zuerst</option>
        <option value="amount-desc" ${prefs.sort==='amount-desc'?'selected':''}>Betrag: höchste zuerst</option>
        <option value="amount-asc" ${prefs.sort==='amount-asc'?'selected':''}>Betrag: niedrigste zuerst</option></select></label>
        <span class="muted small">${prefs.pageSize} Buchungen je Anzeige</span></div>
      <p class="muted small">${data.bookings.length} Serverbuchungen geladen${data.nextBefore!==null?' · weitere Serverseiten verfügbar':''}; kein Zugriff auf die lokale Buchungsliste.</p>
      <div id="server-bookings-summary">${serverBookingSummaryHtml(data)}</div>
      <div id="server-booking-results">${serverBookingResultsHtml(data,'bookings')}</div></section>
    ${serverConnectionInfo(data)}`;
}
function localDefault(server:string):number{
  try{return Number(localStorage.getItem('fielanzen-server-default:'+server)||0);}catch{return 0;}
}
export function serverSettingsHtml(data:ServerViewData):string {
  const defaultOptions=data.accounts.filter(a=>a.active).map(a=>`<option value="${a.id}" ${localDefault(data.server)===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
  const accountRows=data.accounts.map(a=>`<div class="settings-line"><div class="setting-details"><strong>${esc(a.name)}</strong>
    <span>${esc(a.currency)} · ${a.active?'aktiv':'inaktiv'}</span></div>
    <strong>${esc(formatMinor(a.balanceMinor,a))}</strong></div>`).join('');
  const categories=data.categories.map(c=>`<div class="settings-line"><div class="setting-details"><strong>${esc(c.name)}</strong>
    <span>${c.kind==='income'?'Einnahme':'Ausgabe'}</span></div></div>`).join('');
  const payees=data.payees.map(p=>`<div class="settings-line"><div class="setting-details"><strong>${esc(p.name)}</strong></div></div>`).join('');
  return `<section class="intro"><div><div class="eyebrow">Verwaltung · Dashboard-Server</div><h1>Einstellungen</h1></div></section>
    <details class="card account-disclosure"><summary class="disclosure-toggle"><span><strong>Konten (${data.accounts.length})</strong>
      <small>Serverkonten · Nur Anzeige</small></span><span class="disclosure-chevron">⌄</span></summary>
      <div class="disclosure-body">${accountRows||'<div class="empty">Keine Serverkonten verfügbar.</div>'}</div></details>
    <section class="card"><h2>Standardkonto</h2><label class="field">Konto für neue Serverbuchungen
      <select id="srv-default-account"><option value="0">Erstes aktives Serverkonto</option>${defaultOptions}</select></label>
      <button class="btn secondary" data-action="server-save-default">Standardkonto speichern</button>
      <p class="muted small">Nur eine Einstellung auf diesem Gerät. Sie verändert keine lokalen oder serverseitigen Buchungen.</p></section>
    <details class="card account-disclosure"><summary class="disclosure-toggle"><span><strong>Kategorien (${data.categories.length})</strong>
      <small>Vom Server gelesen · Nur Anzeige</small></span><span class="disclosure-chevron">⌄</span></summary>
      <div class="disclosure-body">${categories||'<div class="empty">Keine Serverkategorien verfügbar.</div>'}</div></details>
    <details class="card account-disclosure"><summary class="disclosure-toggle"><span><strong>Empfänger (${data.payees.length})</strong>
      <small>Vom Server gelesen · Nur Anzeige</small></span><span class="disclosure-chevron">⌄</span></summary>
      <div class="disclosure-body">${payees||'<div class="empty">Keine Serverempfänger verfügbar.</div>'}</div></details>
    ${bookingListSettingsHtml(readBookingList())}
    <section class="card"><div class="section-title"><h2>Dashboard-Verbindung</h2>
      <button class="btn secondary" data-action="server-reload">Aktualisieren</button></div>
      <p><strong>Aktiv: Dashboard-Server</strong></p><p class="muted small">${esc(data.server)}</p>
      <p class="muted small">Der Server führt die Buchungen; die lokale SQLite-Datenbank bleibt getrennt und wird nicht synchronisiert.</p>
      ${data.error?`<div class="error" role="alert">${esc(data.error)}</div>`:''}
      ${data.session?`<p class="muted small">Finanzmodus: ${esc(data.session.financeMode)} · API: ${esc(data.session.access)} · Schreiben: ${data.session.canWrite?'freigegeben':'nicht freigegeben'}</p>`:''}
      ${data.pending?'<p class="warning">Ein unklarer Server-Schreibauftrag ist noch offen. Bitte erst im Dashboard klären.</p>':''}
      <div class="btn-row"><button class="btn primary" data-action="server-switch-local">Zur lokalen Datenbank wechseln</button></div>
      <details class="audit-list"><summary><strong>Weitere Verbindungsaktionen</strong></summary><div class="btn-row">
        <button class="btn secondary" data-action="server-reload">Verbindung und Rechte prüfen</button>
        <button class="btn danger" data-action="server-forget-token">Geräteschlüssel auf diesem Gerät löschen</button></div></details></section>
    <section class="card"><h2>Sicherung</h2><p class="muted small">Lokale JSON- und Financisto-Backups gehören ausschließlich zum lokalen Datenbestand. Serverseitige Buchungen werden nicht in die lokale Sicherung gemischt.</p></section>`;
}
