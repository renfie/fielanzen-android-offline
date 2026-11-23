// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {RemoteAccount,RemoteBooking,RemoteCategory,DashboardSession,PendingWrite,RemotePayee} from './dashboard-protocol.js';
import {readBookingList,bookingListSettingsHtml,sortTransactionRows} from './booking-list-preferences.js';
export interface ServerViewData {server:string;session:DashboardSession|null;accounts:RemoteAccount[];categories:RemoteCategory[];payees:RemotePayee[];bookings:RemoteBooking[];nextBefore:string|null;error:string;loading:boolean;pending:PendingWrite|null;visibleCount:number;homeVisibleCount:number;searchHome:string;searchBookings:string;}
export const emptyServerData=():ServerViewData=>({server:'',session:null,accounts:[],categories:[],payees:[],bookings:[],nextBefore:null,error:'',loading:false,pending:null,visibleCount:readBookingList().pageSize,homeVisibleCount:readBookingList().pageSize,searchHome:'',searchBookings:''});
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
export function serverBookingResultsHtml(data:ServerViewData,screen:'home'|'bookings'):string{
  const accountMap=new Map(data.accounts.map(a=>[a.id,a]));
  const prefs=readBookingList();
  const forHome=screen==='home';
  const search=forHome?data.searchHome:data.searchBookings;
  const filtered=filterRemoteBookings(data.bookings,search,data.accounts,data.categories);
  const sorted=sortTransactionRows(filtered,prefs.sort,b=>b.amountMinor);
  const displayed=forHome?data.homeVisibleCount:data.visibleCount;
  const shown=sorted.slice(0,displayed);
  const bookingCards=shown.map(b=>{
    const acc=accountMap.get(b.accountId);
    const category=data.categories.find(c=>c.id===b.categoryId)?.name??(b.kind==='transfer'?'Umbuchung':'Ohne Kategorie');
    const main=b.payeeTitle||category;
    const dest=b.kind==='transfer'?' → '+(accountMap.get(b.toAccountId??0)?.name??'Zielkonto'):'';
    const prefix=b.kind==='expense'?'−':b.kind==='income'?'+':'⇄ ';
    return `<details class="server-transaction" name="server-booking-detail"><summary class="server-transaction-summary">
      <div class="server-transaction-primary"><strong>${esc(main)}</strong><span class="server-transaction-meta">${esc(b.date.split('-').reverse().join('.'))} · ${esc(acc?.name??`Konto ${b.accountId}`)}${esc(dest)}</span>
        <span class="booking-type-chip ${esc(b.kind)}">${kindLabel(b.kind)}</span>${b.isRecurring===true?'<span class="booking-type-chip recurring">Wiederkehrend</span>':''}${b.isRuleMatched===true&&!b.isRecurring?'<span class="booking-type-chip rule-match">Regel zugeordnet</span>':''}</div>
      <div class="server-transaction-aside"><strong class="${esc(b.kind)}">${prefix}${esc(formatMinor(b.amountMinor,acc))}</strong><span aria-hidden="true" class="booking-chevron">⌄</span></div>
    </summary><div class="server-transaction-details">
      <div><span>Kategorie</span><strong>${esc(category)}</strong></div><div><span>Empfänger/Zahler</span><strong>${esc(b.payeeTitle||'–')}</strong></div>
      ${b.note?`<div><span>Notiz</span><strong>${esc(b.note)}</strong></div>`:''}
      <div><span>Revision</span><span class="revision-value">${esc(b.revision)}</span></div>
      ${data.session?.canWrite&&!data.pending?`<div class="btn-row"><button type="button" class="btn secondary" data-action="server-edit-booking" data-id="${b.id}">Bearbeiten</button><button type="button" class="btn danger" data-action="server-delete-booking" data-id="${b.id}">Löschen</button></div>`:''}
    </div></details>`;
  }).join('');
  const hasMore=sorted.length>shown.length||data.nextBefore!==null;
  const moreLabel=sorted.length>shown.length?`Weitere ${prefs.pageSize} Treffer anzeigen`
    : search.trim()?'Weitere Serverseiten durchsuchen':`Weitere ${prefs.pageSize} laden`;
  return `<div class="muted small server-search-count">${sorted.length} Treffer in ${data.bookings.length} geladenen Buchungen${data.nextBefore!==null?' · Weitere Serverseiten vorhanden':''}</div>
    ${bookingCards||'<p class="empty">Keine passenden Buchungen in den bisher geladenen Daten.</p>'}
    ${hasMore?`<div class="bookings-more"><button class="btn secondary" data-action="server-more-bookings">${moreLabel}</button></div>`:''}`;
}
export function serverPageHtml(data:ServerViewData,screen:'home'|'bookings'|'recurring'|'reports'|'settings'):string{
  const error=data.error?`<p class="error" role="alert">${esc(data.error)}</p>`:'';
  const pending=data.pending?`<section class="card"><h2>Offener Server-Schreibauftrag</h2><p class="warning">Ein früherer Schreibversuch wurde nicht eindeutig bestätigt. Neue Schreibvorgänge sind gesperrt. Bitte zuerst den Server prüfen.</p>
    <p class="muted small">${esc(data.pending.method)} · ${esc(data.pending.createdAt)} · Idempotency-Key: ${esc(data.pending.idempotencyKey)}</p>
    <div class="btn-row"><button class="btn secondary" data-action="server-reload">Serverdaten laden</button>
    <button class="btn secondary" data-action="server-retry-pending">Denselben Auftrag erneut prüfen/senden</button>
    <button class="btn danger" data-action="server-discard-pending">Nach Kontrolle freigeben</button></div></section>`:'';
  const info=`<section class="card"><div class="section-title"><h2>Dashboard-Server</h2><button class="btn secondary" data-action="server-reload">Aktualisieren</button></div>
    <p>${esc(data.server||'Noch nicht verbunden')}</p><p class="muted small">Eigener Serverdatenbestand. Lokale Konten, Buchungen und Regeln werden weder angezeigt noch übertragen.</p>
    ${data.loading?'<p>Serverdaten werden geladen …</p>':''}${error}
    ${data.session?`<p class="muted small">Führendes System: ${esc(data.session.financeMode)} · API-Zugriff: ${esc(data.session.access)} · Schreibrecht: ${data.session.canWrite?'ja':'nein'}</p>`:''}</section>`;
  if(screen==='recurring'||screen==='reports')return `${info}${pending}<section class="card"><h2>${screen==='recurring'?'Wiederkehrende Buchungen':'Monatsbericht'} (Servermodus)</h2><p>Diese Ansicht ist im Servermodus noch nicht über die Mobile-API verfügbar. Es werden keine lokalen Buchungen oder Regeln angezeigt und keine lokalen Regeln ausgeführt.</p></section>`;
  const prefs=readBookingList();
  const accountCards=data.accounts.map(a=>`<div class="settings-line"><div class="setting-details"><strong>${esc(a.name)}</strong><span>${esc(a.currency)} · ${a.active?'aktiv':'inaktiv'}</span></div><div><strong>${esc(formatMinor(a.balanceMinor,a))}</strong><div class="muted small">Prognose ${esc(formatMinor(a.projectedBalanceMinor,a))}</div></div></div>`).join('');
  const title=screen==='bookings'?'Serverbuchungen':'Serverübersicht';
  const byCurrency=new Map<string,{sum:number;account:RemoteAccount}>();
  for(const a of data.accounts){if(!a.includedInTotal)continue;const old=byCurrency.get(a.currency);byCurrency.set(a.currency,{sum:(old?.sum??0)+a.balanceMinor,account:a});}
  const sums=[...byCurrency.values()].map(x=>esc(formatMinor(x.sum,x.account))).join(' · ');
  return `${info}${pending}<section class="intro"><h1>${title}</h1>${data.session?.canWrite&&!data.pending?'<button class="btn primary" data-action="server-add-booking">+ Serverbuchung</button>':''}</section>
    ${screen!=='bookings'?`<section class="card"><h2>Konten (${data.accounts.length})</h2><p><strong>${sums||'Keine Gesamtsummen'}</strong></p><details><summary>Kontostände anzeigen</summary>${accountCards||'<p>Keine Serverkonten.</p>'}</details></section>`:''}
    <section class="card"><div class="section-title"><h2>${screen==='bookings'?'Buchungen':'Letzte Serverbuchungen'}</h2><span class="muted small">${prefs.pageSize} je Anzeige</span></div>
      <div class="booking-quick-bar"><label class="field" for="server-${screen}-search">Buchungen durchsuchen
        <input id="server-${screen}-search" type="search" autocomplete="off" placeholder="Empfänger, Kategorie, Konto, Notiz, Betrag …" value="${esc(screen==='home'?data.searchHome:data.searchBookings)}"></label>
        <p class="muted small">Die Suche erfasst alle bisher geladenen Serverbuchungen. Über „Weitere Serverseiten durchsuchen“ werden ältere Daten nachgeladen.</p></div>
      ${screen==='bookings'?`<div class="server-list-toolbar"><label class="field">Sortieren<select id="server-list-sort"><option value="newest" ${prefs.sort==='newest'?'selected':''}>Datum: neueste zuerst</option><option value="oldest" ${prefs.sort==='oldest'?'selected':''}>Datum: älteste zuerst</option><option value="amount-desc" ${prefs.sort==='amount-desc'?'selected':''}>Betrag: höchste zuerst</option><option value="amount-asc" ${prefs.sort==='amount-asc'?'selected':''}>Betrag: niedrigste zuerst</option></select></label><span class="muted small">Sortiert werden geladene Buchungen</span></div>`:''}
      <div id="server-booking-results">${serverBookingResultsHtml(data,screen==='home'?'home':'bookings')}</div></section>`;
}
function localDefault(server:string):number{
  try{return Number(localStorage.getItem('fielanzen-server-default:'+server)||0);}catch{return 0;}
}
export function serverSettingsHtml(data:ServerViewData):string {
  return `<section class="intro"><h1>Datenquelle · Servermodus</h1></section><section class="card">
    <p><strong>Aktiv: Dashboard-Server</strong></p><p>${esc(data.server)}</p>
    <p class="muted small">Der Dashboard-Server führt die Buchungen. Die lokale SQLite-Datenbank bleibt separat erhalten und wird nicht synchronisiert.</p>
    ${data.error?`<p class="error">${esc(data.error)}</p>`:''}
    ${data.session?`<p>Finanzmodus: ${esc(data.session.financeMode)} · API-Zugriff: ${esc(data.session.access)} · Schreiben: ${data.session.canWrite?'freigegeben':'nicht freigegeben'}</p>`:''}
    ${data.pending?'<p class="warning">Eine unklare Serveroperation ist noch offen. Sie bleibt auch beim Umschalten gespeichert.</p>':''}
    <section class="card"><h2>Standardkonto für neue Serverbuchungen</h2>
    <label class="field">Konto vorauswählen<select id="srv-default-account"><option value="0">Erstes aktives Serverkonto</option>${data.accounts.filter(a=>a.active).map(a=>`<option value="${a.id}" ${localDefault(data.server)===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
    <button class="btn secondary" data-action="server-save-default">Standardkonto speichern</button>
    <p class="muted small">Nur eine Auswahl auf diesem Gerät; keine Änderungen an den Serverkonten oder lokalen Buchungen.</p></section>
    <button class="btn primary" data-action="server-switch-local">Zur lokalen Datenbank wechseln</button>
    <details class="audit-list"><summary><strong>Weitere Verbindungsaktionen</strong></summary><div class="btn-row">
    <button class="btn secondary" data-action="server-reload">Verbindung und Rechte erneut prüfen</button>
    <button class="btn danger" data-action="server-forget-token">Geräteschlüssel auf diesem Gerät löschen</button></div></details>
    </section>${bookingListSettingsHtml(readBookingList())}<section class="card"><h2>Sicherung</h2><p>Lokale JSON- und Financisto-Backups gehören ausschließlich zum lokalen Datenbestand. Serverseitige Buchungen werden nicht in die lokale Sicherung gemischt.</p></section>`;
}
