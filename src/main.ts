// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import {openStorage} from './database.js';
import {exportUserText,exportUserBytes,runningNatively} from './file-export.js';
import {exportBackup} from './backup.js';
import {encodeBase64,parseAutomaticBackup} from './automatic-backup.js';
import {NativeAutoBackup} from './native-auto-backup.js';
import type {FolderStatus,WriteResult} from './native-auto-backup.js';
import {importFinancistoFile,expandGzip} from './financisto.js';
import {exportFinancistoCompatible} from './financisto-export.js';
import {fromLegacyConversion,inventoryReport,prependReport,toPayeeCsv} from './import-report.js';
import type {RecurringInput,RecurringRule,Frequency} from './recurring.js';
import {checkRecurring} from './recurring.js';
import type {Booking, BookingInput, BookingType, CategoryKind, Snapshot,ImportReport,ImportGap} from './types.js';
import {accountBalance, checkBooking, defaultAutoBackup, emptySnapshot, formatEuro, parseEuro, parseSignedEuro} from './types.js';
import {bookingTotals,calculateBalances,exportBookingsCsv,inspectSnapshot,inventoryAsText,lastPayeeUsage,monthOffset,monthlyTrend} from './analysis.js';
import {categorySuggestions, filterManagedCategories} from './category-ui.js';
import {attachDialogSuggestions,rankSuggestions,suggestionKey} from './suggestion-ui.js';
import {planAccountReconciliation} from './reconcile.js';
import {normalizeDashboardUrl,probeDashboard,DashboardClient,createPendingWrite} from './dashboard-api.js';
import type {RemoteAccount,RemoteCategory,RemotePayee,RemoteBooking,RemoteDraft,PendingWrite} from './dashboard-api.js';
import {validateRemoteDraft,parsePending,DashboardApiError} from './dashboard-protocol.js';
import {secureSession} from './secure-session.js';
import {mtlsHttp} from './mtls-http.js';
import {connectWithOptionalClientCertificate} from './dashboard-connection.js';
import {serverPageHtml,serverSettingsHtml,emptyServerData,formatMinor,serverBookingResultsHtml,displayedServerBookings,serverBookingSummaryHtml} from './server-ui.js';
import type {ServerViewData} from './server-ui.js';
import {createRecurringPendingWrite,validateServerRecurringDraft} from './server-recurring.js';
import type {ServerRecurringRule,ServerRecurringDraft,ServerRecurringMode,ServerRecurringFrequency} from './server-recurring.js';
import {readBookingList,saveBookingList,bookingListSettingsHtml,sortTransactionRows} from './booking-list-preferences.js';
import {appLock} from './app-lock.js';
import {bookingCardHtml} from './booking-card-ui.js';
import {calendarMonth,renderHomeComparison,type HomeComparisonFilter} from './home-comparison.js';
import gplText from '../LICENSE?raw';
import noticeDe from '../NOTICE.md?raw';
import noticeEn from '../NOTICE.en.md?raw';

export const APP_VERSION='0.1.0-alpha.34';
document.documentElement.classList.toggle('native-android',runningNatively());
const app = document.querySelector<HTMLDivElement>('#app')!;
let storage: Awaited<ReturnType<typeof openStorage>>;
let state: Snapshot = emptySnapshot();
let view: 'home' | 'bookings' | 'recurring' | 'reports' | 'settings' | 'import-audits' | 'data-check' = 'home';
let auditChoice='inventory';
let auditQuery='';
let auditRowsVisible=80;
let inventoryCacheSnapshot:Snapshot|null=null;
let inventoryCacheReport:ImportReport|null=null;
const initialDate=new Date();
let reportMonth = `${initialDate.getFullYear()}-${String(initialDate.getMonth()+1).padStart(2,'0')}`;
let reportAccountFilter='all';
let homeCompare:HomeComparisonFilter={first:reportMonth,second:calendarMonth(reportMonth,-1),currency:'EUR',account:'all',category:'all'};
let homeFiltersOpen=false;
let bookingDateFrom='';
let bookingDateTo='';
let bookingCategoryFilter='all';
type Period = 'all' | '7' | '30' | '90' | '180';
let filter: Period = '30';
let bookingPeriodExplicit=false;
let bookingTypeFilter: 'all' | BookingType = 'all';
let bookingAccountFilter = 'all';
let bookingQuery = '';
let homeBookingQuery = '';
let visibleHomeBookingCount = readBookingList().pageSize;
let bookingFiltersOpen=false;
let homeBalancesOpen=false;
let expandedBookingId: number | null = null;
let visibleBookingCount = readBookingList().pageSize;
let payeeQuery='';
let visiblePayeeCount=60;
let categoryQuery='';
let categoryKindFilter:'all'|CategoryKind='all';
let visibleCategoryCount=60;
let accountsOpen=false;
let categoriesOpen=false;
let payeesOpen=false;
let message = '';
let backupStatus:FolderStatus|null=null;
let dashboardProbeResult='Noch nicht verbunden. Der lokale Datenbestand bleibt unverändert.';
let dashboardConnecting=false;
let serverMode=false;
let remote:ServerViewData=emptyServerData();
/** A successful connection is NOT an activation. Preview stays in RAM until a separate explicit tap. */
interface StagedDashboard {
  server:string; token:string; session:ServerViewData['session']; accounts:RemoteAccount[];
  categories:RemoteCategory[]; payees:RemotePayee[];
  first:Awaited<ReturnType<DashboardClient['bookings']>>;
}
let stagedDashboard:StagedDashboard|null=null;
let serverWriteBusy=false;
let serverLoadBusy=false;

let backupSettingsMessage='';
// Capacitor 8 uses a Proxy for registerPlugin(). It MUST NEVER be returned
// from a Promise or async function: promise resolution reads the Proxy's
// 'then' property and accidentally invokes a native method named 'then'.
// Always return the plugin object synchronously. Only await its methods.
function nativeBackup():typeof NativeAutoBackup{
  const bridge=(window as typeof window & {Capacitor?:{isPluginAvailable?:(name:string)=>boolean}}).Capacitor;
  if(!runningNatively())throw new Error('Die Android-Sicherungsfunktion benötigt die installierte Android-App.');
  if(!bridge?.isPluginAvailable)throw new Error('Capacitor-Pluginregister ist nicht erreichbar.');
  if(!bridge.isPluginAvailable('FieLanzenAutoBackup'))
    throw new Error('FieLanzenAutoBackup ist nicht registriert. Android-Build/Plugin-Registrierung prüfen.');
  return NativeAutoBackup;
}
function backupBridgeDiagnosis():string{
  const bridge=(window as typeof window & {Capacitor?:{isNativePlatform?:()=>boolean;isPluginAvailable?:(name:string)=>boolean;getPlatform?:()=>string}}).Capacitor;
  return [
    `FieLanzen ${APP_VERSION}`,
    `Plattform: ${bridge?.getPlatform?.()??'unbekannt'}`,
    `Native: ${runningNatively()?'ja':'nein'}`,
    `Capacitor: ${bridge?'vorhanden':'fehlt'}`,
    `Plugin-Prüfung: ${bridge?.isPluginAvailable?'vorhanden':'fehlt'}`,
    `FieLanzenAutoBackup: ${bridge?.isPluginAvailable?.('FieLanzenAutoBackup')?'registriert':'nicht registriert'}`,
    `Letzter Fehler: ${backupError||backupStatus?.lastError||'keiner'}`
  ].join('\n');
}
let backupError='';
let backupProgress='';
let backupRunning=false;
function showBackupProgress(stage:string):void{
  backupProgress=stage;
  if(view==='settings')updateBackupStatus();
}
async function checkedBackupStep<T>(label:string,promise:Promise<T>,timeout=45000):Promise<T>{
  showBackupProgress(label);
  let timer:number|undefined;
  try{ return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(`${label}: Keine Rückmeldung nach ${Math.round(timeout/1000)} Sekunden. Bitte die Diagnose anzeigen.`)),timeout);})]);}
  finally {if(timer!==undefined)window.clearTimeout(timer);}
}

let stageTimer:number|null=null;
let stageInProgress=false;
let stageAgain=false;

/** Native backup is opt-in. Stage the CURRENT validated snapshot after mutations;
 * the Android worker exports this last staged snapshot into the selected SAF folder.
 */
async function stageCurrentSnapshot():Promise<void>{
  if(serverMode || !runningNatively() || !state.settings.autoBackup?.enabled)return;
  if(stageInProgress){stageAgain=true;return;}
  stageInProgress=true;
  try{
    const {bytes}=await exportFinancistoCompatible(state);
    const plugin=nativeBackup();
    await plugin.stageBackup({base64:encodeBase64(bytes),stageOnly:true});
    await plugin.runDueNow(); // catch up with the freshly staged snapshot, never a stale one
    backupStatus=await plugin.getStatus();
    backupError='';
  }catch(error){
    backupError=error instanceof Error?error.message:String(error);
    console.error('FieLanzen automatische Sicherung:',error);
  }finally{
    stageInProgress=false;
    if(stageAgain){stageAgain=false;scheduleSnapshotStaging();}
    if(view==='settings') updateBackupStatus();
  }
}
function scheduleSnapshotStaging():void{
  if(serverMode||!runningNatively()||!state.settings.autoBackup?.enabled)return;
  if(stageTimer!==null)clearTimeout(stageTimer);
  stageTimer=window.setTimeout(()=>{stageTimer=null;void stageCurrentSnapshot();},150);
}
async function syncNativeBackup():Promise<void>{
  if(!runningNatively())return;
  const currentStatus=await nativeBackup().getStatus();
  backupStatus=currentStatus;
  const pref=state.settings.autoBackup??defaultAutoBackup();
  // Missing/revoked folder: never enable background export by accident.
  await nativeBackup().configure({...pref,enabled:!serverMode&&pref.enabled&&currentStatus.selected});
  if(pref.enabled&&!currentStatus.selected)backupError='Der ausgewählte Ordner fehlt oder ist nicht mehr freigegeben. Bitte Ordner erneut auswählen.';
  scheduleSnapshotStaging();
}
/** The system folder chooser must never strand the settings UI indefinitely.
 * Count only foreground time, so navigating a real system picker is not rushed.
 * If no callback arrives, the explicit Downloads fallback remains available.
 */
function withVisiblePickerTimeout<T>(pending:Promise<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    let foregroundMs=0;
    const started=Date.now();
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=='hidden')foregroundMs+=500;
      // Some file pickers incorrectly mark the app hidden without opening a UI.
      // Bound both foreground time and absolute wait to avoid a permanent spinner.
      if(foregroundMs>=20000 || Date.now()-started>=60000){
        window.clearInterval(timer);
        reject(new Error('Keine Rückmeldung von der Android-Ordnerauswahl. Du kannst stattdessen den festen Ordner Downloads/FieLanzen verwenden.'));
      }
    },500);
    pending.then(result=>{window.clearInterval(timer);resolve(result);},error=>{window.clearInterval(timer);reject(error);});
  });
}

async function useDownloadsBackupFolder():Promise<void>{
  if(!runningNatively())throw new Error('Nur in der Android-App verfügbar.');
  // The button is the user's affirmative action. window.confirm blocked the
  // JavaScript/WebView path on some devices before native storage was called.
  backupStatus=await checkedBackupStep<FolderStatus>('Downloads als Ziel aktivieren', nativeBackup().useDownloadsFolder(),12000);
  backupError='';
  await backupNow();
}
async function selectBackupFolder():Promise<void>{
  const button=document.querySelector<HTMLButtonElement>('[data-action="choose-auto-backup-folder"]');
  if(button){button.disabled=true;button.textContent='Android-Ordnerauswahl wird geöffnet …';}
  try{
    const chosen=await withVisiblePickerTimeout<FolderStatus>(nativeBackup().selectFolder());
    backupStatus=chosen;
    if(!chosen.selected)throw new Error('Die Ordnerfreigabe wurde nicht bestätigt. Bitte einen beschreibbaren Unterordner in Dokumente wählen.');
  }finally{
    if(button?.isConnected){button.disabled=false;button.textContent='Speicherordner wählen';}
  }
  backupError='';
  if(state.settings.autoBackup?.enabled){
    await nativeBackup().configure(state.settings.autoBackup);
    scheduleSnapshotStaging();
  }
  render();
}
async function updateAutoBackupSettings(next:NonNullable<Snapshot['settings']['autoBackup']>):Promise<void>{
  if(!runningNatively())throw new Error('Die automatische Ordnersicherung ist nur in der Android-App verfügbar.');
  if(next.enabled&&!backupStatus?.selected)throw new Error('Bitte zuerst einen lokalen Sicherungsordner auswählen.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.time))throw new Error('Bitte eine gültige Uhrzeit wählen.');
  if(!Number.isInteger(next.keep)||next.keep<1||next.keep>50)throw new Error('Aufbewahrung muss zwischen 1 und 50 liegen.');
  const wasEnabled=Boolean(state.settings.autoBackup?.enabled);
  // The first export is mandatory when enabling; it also proves Downloads access.
  if(next.enabled&&!wasEnabled)await backupNow();
  // A background Worker has no access to the WebView. Stage a CURRENT export first.
  if(next.enabled){
    const {bytes}=await exportFinancistoCompatible(state);
    await nativeBackup().stageBackup({base64:encodeBase64(bytes),stageOnly:true});
  }
  await nativeBackup().configure(next);
  await storage.saveSettings({...state.settings,autoBackup:next});
  state=await storage.read();
  backupError='';
  backupSettingsMessage=next.enabled?`Zeitplan gespeichert: ${next.frequency==='daily'?'täglich':next.frequency==='weekly'?'wöchentlich':'monatlich'} ab ${next.time} Uhr. Der erste Export wurde bei Aktivierung angelegt.`:'Automatische Sicherung deaktiviert und Einstellung gespeichert.';
  backupStatus=await nativeBackup().getStatus();
  render();
}
async function backupNow():Promise<void>{
  if(!runningNatively())throw new Error('Bitte die Android-App für den Ordnerexport verwenden.');
  if(backupRunning)throw new Error('Eine Sicherung läuft bereits.');
  backupRunning=true;
  backupError='';
  let step='Vorbereitung';
  try {
    const plugin=nativeBackup(); // synchronous; never put a Capacitor plugin Proxy into Promise.race()
    // Kontrollaufruf an die native Java-Klasse: trennt eine fehlende Registrierung
    // von einem Android-Bridgefehler und dem eigentlichen MediaStore-Schreiben.
    step='Android-Pluginantwort prüfen';
    backupStatus=await checkedBackupStep<FolderStatus>(step,plugin.getStatus(),12000);
    if(!backupStatus.selected){
      step='Downloads aktivieren';
      backupStatus=await checkedBackupStep<FolderStatus>(step,plugin.useDownloadsFolder(),12000);
    }
    step='Financisto-Datei erzeugen';
    showBackupProgress(step);
    const {bytes,summary}=await exportFinancistoCompatible(state);
    step='Sicherungsdaten an Android übertragen';
    await checkedBackupStep(step,plugin.stageBackup({base64:encodeBase64(bytes),stageOnly:true}),60000);
    step='Datei in Android-Downloads schreiben und überprüfen';
    const result=await checkedBackupStep<WriteResult>(step,plugin.writeNow(),60000);
    if(!result.written||!result.name?.endsWith('.backup'))throw new Error('Android hat keinen bestätigten Dateiexport zurückgegeben.');
    step='Ergebnis bestätigen';
    const finalStatus=await checkedBackupStep<FolderStatus>(step,plugin.getStatus(),10000);
    backupStatus=finalStatus;
    if(finalStatus.lastExportName!==result.name)throw new Error('Android hat einen abweichenden Sicherungsnamen gemeldet.');
    backupError='';
    message=`Sicherung erfolgreich: ${result.name} – ${summary.bookings} Buchungen, ${summary.accounts} Konten, ${summary.scheduledExported??0} wiederkehrende Vorlagen.`;
  } catch(e) {
    const detail=e instanceof Error?e.message:String(e);
    backupError=`${step}: ${detail}`;
    throw new Error(backupError);
  } finally {
    backupRunning=false;
    backupProgress='';
    if(view==='settings')render();
  }
}
function updateBackupStatus():void{
  const label=document.querySelector<HTMLElement>('#auto-backup-status');
  if(label)label.innerHTML=backupStatusHtml();
}
function backupStatusHtml():string{
  if(!runningNatively())return 'Automatische Ordnersicherungen sind in der Browser-Vorschau nicht verfügbar.';
  // Errors must also be shown BEFORE a folder has ever been selected.
  // Alpha 10 swallowed missing-plugin and folder-picker errors here.
  const issue=backupError||backupStatus?.lastError||'';
  const warning=issue?`<span class="warning" role="alert">Sicherungsfehler: ${esc(issue)}</span>`:'';
  const progress=backupProgress?`<span role="status"><strong>Bitte beachten:</strong> ${esc(backupProgress)} …</span>`:'';
  if(backupStatus===null)return `<strong>Android-Sicherungsdienst noch nicht bestätigt.</strong><span>Der Status des nativen Plugins wird geprüft. Bei einem Fehler bitte die Diagnose öffnen; noch wurde keine Datei geschrieben.</span>${progress}${warning}`;
  if(!backupStatus.selected)return `<strong>Kein beschreibbares Sicherungsziel bestätigt.</strong><span>Downloads/FieLanzen wird bei der ersten erfolgreichen Sicherung angelegt.</span>${progress}${warning}`;
  const stamp=backupStatus.lastExportAt?new Date(backupStatus.lastExportAt).toLocaleString('de-DE'):'Noch keine Sicherung erstellt';
  const last=backupStatus.lastExportName?`<span>Datei: ${esc(backupStatus.lastExportName)}</span>`:'';
  const lastAuto=backupStatus.lastAutomaticAt?new Date(backupStatus.lastAutomaticAt).toLocaleString('de-DE'):'noch keine';
  const next=backupStatus.nextScheduledAt?new Date(backupStatus.nextScheduledAt).toLocaleString('de-DE'):'nicht geplant';
  const attempted=backupStatus.lastAttemptAt?new Date(backupStatus.lastAttemptAt).toLocaleString('de-DE'):'noch keiner';
  const automatic=state.settings.autoBackup?.enabled?`<span>Letzter Automatikversuch: ${esc(attempted)}</span><span>Letzte automatische Sicherung: ${esc(lastAuto)}</span><span>Nächste Zielzeit: ${esc(next)} (Android darf verzögern)</span>`:'<span>Automatik: deaktiviert</span>';
  return `<strong>Ordner: ${esc(backupStatus.name)}</strong><span>Letzter Export: ${esc(stamp)}</span>${automatic}${last}${progress}${warning}`;
}


function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
}
const txt = (id: string): string => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value ?? '';
const option = (id: number, name: string, selected?: number | null) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(name)}</option>`;
const friendlyDate = (iso: string): string => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE');
const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const moneyInput = (cents: number): string => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents)/100)},${String(Math.abs(cents)%100).padStart(2, '0')}`;
const defaultAccountId=():number=>state.accounts.find(a=>a.id===state.settings.defaultAccountId)?.id ?? state.accounts[0]?.id ?? 0;
const getAccount = (id: number) => state.accounts.find(a => a.id === id)?.name ?? 'Unbekanntes Konto';
const getCategory = (id: number | null) => state.categories.find(c => c.id === id)?.name ?? 'Umbuchung';
const getPayee = (id: number | null) => state.payees.find(p => p.id === id)?.name ?? '';
const kindName = (v: BookingType) => ({income:'Einnahme',expense:'Ausgabe',transfer:'Umbuchung'}[v]);

function sortBookings(a: Booking, b: Booking): number {return b.date.localeCompare(a.date) || b.id - a.id;}
function allBookingsSorted(): Booking[] { return [...state.bookings].sort(sortBookings); }
function sortedLocalBookings():Booking[]{return sortTransactionRows(state.bookings,readBookingList().sort,b=>b.amountCents);}
function localSearchMatches(rows:Booking[],queryText:string):Booking[]{
  const query=queryText.trim().toLocaleLowerCase('de');
  if(!query)return rows;
  const accounts=new Map(state.accounts.map(a=>[a.id,a.name]));
  const categories=new Map(state.categories.map(c=>[c.id,c.name]));
  const payees=new Map(state.payees.map(p=>[p.id,p.name]));
  return rows.filter(b => [b.payeeId===null?'':payees.get(b.payeeId)??'',b.categoryId===null?'':categories.get(b.categoryId)??'',accounts.get(b.accountId)??'',
    b.otherAccountId ? accounts.get(b.otherAccountId)??'' : '',b.note,b.date,friendlyDate(b.date),kindName(b.type),moneyInput(b.amountCents),formatEuro(b.amountCents)]
    .some(value => value.toLocaleLowerCase('de').includes(query)));
}
function filteredBookings(): Booking[] {
  let result = sortedLocalBookings();
  // The quick search spans ALL history unless the user chose an explicit date range.
  if (filter !== 'all' && !bookingDateFrom && !bookingDateTo && (!bookingQuery.trim() || bookingPeriodExplicit)) {
    const start = new Date();
    start.setDate(start.getDate() - Number(filter) + 1);
    const from = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
    result = result.filter(b => b.date >= from);
  }
  if (bookingDateFrom) result=result.filter(b=>b.date>=bookingDateFrom);
  if (bookingDateTo) result=result.filter(b=>b.date<=bookingDateTo);
  if (bookingTypeFilter !== 'all') result = result.filter(b => b.type === bookingTypeFilter);
  if (bookingCategoryFilter !== 'all') result = result.filter(b => b.categoryId === Number(bookingCategoryFilter));
  if (bookingAccountFilter !== 'all') {
    const accountId = Number(bookingAccountFilter);
    result = result.filter(b => b.accountId === accountId || (b.type === 'transfer' && b.otherAccountId === accountId));
  }
  return localSearchMatches(result,bookingQuery);
}
function accountCards(): string {
  const balances=calculateBalances(state);
  return state.accounts.length ? `<div class="accounts">${state.accounts.map(a => `<div class="account"><div class="account-name">${esc(a.name)}</div><div class="account-value ${(balances.get(a.id)??0)<0?'expense':''}">${formatEuro(balances.get(a.id)??0)}</div></div>`).join('')}</div>`
    : `<div class="empty">Noch kein Konto vorhanden.<br><button class="btn primary" data-action="add-account" style="margin-top:12px">Erstes Konto anlegen</button></div>`;
}
function bookingListItem(b: Booking): string {
  const expanded = expandedBookingId === b.id;
  const title = b.type === 'transfer' ? `${getAccount(b.accountId)} → ${getAccount(b.otherAccountId!)}` : (getPayee(b.payeeId) || getCategory(b.categoryId));
  const prefix = b.amountCents === 0 ? '' : b.type === 'income' ? '+' : b.type === 'expense' ? '−' : '⇄ ';
  return bookingCardHtml({
    id:b.id, source:'local', expanded, title,
    dateLabel:friendlyDate(b.date),
    categoryLabel:b.type === 'transfer' ? 'Umbuchung' : getCategory(b.categoryId),
    kind:b.type, kindLabel:kindName(b.type), amountLabel:prefix+formatEuro(b.amountCents),
    recurring:Boolean(b.recurringRuleId), zeroBooking:b.amountCents===0,
    details:[
      {label:'Art',value:kindName(b.type)+(b.amountCents===0?' · Nullbuchung (keine Saldoänderung)':'')},
      {label:'Datum',value:friendlyDate(b.date)},
      {label:'Quellkonto',value:getAccount(b.accountId)},
      b.type==='transfer'?{label:'Zielkonto',value:getAccount(b.otherAccountId!)}
        :{label:'Kategorie',value:getCategory(b.categoryId)},
      ...(b.type!=='transfer'&&b.payeeId!==null?[{label:'Empfänger / Zahler',value:getPayee(b.payeeId)}]:[]),
      ...(b.note?[{label:'Notiz',value:b.note,isNote:true}]:[])
    ],
    actions:[
      {action:'clone-booking',title:'Klonen',style:'secondary'},
      {action:'edit-booking',title:'Bearbeiten',style:'primary'},
      {action:'delete-booking',title:'Löschen',style:'danger'}
    ]
  });
}
function homeBookings():Booking[]{return localSearchMatches(sortedLocalBookings(),homeBookingQuery);}
function bookingsHtml(forHome=false): string {
  const all = forHome ? homeBookings() : filteredBookings();
  const shown = all.slice(0,forHome?visibleHomeBookingCount:visibleBookingCount);
  if (!all.length) return '<div class="empty">Keine passenden Buchungen vorhanden.</div>';
  return `${shown.map(bookingListItem).join('')}${all.length > shown.length
    ? `<div class="bookings-more"><span>${shown.length} von ${all.length} Buchungen</span><button class="btn secondary" data-action="more-bookings">Weitere ${readBookingList().pageSize} laden</button></div>` : ''}`;
}
function updateHomeResults():void{
  const root=document.querySelector('#home-booking-results');
  if(!root)return;
  const matches=homeBookings();
  root.innerHTML=bookingsHtml(true);
  const count=document.querySelector('#home-booking-count');
  if(count)count.textContent=`${matches.length} Treffer`;
}
function homeHtml(): string {
  const overall = [...calculateBalances(state,today()).values()].reduce((v,cents)=>v+cents,0);
  const comparison=renderHomeComparison({
    prefix:'local-home',filter:homeCompare,
    accounts:state.accounts.map(a=>({id:a.id,name:a.name,currency:'EUR',decimals:2})),
    categories:state.categories.map(c=>({id:c.id,name:c.name})),
    bookings:state.bookings.map(b=>({date:b.date,kind:b.type,accountId:b.accountId,
      categoryId:b.categoryId??0,amountMinor:b.amountCents})),
    complete:true,defaultCurrency:'EUR',filtersOpen:homeFiltersOpen
  });
  return `<section class="intro"><div><div class="eyebrow">Deine Finanzen im Blick</div><h1>Übersicht</h1><div class="muted small">Alle Daten lokal auf diesem Gerät</div></div><button class="btn primary" data-action="add-booking" ${!state.accounts.length?'disabled':''}>+ Buchung</button></section>
    <section class="card"><div class="section-title"><h2>Gesamtvermögen</h2><span class="muted">Alle Konten</span></div><div class="balance-total ${overall<0?'expense':''}">${formatEuro(overall)}</div></section>
    <details class="card account-disclosure" id="home-account-balances" ${homeBalancesOpen?'open':''}>
      <summary class="disclosure-toggle"><span><strong>Kontostände</strong><small>${state.accounts.length} Konten · Gesamt ${formatEuro(overall)}</small></span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary>
      <div class="disclosure-body"><div class="btn-row disclosure-tools"><button class="btn text" data-action="add-account">+ Konto</button><button class="btn secondary" data-action="reconcile-account">Kontostand abgleichen</button></div>${accountCards()}</div>
    </details>
    ${comparison}
    <section class="card"><div class="section-title"><h2>Buchungen</h2><span class="muted small" id="home-booking-count">${homeBookings().length} Treffer</span></div>
      <div class="booking-quick-bar"><label class="field" for="home-booking-search">Buchungen durchsuchen
        <input id="home-booking-search" type="search" autocomplete="off" placeholder="Empfänger, Kategorie, Konto, Notiz, Betrag …" value="${esc(homeBookingQuery)}"></label></div>
      <div id="home-booking-results">${bookingsHtml(true)}</div></section>`;
}

function bookingsViewHtml(): string {
  const matches=filteredBookings();
  const totals=bookingTotals(matches);
  const categoryOptions=state.categories.slice().sort((a,b)=>a.name.localeCompare(b.name,'de'));
  return `<section class="intro"><div><div class="eyebrow">Dein Haushaltsbuch</div><h1>Buchungen</h1></div><button class="btn primary" data-action="add-booking" ${!state.accounts.length?'disabled':''}>+ Neu</button></section>
    <section class="card"><div class="section-title"><h2>Verlauf</h2><span class="muted" id="booking-count">${totals.count} Buchungen</span></div>
    <div class="booking-quick-bar"><label class="field" for="booking-quick-search">Schnellsuche in allen Buchungen
      <input id="booking-quick-search" type="search" autocomplete="off" placeholder="Empfänger, Kategorie, Konto, Notiz, Betrag …" value="${esc(bookingQuery)}"></label></div>
    <details id="booking-advanced-filters" class="filter-disclosure" ${bookingFiltersOpen?'open':''}>
      <summary class="disclosure-toggle"><span><strong>Filter und Zeitraum</strong><small>Erweiterte Suche${bookingDateFrom||bookingDateTo||bookingCategoryFilter!=='all'||bookingTypeFilter!=='all'||bookingAccountFilter!=='all'?' · Filter aktiv':''}</small></span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary>
      <div class="disclosure-body"><div class="book-filters">
      <label class="field">Zeitraum<select id="period-filter" aria-label="Zeitraum">
        <option value="7" ${filter==='7'?'selected':''}>1 Woche</option>
        <option value="30" ${filter==='30'?'selected':''}>1 Monat (30 Tage)</option>
        <option value="90" ${filter==='90'?'selected':''}>3 Monate (90 Tage)</option>
        <option value="180" ${filter==='180'?'selected':''}>6 Monate (180 Tage)</option>
        <option value="all" ${filter==='all'?'selected':''}>Alle Buchungen</option></select></label>
      <label class="field">Buchungsart<select id="booking-type-filter"><option value="all">Alle Arten</option>
        <option value="expense" ${bookingTypeFilter==='expense'?'selected':''}>Ausgaben</option>
        <option value="income" ${bookingTypeFilter==='income'?'selected':''}>Einnahmen</option>
        <option value="transfer" ${bookingTypeFilter==='transfer'?'selected':''}>Umbuchungen</option></select></label>
      <label class="field">Konto<select id="booking-account-filter"><option value="all">Alle Konten</option>${state.accounts.map(a=>`<option value="${a.id}" ${bookingAccountFilter===String(a.id)?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field">Kategorie<select id="booking-category-filter"><option value="all">Alle Kategorien</option>${categoryOptions.map(c=>`<option value="${c.id}" ${bookingCategoryFilter===String(c.id)?'selected':''}>${esc(c.name)} (${c.kind==='income'?'Einnahme':'Ausgabe'})</option>`).join('')}</select></label>
      <label class="field">Ab Datum<input type="date" id="booking-date-from" value="${esc(bookingDateFrom)}"></label>
      <label class="field">Bis Datum<input type="date" id="booking-date-to" value="${esc(bookingDateTo)}"></label>
    </div><p class="muted small">Die Schnellsuche durchsucht standardmäßig den gesamten Bestand; Datumsfelder und weitere Filter schränken das Ergebnis ein.</p>
      <div class="btn-row no-print"><button class="btn secondary" data-action="reset-booking-filters">Filter zurücksetzen</button></div>
      ${bookingDateFrom&&bookingDateTo&&bookingDateFrom>bookingDateTo?'<div class="notice">Das Startdatum liegt hinter dem Enddatum. Bitte Filter korrigieren.</div>':''}
      </div>
    </details>
    <div class="server-list-toolbar"><label class="field">Sortieren<select id="local-list-sort">
      <option value="newest" ${readBookingList().sort==='newest'?'selected':''}>Datum: neueste zuerst</option>
      <option value="oldest" ${readBookingList().sort==='oldest'?'selected':''}>Datum: älteste zuerst</option>
      <option value="amount-desc" ${readBookingList().sort==='amount-desc'?'selected':''}>Betrag: höchste zuerst</option>
      <option value="amount-asc" ${readBookingList().sort==='amount-asc'?'selected':''}>Betrag: niedrigste zuerst</option>
      </select></label><span class="muted small">${readBookingList().pageSize} Buchungen je Anzeige</span></div>
    <div class="btn-row no-print"><button class="btn primary" id="export-bookings-csv" data-action="export-bookings-csv" ${!matches.length?'disabled':''}>Gefilterte Buchungen als CSV</button></div>
    <div id="bookings-summary">${bookingsSummaryHtml(matches)}</div>
    <div id="booking-results">${bookingsHtml()}</div></section>`;
}
function bookingsSummaryHtml(matches:readonly Booking[]):string {
  const t=bookingTotals(matches);
  return `<div class="mini-summary"><span><small>Einnahmen</small><strong class="income">+${formatEuro(t.incomeCents)}</strong></span>
    <span><small>Ausgaben</small><strong class="expense">−${formatEuro(t.expenseCents)}</strong></span>
    <span><small>Saldo</small><strong>${formatEuro(t.incomeCents-t.expenseCents)}</strong></span>
    <span class="mini-transfer">${formatEuro(t.transferCents)} Umbuchungen (separat)</span></div>`;
}
function updateBookingResults(): void {
  const root = document.querySelector('#booking-results');
  if (!root) return;
  const matches=filteredBookings();
  root.innerHTML = `${matches.slice(0,visibleBookingCount).map(bookingListItem).join('')||'<div class="empty">Keine passenden Buchungen vorhanden.</div>'}${matches.length>visibleBookingCount?`<div class="bookings-more"><span>${visibleBookingCount} von ${matches.length} Buchungen</span><button class="btn secondary" data-action="more-bookings">Weitere ${readBookingList().pageSize} laden</button></div>`:''}`;
  const count = document.querySelector('#booking-count');
  if (count) count.textContent = `${matches.length} Buchungen`;
  const summary=document.querySelector('#bookings-summary');
  if(summary)summary.innerHTML=bookingsSummaryHtml(matches);
  const exportButton=document.querySelector<HTMLButtonElement>('[data-action="export-bookings-csv"]');
  if(exportButton)exportButton.disabled=matches.length===0;
}
function previousMonth(ym:string):string {return monthOffset(ym,-1);}
function monthName(ym:string):string{
  return new Date(`${ym}-15T12:00:00`).toLocaleDateString('de-DE',{month:'long',year:'numeric'});
}
function reportMonthHtml(ym:string):string {
  const all=state.bookings.filter(b=>b.date.startsWith(ym)&&(reportAccountFilter==='all'||b.accountId===Number(reportAccountFilter)||(b.type==='transfer'&&b.otherAccountId===Number(reportAccountFilter))));
  const income=all.filter(b=>b.type==='income').reduce((n,b)=>n+b.amountCents,0);
  const expense=all.filter(b=>b.type==='expense').reduce((n,b)=>n+b.amountCents,0);
  const grouped=new Map<number,number>();
  for(const b of all.filter(b=>b.type==='expense')) grouped.set(b.categoryId!, (grouped.get(b.categoryId!)??0)+b.amountCents);
  const rows=[...grouped].sort((a,b)=>b[1]-a[1]);
  const maxCategory=Math.max(1,...rows.map(r=>r[1]));
  const incomes=new Map<number,number>();
  for(const b of all.filter(b=>b.type==='income')) incomes.set(b.categoryId!, (incomes.get(b.categoryId!)??0)+b.amountCents);
  return `<div class="report-month"><h2>${esc(monthName(ym))}</h2>
    <div class="report-metrics"><div><span>Einnahmen</span><strong class="income">+${formatEuro(income)}</strong></div>
    <div><span>Ausgaben</span><strong class="expense">−${formatEuro(expense)}</strong></div>
    <div class="report-net"><span>Saldo</span><strong class="${income-expense<0?'expense':'income'}">${formatEuro(income-expense)}</strong></div></div>
    <h3>Ausgaben nach Kategorien</h3>
    ${rows.length ? rows.map(([id,value])=>`<div class="report-category"><div class="report-line"><span>${esc(getCategory(id))}</span><strong>${formatEuro(value)}</strong></div><div class="report-meter" aria-label="Anteil an den Ausgaben"><span style="width:${Math.max(1,Math.round(value/maxCategory*100))}%"></span></div></div>`).join('') : '<p class="muted small">Keine Ausgaben</p>'}
    <h3>Einnahmen nach Kategorien</h3>
    ${incomes.size?[...incomes].sort((a,b)=>b[1]-a[1]).map(([id,value])=>`<div class="report-line"><span>${esc(getCategory(id))}</span><strong>${formatEuro(value)}</strong></div>`).join(''):'<p class="muted small">Keine Einnahmen</p>'}
    <p class="muted small">${all.length} Buchungen im Monat, davon ${all.filter(b=>b.type==='transfer').length} Umbuchungen (nicht als Einnahme/Ausgabe gezählt)</p>
  </div>`;
}
function reportsHtml():string {
  const reportRows=state.bookings.filter(b=>reportAccountFilter==='all'||b.accountId===Number(reportAccountFilter)||(b.type==='transfer'&&b.otherAccountId===Number(reportAccountFilter)));
  const trend=monthlyTrend(reportRows,reportMonth);
  const max=Math.max(1,...trend.map(r=>r.incomeCents+r.expenseCents));
  return `<section class="intro"><div><div class="eyebrow">Monatliche Auswertung</div><h1>Monatsbericht</h1></div><button class="btn secondary no-print" data-action="print-report">Drucken</button></section>
    <section class="card no-print"><div class="report-toolbar"><button class="btn secondary" data-action="previous-report-month" aria-label="Vormonat">‹</button>
      <label class="field">Monat auswählen<input id="report-month" type="month" value="${esc(reportMonth)}"></label>
      <button class="btn secondary" data-action="next-report-month" aria-label="Folgemonat">›</button></div>
      <label class="field">Kontofilter<select id="report-account-filter"><option value="all">Alle Konten</option>${state.accounts.map(a=>`<option value="${a.id}" ${reportAccountFilter===String(a.id)?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
      <p class="muted small">Vergleich mit dem Vormonat und Verlauf der letzten zwölf Monate. Umbuchungen werden separat gezählt, aber nicht als Einnahmen oder Ausgaben.</p></section>
    <section class="card"><div class="section-title"><h2>Haushaltsauswertung</h2><span class="muted">2 Monate</span></div><div class="report-grid">${reportMonthHtml(reportMonth)}${reportMonthHtml(previousMonth(reportMonth))}</div></section>
    <section class="card"><div class="section-title"><h2>Verlauf</h2><span class="muted">12 Monate bis ${esc(monthName(reportMonth))}</span></div>
      <div class="trend-legend"><span class="trend-income-mark">Einnahmen</span><span class="trend-expense-mark">Ausgaben</span></div>
      <div class="trend-list">${trend.map(t=>`<div class="trend-row"><span>${esc(monthName(t.month))}</span><div class="trend-bars">
         ${t.incomeCents>0?`<i class="trend-income" style="width:${Math.round(t.incomeCents/max*100)}%"></i>`:''}${t.expenseCents>0?`<i class="trend-expense" style="width:${Math.round(t.expenseCents/max*100)}%"></i>`:''}</div>
         <strong class="${t.incomeCents-t.expenseCents<0?'expense':'income'}">${formatEuro(t.incomeCents-t.expenseCents)}</strong></div>`).join('')}</div>
      <p class="muted small">Der Jahresverlauf enthält auch Monate ohne Buchungen. Die Beträge sind lokal berechnet.</p></section>`;
}
const frequencyName=(v:Frequency)=>({daily:'Täglich',weekly:'Wöchentlich',monthly:'Monatlich',yearly:'Jährlich'}[v]);
function recurringHtml():string{
  const ordered=[...state.recurringRules].sort((a,b)=>Number(b.active)-Number(a.active)||a.nextOn.localeCompare(b.nextOn));
  const inactive=ordered.filter(r=>!r.active).length;
  return `<section class="intro"><div><div class="eyebrow">Geplante Buchungen</div><h1>Wiederkehrend</h1></div><button class="btn primary" data-action="add-recurring" ${!state.accounts.length?'disabled':''}>+ Regel</button></section>
    <section class="card"><div class="section-title"><h2>Regeln (${ordered.length})</h2><button class="btn secondary" data-action="run-due">Fällige ausführen</button></div>
    <p class="muted small">${inactive?inactive+' inaktive Regel(n), darunter möglicherweise importierte Financisto-Vorlagen. Diese werden erst nach manueller Prüfung und Aktivierung ausgeführt. ':''}Fällige aktive Einträge werden beim Öffnen/Fortsetzen der App nachgeholt; bei geschlossener App erfolgt keine Buchung um Mitternacht.</p>
    ${ordered.length?ordered.map(r=>`<div class="settings-line"><div class="setting-details"><strong>${esc(r.title)} ${r.active?'':'(inaktiv)'}</strong>
      <span>${esc(kindName(r.type))} · ${formatEuro(r.amountCents)} · ${frequencyName(r.frequency)}${r.interval>1?' alle '+r.interval:''}</span>
      <span>${r.active?'Nächste Fälligkeit':'Vorgemerkt (inaktiv)'}: ${friendlyDate(r.nextOn)} · ${r.runs} ausgeführt</span></div>
      <button class="btn secondary settings-edit" data-action="edit-recurring" data-id="${r.id}">Bearbeiten</button></div>`).join('') : '<div class="empty">Noch keine wiederkehrenden Regeln vorhanden.</div>'}</section>`;
}
/** Searchable category selection shared by one-off and recurring bookings. */
function categoryPickerHtml(prefix:'book'|'rule', kind:CategoryKind, selectedId?:number|null):string {
  const cat=state.categories.find(c=>c.id===selectedId && c.kind===kind);
  return `<div class="field category-field" data-category-kind="${kind}"><label for="${prefix}-category-search">Kategorie</label>
    <div class="category-picker"><input id="${prefix}-category-search" class="category-query" type="search" maxlength="100" placeholder="Kategorie suchen oder neu anlegen" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${prefix}-category-menu" value="${esc(cat?.name??'')}">
    <input type="hidden" id="${prefix}-category" value="${cat?.id??''}">
    <div id="${prefix}-category-menu" class="category-menu" role="listbox" hidden></div></div>
    <span class="field-help">Auswählen oder Namen eingeben und „Neue Kategorie anlegen“ wählen.</span></div>`;
}
function recurringTypeFields(type:BookingType,selectedCategory?:number|null,selectedAccount?:number|null):string {
  return type==='transfer'?`<label class="field">Zielkonto<select id="rule-other"><option value="">Bitte wählen</option>${state.accounts.map(a=>option(a.id,a.name,selectedAccount)).join('')}</select></label>`:
    categoryPickerHtml('rule',type,selectedCategory);
}
function payeePickerHtml(prefix:'book'|'rule', selectedId?:number|null):string {
  const inputId=`${prefix}-payee`;
  return `<div class="field payee-field"><label for="${inputId}">Empfänger / Zahler (optional)</label><div class="payee-picker"><input id="${inputId}" maxlength="100" value="${esc(getPayee(selectedId??null))}" placeholder="Suchen oder neuen Namen eintragen" autocomplete="off" aria-autocomplete="list" aria-controls="${prefix}-known-payees-menu"><div id="${prefix}-known-payees-menu" role="listbox" class="payee-menu" hidden></div></div></div>`;
}
function setupPayeePicker(dlg:HTMLDialogElement,prefix:'book'|'rule'):void {
  const payee=dlg.querySelector<HTMLInputElement>(`#${prefix}-payee`);
  const menu=dlg.querySelector<HTMLDivElement>(`#${prefix}-known-payees-menu`);
  if(!payee||!menu)return;
  const picker=attachDialogSuggestions(dlg,payee,menu);
  const usage=lastPayeeUsage(state.bookings);
  const populate=(showAll=false)=>{
    const matches=rankSuggestions(state.payees,showAll?'':payee.value,8,usage);
    menu.innerHTML=matches.map(p=>`<button type="button" role="option" class="payee-suggestion" data-payee-id="${p.id}">${esc(p.name)}</button>`).join('');
    picker.open();
  };
  let modified=false;
  payee.addEventListener('focus',()=>{modified=false;if(payee.value)payee.select();populate(true);});
  payee.addEventListener('click',()=>{if(!modified&&payee.value)payee.select();populate(true);});
  payee.addEventListener('input',()=>{modified=true;populate();});
  payee.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!menu.hidden){e.preventDefault();picker.close();}
    if(e.key==='Enter'&&!menu.hidden){e.preventDefault();menu.querySelector<HTMLButtonElement>('[data-payee-id]')?.click();}
  });
  menu.addEventListener('click',e=>{
    const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-payee-id]');
    if(!button)return;
    const p=state.payees.find(x=>x.id===Number(button.dataset.payeeId));
    if(p){payee.value=p.name;modified=false;picker.close();payee.focus({preventScroll:true});}
  });
}
function setupCategoryPicker(dlg:HTMLDialogElement,prefix:'book'|'rule'):void {
  const input=dlg.querySelector<HTMLInputElement>(`#${prefix}-category-search`);
  const selected=dlg.querySelector<HTMLInputElement>(`#${prefix}-category`);
  const menu=dlg.querySelector<HTMLDivElement>(`#${prefix}-category-menu`);
  if(!input||!selected||!menu)return;
  const kind=input.closest<HTMLElement>('[data-category-kind]')?.dataset.categoryKind as CategoryKind;
  const usage=new Map<number,number>();
  for(const b of state.bookings)if(b.categoryId!==null)usage.set(b.categoryId,(usage.get(b.categoryId)??0)+1);
  const picker=attachDialogSuggestions(dlg,input,menu);
  let focusedIndex=-1;
  const close=()=>{picker.close();focusedIndex=-1;};
  const populate=(showAll=false)=>{
    const query=input.value.trim();
    const suggestions=categorySuggestions(state.categories,kind,showAll?'':query,usage,8);
    const exact=state.categories.some(c=>c.kind===kind&&c.name.toLocaleLowerCase('de')===query.toLocaleLowerCase('de'));
    menu.innerHTML=suggestions.map(c=>`<button type="button" role="option" class="category-suggestion" data-category-id="${c.id}">${esc(c.name)}<small>${usage.get(c.id)??0} Buchungen</small></button>`).join('')+
      (query.length>0&&query.length<=100&&!exact?`<button type="button" class="category-suggestion category-create" data-category-create="1">+ Neue Kategorie „${esc(query)}“ anlegen</button>`:'');
    picker.open();focusedIndex=-1;
  };
  const choose=(id:number)=>{
    const c=state.categories.find(x=>x.id===id&&x.kind===kind);
    if(!c)return;
    selected.value=String(c.id);input.value=c.name;input.focus();close();
  };
  let modified=false;
  input.addEventListener('focus',()=>{modified=false;if(selected.value&&input.value)input.select();populate(true);});
  input.addEventListener('click',()=>{if(!modified&&selected.value&&input.value)input.select();populate(true);});
  input.addEventListener('input',()=>{modified=true;selected.value='';populate();});
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!menu.hidden){e.stopPropagation();e.preventDefault();close();}return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();if(menu.hidden)populate();
      const buttons=Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
      if(!buttons.length)return;
      focusedIndex=(focusedIndex+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[focusedIndex]?.focus();
    }else if(e.key==='Enter'&&!menu.hidden){
      const exact=state.categories.find(c=>c.kind===kind&&c.name.toLocaleLowerCase('de')===input.value.trim().toLocaleLowerCase('de'));
      if(exact){e.preventDefault();choose(exact.id);}
    }
  });
  menu.addEventListener('keydown',e=>{
    const buttons=Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
    const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(e.key==='Escape'){e.preventDefault();close();input.focus();}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();buttons[(current+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
    }
  });
  menu.addEventListener('click',async e=>{
    const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if(!button)return;
    if(button.dataset.categoryId){choose(Number(button.dataset.categoryId));return;}
    if(button.dataset.categoryCreate){
      button.disabled=true;
      try{
        const name=input.value.trim();
        if(!name)throw new Error('Bitte einen Kategorienamen eingeben.');
        // This explicitly creates a category even if the enclosing booking is later cancelled.
        await storage.addCategory(name,kind);
        state=await storage.read();scheduleSnapshotStaging();
        const created=state.categories.find(c=>c.kind===kind&&c.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'));
        if(!created)throw new Error('Kategorie wurde nicht gefunden.');
        choose(created.id);
        const err=dlg.querySelector<HTMLElement>('#dialog-error');if(err)err.textContent='';
      }catch(error){const err=dlg.querySelector<HTMLElement>('#dialog-error');if(err){err.className='error';err.textContent=String(error);}}finally{button.disabled=false;}
    }
  });
  dlg.addEventListener('click',e=>{if(!(e.target as HTMLElement).closest('.category-picker'))close();});
}

function ruleDialog(rule?:RecurringRule):void {
  if(!state.accounts.length){addAccount();return;}
  const type=rule?.type??'expense';
  const fields=`<label class="field">Bezeichnung<input id="rule-title" maxlength="100" required value="${esc(rule?.title??'')}" placeholder="z. B. Miete"></label>
    <div class="form-grid"><label class="field">Art<select id="rule-type"><option value="expense" ${type==='expense'?'selected':''}>Ausgabe</option><option value="income" ${type==='income'?'selected':''}>Einnahme</option><option value="transfer" ${type==='transfer'?'selected':''}>Umbuchung</option></select></label>
    <label class="field">Betrag in €<input id="rule-amount" required inputmode="decimal" value="${rule?moneyInput(rule.amountCents):''}" placeholder="0,00"></label></div>
    <div class="form-grid"><label class="field">Konto<select id="rule-account">${state.accounts.map(a=>option(a.id,a.name,rule?.accountId??defaultAccountId())).join('')}</select></label><div id="rule-second">${recurringTypeFields(type,rule?.categoryId,rule?.otherAccountId)}</div></div>
    ${payeePickerHtml('rule',rule?.payeeId)}
    <label class="field">Notiz<textarea id="rule-note" maxlength="1000">${esc(rule?.note??'')}</textarea></label>
    <div class="form-grid"><label class="field">Rhythmus<select id="rule-frequency">${(['daily','weekly','monthly','yearly'] as Frequency[]).map(f=>`<option value="${f}" ${f===(rule?.frequency??'monthly')?'selected':''}>${frequencyName(f)}</option>`).join('')}</select></label>
    <label class="field">Alle ... Intervalle<input id="rule-interval" type="number" min="1" max="120" step="1" value="${rule?.interval??1}"></label></div>
    <div class="form-grid"><label class="field">Startdatum<input type="date" id="rule-start" value="${rule?.startOn??today()}" required></label>
    <label class="field">Enddatum (optional)<input type="date" id="rule-end" value="${rule?.endOn??''}"></label></div>
    <label class="field">Maximale Anzahl Buchungen (optional)<input type="number" id="rule-limit" min="1" max="100000" value="${rule?.maxRuns??''}" placeholder="Ohne Begrenzung"></label>
    <label class="checkline"><input type="checkbox" id="rule-active" ${rule?.active!==false?'checked':''}> Regel aktiv</label>
    ${rule?'<p class="notice">Änderungen betreffen zukünftige Fälligkeiten. Bereits erzeugte Einträge bleiben erhalten.</p>':''}
    ${rule?.title.startsWith('Financisto #')?'<p class="warning">Importierte Vorlage: Alle Angaben, besonders Rhythmus, Betrag und nächsten Termin prüfen, bevor du sie aktivierst. Frühere Termine werden nicht automatisch importiert.</p>':''}`;
  showDialog(rule?'Regel bearbeiten':'Regel anlegen',fields,async()=>{
    const kind=txt('rule-type') as BookingType;
    const otherId=kind==='transfer'?Number(txt('rule-other'))||null:null;
    const categoryId=kind==='transfer'?null:Number(txt('rule-category'))||null;
    const startOn=txt('rule-start');
    const input:RecurringInput={title:txt('rule-title').trim(),type:kind,
      accountId:Number(txt('rule-account')),otherAccountId:otherId,categoryId,
      payeeId:null,amountCents:parseEuro(txt('rule-amount')),
      note:txt('rule-note').trim(),frequency:txt('rule-frequency') as Frequency,
      interval:Number(txt('rule-interval')),startOn,dayOfMonth:Number(startOn.slice(-2)),
      endOn:txt('rule-end')||null,maxRuns:txt('rule-limit')?Number(txt('rule-limit')):null,
      active:(document.getElementById('rule-active') as HTMLInputElement).checked};
    // Validate before creating a new payee, so incomplete rules leave no orphan payees.
    checkRecurring(input,state);
    const payeeName=txt('rule-payee').trim();
    if(payeeName)input.payeeId=await storage.addPayee(payeeName);
    await storage.saveRecurring(input,rule?.id);
  },'Speichern',rule?'<button type="button" class="btn danger" id="remove-recurring">Löschen</button>':'');
  const dlg=document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
  setupCategoryPicker(dlg,'rule');
  setupPayeePicker(dlg,'rule');
  dlg.querySelector('#rule-type')?.addEventListener('change',()=>{
    const kind=txt('rule-type') as BookingType;
    dlg.querySelector('#rule-second')!.innerHTML=recurringTypeFields(kind);
    setupCategoryPicker(dlg,'rule');
  });
  if(rule) dlg.querySelector('#remove-recurring')?.addEventListener('click',async()=>{
    if(!window.confirm('Regel löschen? Bereits erzeugte Buchungen bleiben erhalten.'))return;
    try{await storage.removeRecurring(rule.id);dlg.close();state=await storage.read();scheduleSnapshotStaging();render();}
    catch(e){const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=String(e);}
  });
}
let dueInProgress=false;
async function runDue():Promise<void>{
  if(dueInProgress)return;
  dueInProgress=true;
  try{
    const count=await storage.runDue(today());
    // Do not transfer 15,000+ bookings across the native bridge again when no
    // recurring entries were generated. This is the common startup path.
    if(!count)return;
    state=await storage.read();
    scheduleSnapshotStaging();
    message=`${count} fällige Buchung${count===1?'':'en'} nachgeholt.`;
    render();
  }finally{dueInProgress=false;}
}
/** Every audit stays local; an exported report is a user-controlled file download. */
async function downloadText(content:string,name:string,mime:string):Promise<void> {
  await exportUserText(content,name,mime);
}
function getAudit():ImportReport {
  const saved=state.importReports.find(r=>r.id===auditChoice);
  if(saved)return saved;
  if(inventoryCacheSnapshot!==state || !inventoryCacheReport){
    inventoryCacheSnapshot=state;inventoryCacheReport=inventoryReport(state);
  }
  return inventoryCacheReport;
}
const sumGaps=(items:ImportGap[]):number=>items.reduce((n,g)=>n+g.bookingIds.length,0);
function importAuditsHtml():string {
  const reports=[...state.importReports].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const report=getAudit();
  const gaps=report.payeeGaps;
  const query=auditQuery.trim();
  const filtered=query?gaps.filter(g=>String(g.id).includes(query)||g.bookingIds.some(id=>String(id).includes(query))):gaps;
  const shown=filtered.slice(0,auditRowsVisible);
  const status=report.kind==='inventory'?'Bestandsanalyse (kein Originalprotokoll)':report.kind==='analysis'?'Dateianalyse – nicht importiert':'Abgeschlossener Import';
  return `<section class="intro"><div><div class="eyebrow">Lokale Prüfberichte</div><h1>Importprotokolle</h1><div class="muted small">Verbleiben auf diesem Gerät. Export nur bei Bedarf.</div></div>
    <button class="btn secondary" data-action="go-settings">Zurück</button></section>
    <section class="card"><div class="section-title"><h2>Bericht auswählen</h2></div>
      <label class="field">Gespeicherter Bericht oder aktuelle Bestandsanalyse<select id="audit-choice"><option value="inventory" ${auditChoice==='inventory'?'selected':''}>Aktueller Datenbestand (rekonstruiert)</option>
      ${reports.map(r=>`<option value="${esc(r.id)}" ${auditChoice===r.id?'selected':''}>${esc(new Date(r.createdAt).toLocaleString('de-DE'))} · ${r.kind==='import'?'Import':r.kind==='analysis'?'Analyse':'Bestandsanalyse'} · ${esc(r.sourceFile??'ohne Quelldatei')}</option>`).join('')}</select></label>
      <div class="audit-meta"><strong>${esc(status)}</strong><span>${esc(report.sourceFile??'Kein Originaldateiname verfügbar')} · ${esc(new Date(report.createdAt).toLocaleString('de-DE'))}</span></div>
      <div class="audit-stats">
      <div><strong>${report.counts.bookings.toLocaleString('de-DE')}</strong><span>Buchungen</span></div>
      <div><strong>${gaps.length.toLocaleString('de-DE')}</strong><span>Fehlende Empfänger-IDs</span></div>
      <div><strong>${sumGaps(gaps).toLocaleString('de-DE')}</strong><span>Betroffene Buchungen</span></div>
      <div><strong>${report.counts.importedTemplates===null?'–':report.counts.importedTemplates}</strong><span>Übernommene Regeln</span></div></div>
      <div class="btn-row"><button class="btn secondary" data-action="export-audit-csv">Empfänger-CSV herunterladen</button>
      <button class="btn secondary" data-action="export-audit-json">Vollständigen Bericht (JSON)</button>
      ${report.kind==='inventory'?'<button class="btn primary" data-action="save-inventory">Bestandsanalyse dauerhaft speichern</button>':''}</div>
      ${report.kind==='inventory'?'<p class="notice">Dieser Bericht wird aus dem aktuellen Buchungsbestand ermittelt. Er ersetzt kein Original-Importprotokoll: Umbenannte Platzhalter, ursprünglicher Dateiname und übersprungene Vorlagen können nicht rekonstruiert werden. Über „Bestandsanalyse dauerhaft speichern“ wird der aktuelle Stand zusätzlich gesichert.</p>':''}
    </section>
    <section class="card"><div class="section-title"><h2>Fehlende Empfänger – vollständige ID-Liste</h2><span class="muted">${gaps.length} IDs</span></div>
      <p class="muted small">Eine ID kann in vielen Buchungen vorkommen. Die Zählung der Vorlagen ist getrennt. IDs bleiben unverändert; Namen werden nicht geraten.</p>
      <label class="field">Empfänger-ID oder Buchungs-ID suchen<input id="audit-search" type="search" autocomplete="off" value="${esc(auditQuery)}" placeholder="z. B. 32 oder 2112"></label>
      <div id="audit-rows">${auditRowsHtml(shown,filtered.length)}</div>
    </section>
    <section class="card"><details class="audit-list"><summary><strong>Weitere Importdetails</strong> – Nullbuchungen, Vorlagen, Kategorien und Kontostände</summary>
      <p><strong>Nullbuchungen:</strong> ${report.zeroBookingIds.length} ${report.zeroBookingIds.length?'· IDs '+esc(report.zeroBookingIds.join(', ')):''}</p>
      <p><strong>Nicht übernommene Vorlagen:</strong> ${report.counts.skippedTemplates??'nicht rekonstruierbar'} ${report.unsupportedTemplateIds.length?'· IDs '+esc(report.unsupportedTemplateIds.join(', ')):''}</p>
      <p><strong>Fehlende Kategorien:</strong> ${report.categoryGaps.length} · ${sumGaps(report.categoryGaps)} betroffene Buchungen</p>
      ${report.categoryGaps.length?`<div class="audit-rows">${report.categoryGaps.map(g=>`<div><span>Kategorie-ID ${g.id}</span><span>${g.bookingIds.length} Buchungen, ${g.templateIds.length} Vorlagen</span></div>`).join('')}</div>`:''}
      ${report.accountChecks.length?`<h3>Kontostandsabgleich mit Quelldatei</h3><div class="audit-rows">${report.accountChecks.map(a=>`<div><span>${esc(a.name)}</span><span>${formatEuro(a.actualCents)} · Differenz ${formatEuro(a.differenceCents)}</span></div>`).join('')}</div>`:'<p class="muted small">Kein ursprünglicher Kontostandsabgleich gespeichert.</p>'}
      ${report.notes.map(n=>`<p class="muted small">${esc(n)}</p>`).join('')}
    </details></section>`;
}
function auditRowsHtml(items:ImportGap[],total:number):string {
  return `<div class="audit-rows audit-gap-list">${items.map(g=>`<details class="audit-gap"><summary><strong>ID ${g.id}</strong><span>${g.bookingIds.length} Buchungen · ${g.templateIds.length} Vorlagen</span></summary>
    <div class="audit-gap-detail">${g.bookingIds.length?`Buchungs-IDs: ${esc(g.bookingIds.join(', '))}`:'Keine betroffene normale Buchung'}${g.templateIds.length?`<p>Vorlagen-IDs: ${esc(g.templateIds.join(', '))}</p>`:''}</div></details>`).join('')||'<p class="muted small">Keine passenden Platzhalter-IDs vorhanden.</p>'}</div>
    ${items.length<total?`<div class="bookings-more"><span>${items.length} von ${total} IDs</span><button class="btn secondary" data-action="more-audit-rows">Weitere 80 anzeigen</button></div>`:''}`;
}
function refreshAuditRows():void{
  const target=document.querySelector('#audit-rows');if(!target)return;
  const gaps=getAudit().payeeGaps;
  const query=auditQuery.trim();
  const filtered=query?gaps.filter(g=>String(g.id).includes(query)||g.bookingIds.some(id=>String(id).includes(query))):gaps;
  target.innerHTML=auditRowsHtml(filtered.slice(0,auditRowsVisible),filtered.length);
}
async function importLegacyFile(file:File):Promise<void>{
  const conversion=await importFinancistoFile(file);
  const {snapshot,notes,skippedTemplates,importedTemplates,accountChecks,missingPayeeIds,affectedPayeeBookings}=conversion;
  const matchingExisting=accountChecks.filter(a=>state.accounts.some(old=>old.id===a.id&&old.name===a.name));
  const missingReferences=notes.filter(n=>n.startsWith('Hinweis:'));
  const informationalNotes=notes.filter(n=>!n.startsWith('Hinweis:'));
  const html=`<div class="restore-summary"><p><strong>Financisto-Backup:</strong> ${esc(file.name)}</p>
    <p><strong>Importierbar:</strong> ${snapshot.accounts.length} Konten, ${snapshot.categories.length} Kategorien, ${snapshot.bookings.length} Buchungen, ${snapshot.payees.length} Empfänger.</p>
    <p><strong>Empfänger-Lücken:</strong> ${missingPayeeIds} fehlende IDs in ${affectedPayeeBookings} Buchungen. Diese Empfänger könnten früher gelöscht worden sein. Buchungen und Original-IDs bleiben bestehen.</p>
    <p class="muted small">Ein vollständiges Protokoll mit allen IDs, Buchungszahlen und Kontoständen kann ohne Import gespeichert werden.</p>
    <button type="button" class="btn secondary" id="save-only-audit">Nur Analyse speichern (keine Daten ersetzen)</button>
    <p><strong>Wiederkehrende Vorlagen:</strong> ${importedTemplates} sicher erkannt und <strong>deaktiviert</strong> übernommen; ${skippedTemplates} mangels eindeutigem Format nicht übernommen.</p>
    <details class="audit-list"><summary><strong>Kontostandsabgleich: ${accountChecks.every(a=>a.differenceCents===0)?'alle '+accountChecks.length+' Konten rechnerisch korrekt':'Abweichungen entdeckt'}</strong> – Einzelwerte anzeigen</summary>
    <div class="audit-rows">${accountChecks.map(a=>`<div><span>${esc(a.name)}</span><span>${formatEuro(a.actualCents)} · Differenz ${formatEuro(a.differenceCents)}${state.accounts.some(old=>old.id===a.id&&old.name===a.name)?' · bisher: '+formatEuro(accountBalance(state,a.id)):''}</span></div>`).join('')}</div>
    <p class="muted small">Differenz: umgerechneter Offline-Saldo gegenüber Financisto-Kontostand aus dieser Datei. ${matchingExisting.length?'„Bisher“ zeigt die Salden bereits lokal vorhandener gleichnamiger Konten mit derselben ID.':''} Die Rückrechnung allein ist kein unabhängiger Nachweis der Richtigkeit: bitte die Zahlen zusätzlich in Financisto vergleichen.</p></details>
    <p>${esc(informationalNotes.join(' '))}</p>
    ${missingReferences.map(note=>`<p class="warning"><strong>Zu prüfen:</strong> ${esc(note)}</p>`).join('')}
    <p><strong>Nicht unterstützte Vorlagen:</strong> ${skippedTemplates}</p>
    <p class="muted small">Nullbuchungen (0,00 €) werden mitgeführt und verändern keine Kontostände. Bitte Warnungen und die Anzahl der Buchungen prüfen.</p>
    <p class="warning"><strong>Warnung:</strong> Dies ersetzt ${state.bookings.length} vorhandene Buchungen sowie alle Konten, Kategorien und wiederkehrenden Regeln. Nicht zusammenführen! Vorher JSON-Sicherung exportieren.</p></div>
    <label class="field">Zum Bestätigen <strong>IMPORTIEREN</strong> eingeben<input id="financisto-confirm" autocomplete="off" placeholder="IMPORTIEREN"></label>`;
  showDialog('Financisto-Importvorschau',html,async()=>{
    if(txt('financisto-confirm').trim()!=='IMPORTIEREN') throw new Error('Bitte IMPORTIEREN vollständig eingeben.');
    const importReport=fromLegacyConversion(conversion,file.name,'import');
    await storage.replaceAll({...snapshot,importReports:prependReport(state.importReports,importReport)});
    state=await storage.read();
    try{await syncNativeBackup();}catch(error){backupError=String(error);}
    bookingAccountFilter='all';expandedBookingId=null;visibleBookingCount=readBookingList().pageSize;
    message=`Financisto-Import: ${snapshot.bookings.length} Buchungen und ${snapshot.recurringRules.length} deaktivierte Vorlagen übernommen. Kontostände bitte mit Financisto vergleichen.`;
  },'Bestätigen & ersetzen');
  const dlg=document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
  dlg.querySelector('#save-only-audit')?.addEventListener('click',async()=>{
    const btn=dlg.querySelector<HTMLButtonElement>('#save-only-audit')!;btn.disabled=true;
    try{
      const report=fromLegacyConversion(conversion,file.name,'analysis');
      await storage.saveImportReport(report);
      state=await storage.read();scheduleSnapshotStaging();auditChoice=report.id;auditRowsVisible=80;auditQuery='';
      dlg.close();view='import-audits';message='Financisto-Datei geprüft, Protokoll gespeichert. Die Buchungen wurden nicht verändert.';render();
    }catch(e){const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=String(e);btn.disabled=false;}
  });
}


function payeeResultsHtml():string {
  const counts=new Map<number,number>();
  for(const b of state.bookings)if(b.payeeId!==null)counts.set(b.payeeId,(counts.get(b.payeeId)??0)+1);
  const needle=payeeQuery.trim().toLocaleLowerCase('de');
  const filtered=state.payees.filter(p=>p.name.toLocaleLowerCase('de').includes(needle)||String(p.id).includes(needle));
  return `${filtered.slice(0,visiblePayeeCount).map(p=>`<div class="settings-line"><div class="setting-details"><strong>${esc(p.name)}</strong><span>ID ${p.id} · ${counts.get(p.id)??0} Buchungen</span></div><button class="btn secondary settings-edit" data-action="edit-payee" data-id="${p.id}">Bearbeiten</button></div>`).join('')||'<div class="empty">Keine passenden Empfänger gefunden.</div>'}
    ${filtered.length>visiblePayeeCount?`<div class="bookings-more"><span>${visiblePayeeCount} von ${filtered.length} angezeigt</span><button class="btn secondary" data-action="more-payees">Weitere 60 anzeigen</button></div>`:''}`;
}
function updatePayeeResults():void {const area=document.querySelector('#payee-results');if(area)area.innerHTML=payeeResultsHtml();}
function categoryResultsHtml(counts:Map<number,number>):string {
  const filtered=filterManagedCategories(state.categories,categoryQuery,categoryKindFilter);
  return `${filtered.slice(0,visibleCategoryCount).map(c=>`<div class="settings-line"><div class="setting-details"><strong>${esc(c.name)}</strong><span>${c.kind==='income'?'Einnahme':'Ausgabe'} · ${counts.get(c.id)??0} Buchungen · ID ${c.id}</span></div><button class="btn secondary settings-edit" data-action="edit-category" data-id="${c.id}">Bearbeiten</button></div>`).join('')||'<div class="empty">Keine passenden Kategorien gefunden.</div>'}
    ${filtered.length>visibleCategoryCount?`<div class="bookings-more"><span>${visibleCategoryCount} von ${filtered.length} Kategorien</span><button class="btn secondary" data-action="more-categories">Weitere 60 anzeigen</button></div>`:''}`;
}
function updateCategoryResults():void {
  const counts=new Map<number,number>();
  for(const b of state.bookings)if(b.categoryId!==null)counts.set(b.categoryId,(counts.get(b.categoryId)??0)+1);
  const el=document.querySelector('#category-results');if(el)el.innerHTML=categoryResultsHtml(counts);
}

function applyTheme():void {
  const dark=state.settings.theme==='dark'||(state.settings.theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#192129':'#ffffff');
}
function dataCheckHtml():string {
  const result=inspectSnapshot(state,today());
  const warn=result.issues.filter(x=>x.kind==='warning').length;
  const overall=result.balances.reduce((total,b)=>total+b.cents,0);
  return `<section class="intro"><div><div class="eyebrow">Datensicherheit</div><h1>Lokale Datenprüfung</h1></div><button class="btn secondary" data-action="go-settings">Zurück</button></section>
    <section class="card"><h2>${warn?'Prüfung mit Hinweisen':'Prüfung ohne Referenzfehler'}</h2><p class="muted small">Alle Daten werden nur auf diesem Gerät gelesen. Es findet keine Veränderung und keine Verbindung zu einer Bank statt.</p>
    <div class="audit-stats"><div><strong>${result.totals.accounts}</strong><span>Konten</span></div><div><strong>${result.totals.categories}</strong><span>Kategorien</span></div>
    <div><strong>${result.totals.payees}</strong><span>Empfänger</span></div><div><strong>${result.totals.bookings}</strong><span>Buchungen</span></div></div>
    <p><strong>Gesamtbestand (berechnet): ${formatEuro(overall)}</strong></p>
    ${result.issues.map(v=>`<div class="inventory-issue ${v.kind}"><strong>${esc(v.title)}</strong><p>${esc(v.detail)}</p></div>`).join('')}
    <div class="btn-row"><button class="btn primary" data-action="export-data-check">Prüfbericht als TXT</button><button class="btn secondary" data-action="export-backup">JSON-Sicherung erstellen</button></div></section>
    <section class="card"><h2>Kontostände</h2>${result.balances.map(b=>`<div class="report-line"><span>${esc(b.name)}</span><strong>${formatEuro(b.cents)}</strong></div>`).join('')}</section>`;
}
/** Licensed source and attribution are shipped in the APK, so this page works offline. */
function licenseSettingsHtml():string {
  return `<section class="card" id="license-and-open-source"><div class="section-title"><h2>GPLv2 · Rechte & Pflichten</h2><button type="button" class="btn secondary" data-action="app-license" aria-label="Vollständigen GPLv2-Lizenztext und Rechtshinweise anzeigen">Volltext</button></div>
  <p class="copyright-notice"><strong>Copyright © 2026 René Fieler (RenFie)</strong><span>GPL-2.0-only</span></p>
  <p class="muted small">FieLanzen Offline steht unter der <strong>GNU General Public License Version 2 (GPL-2.0-only)</strong>. Die wichtigsten Bestimmungen sind unmittelbar hier nachlesbar:</p>
  <div class="gpl-quick-summary">
    <div><strong>Deine Rechte</strong><p>Frei nutzen, Quellcode einsehen, eigene Änderungen vornehmen und das Programm weitergeben – auch kommerziell.</p></div>
    <div><strong>Deine Pflichten bei Weitergabe</strong><p>Lizenz- und Copyright-Hinweise erhalten, Änderungen kennzeichnen, GPLv2-Bedingungen einhalten und bei Binärweitergabe den korrespondierenden Quellcode gemäß § 3 bereitstellen.</p></div>
  </div>
  <p class="muted small">Rein private Änderungen musst du nicht veröffentlichen. Die Software wird ohne Gewährleistung bereitgestellt, soweit rechtlich zulässig. Der maßgebliche englische Volltext und die Hinweise zu Fremdsoftware sind <strong>offline</strong> über „Volltext“ erreichbar.</p></section>`;
}
function showLicenseDialog():void {
  const dlg=document.createElement('dialog');
  dlg.className='license-modal';
  dlg.setAttribute('aria-label','Lizenz und Open Source');
  dlg.innerHTML=`<div class="modal-head"><h2>Lizenz & Open Source</h2><button class="btn text close-license" type="button" aria-label="Schließen">✕</button></div>
    <div class="modal-body license-body"><p><strong>FieLanzen Offline ${esc(APP_VERSION)}</strong><br>Copyright © 2026 René Fieler (RenFie). Eigene Projektbestandteile: GNU GPL Version 2, ausschließlich (GPL-2.0-only).</p>
    <h3>Deine Rechte</h3><ul>
      <li>Das Programm für beliebige Zwecke ausführen.</li>
      <li>Den Quellcode lesen, untersuchen und verändern.</li>
      <li>Originale und veränderte Fassungen weitergeben, auch gegen Entgelt, unter den Lizenzbedingungen.</li>
      <li>Private Änderungen nur für dich verwenden, ohne sie veröffentlichen zu müssen (§§ 0, 2).</li>
    </ul><h3>Pflichten bei Weitergabe</h3><ul>
      <li>Bei Weitergabe Lizenz- und Urheberrechtshinweise erhalten; GPL-Version 2 beilegen. Bei geänderten Dateien die Änderungen und deren Datum kenntlich machen (§§ 1–2).</li>
      <li>Weitergegebene abgeleitete Gesamtwerke unter GPLv2 lizenzieren (§ 2). Bei Weitergabe einer Binärdatei den vollständigen korrespondierenden Quellcode bereitstellen oder eine der zulässigen Alternativen nach § 3 erfüllen.</li>
      <li>Empfängern die GPL-Rechte nicht durch zusätzliche Einschränkungen entziehen (§ 6). Keine Annahme, dass private Nutzung automatisch eine Quellcode-Veröffentlichung auslöst.</li>
    </ul>
    <p class="muted small"><strong>Keine Gewährleistung:</strong> Die GPLv2 sieht, soweit gesetzlich zulässig, keine Garantie vor. Diese deutschsprachige Übersicht ist unverbindlich; maßgeblich ist der vollständige englische Lizenztext.</p>
    <details class="audit-list license-full"><summary><strong>Vollständige GNU GPL Version 2 anzeigen</strong></summary><pre>${esc(gplText)}</pre></details>
    <details class="audit-list"><summary><strong>Projekt- und Fremdsoftwarehinweise (DE)</strong></summary><pre>${esc(noticeDe)}</pre></details>
    <details class="audit-list"><summary><strong>Project & third-party notices (EN)</strong></summary><pre>${esc(noticeEn)}</pre></details>
    <p class="muted small">Quellcode: <a href="https://github.com/renfie/fielanzen-android-offline" target="_blank" rel="noopener noreferrer">github.com/renfie/fielanzen-android-offline</a>. Dieser Link benötigt Internet; der vollständige GPL-Text oben nicht.</p>
    <div class="modal-actions"><button type="button" class="btn primary close-license">Schließen</button></div></div>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('.close-license').forEach(b=>b.addEventListener('click',()=>dlg.close()));
  dlg.addEventListener('close',()=>dlg.remove());
  dlg.showModal();
}

function settingsHtml(): string {
  const accountChoice=state.settings.defaultAccountId;
  const balances=calculateBalances(state,today());
  const categoryCounts=new Map<number,number>();
  for(const b of state.bookings)if(b.categoryId!==null)categoryCounts.set(b.categoryId,(categoryCounts.get(b.categoryId)??0)+1);
  return `<section class="intro"><div><div class="eyebrow">Lokale Verwaltung</div><h1>Einstellungen</h1></div></section>
    <section class="card"><div class="section-title"><h2><button type="button" class="manage-toggle" data-action="toggle-accounts" aria-expanded="${accountsOpen}" aria-controls="account-management"><span class="manage-chevron">⌄</span> Konten (${state.accounts.length})</button></h2><button class="btn text" data-action="add-account">+ Hinzufügen</button></div>
      <div id="account-management" ${accountsOpen?'':'hidden'}>
      ${state.accounts.map(a=>`<div class="settings-line"><div class="setting-details"><strong>${esc(a.name)}${accountChoice===a.id?' · ★ Standard':''}</strong><span>Anfangsbestand: ${formatEuro(a.openingCents)} · Aktuell: ${formatEuro(balances.get(a.id)??0)}</span></div><button class="btn secondary settings-edit" data-action="edit-account" data-id="${a.id}">Bearbeiten</button></div>`).join('') || '<div class="empty">Noch keine Konten</div>'}<div class="btn-row"><button class="btn secondary" data-action="reconcile-account">Kontostand abgleichen</button></div></div></section>
    <section class="card"><div class="section-title"><h2>Standardkonto</h2></div>
      <label class="field">Bei neuen Buchungen und Regeln vorausgewähltes Konto
      <select id="preferred-account"><option value="">Kein Standardkonto (erstes Konto verwenden)</option>${state.accounts.map(a=>option(a.id,a.name,accountChoice)).join('')}</select></label>
      <p class="muted small">Das Standardkonto wird lokal gespeichert und in die FieLanzen-JSON-Sicherung aufgenommen.</p></section>
    <section class="card"><div class="section-title"><h2><button type="button" class="manage-toggle" data-action="toggle-categories" aria-expanded="${categoriesOpen}" aria-controls="category-management"><span class="manage-chevron">⌄</span> Kategorien (${state.categories.length})</button></h2><button class="btn text" data-action="add-category">+ Hinzufügen</button></div>
      <div id="category-management" ${categoriesOpen?'':'hidden'}>
        <div class="category-manage-filters"><label class="field">Kategorie suchen<input id="category-search" type="search" value="${esc(categoryQuery)}" placeholder="Kategorie oder ID suchen" autocomplete="off"></label>
        <label class="field">Art<select id="category-kind-filter"><option value="all" ${categoryKindFilter==='all'?'selected':''}>Alle</option><option value="expense" ${categoryKindFilter==='expense'?'selected':''}>Ausgaben</option><option value="income" ${categoryKindFilter==='income'?'selected':''}>Einnahmen</option></select></label></div>
        <div id="category-results">${categoryResultsHtml(categoryCounts)}</div></div></section>
    <section class="card"><div class="section-title"><h2><button type="button" class="manage-toggle" data-action="toggle-payees" aria-expanded="${payeesOpen}" aria-controls="payee-management"><span class="manage-chevron">⌄</span> Empfänger / Zahler (${state.payees.length})</button></h2><button class="btn text" data-action="add-payee">+ Hinzufügen</button></div>
      <div id="payee-management" ${payeesOpen?'':'hidden'}><label class="field">Empfänger suchen<input id="payee-search" type="search" value="${esc(payeeQuery)}" placeholder="Name oder ursprüngliche ID suchen" autocomplete="off"></label>
      <div id="payee-results">${payeeResultsHtml()}</div></div></section>
    ${bookingListSettingsHtml(readBookingList())}
    ${appLockSettingsHtml()}
    ${licenseSettingsHtml()}
    <section class="card"><div class="section-title"><h2>Darstellung</h2></div>
      <label class="field">Farbschema<select id="preferred-theme">
        <option value="system" ${state.settings.theme==='system'?'selected':''}>Systemeinstellung (automatisch)</option>
        <option value="light" ${state.settings.theme==='light'?'selected':''}>Hell</option>
        <option value="dark" ${state.settings.theme==='dark'?'selected':''}>Dunkel</option>
      </select></label><p class="muted small">Bei „Systemeinstellung“ folgt FieLanzen dem Android- oder Browser-Farbschema.</p></section>
    <section class="card"><div class="section-title"><h2>Datenquelle</h2></div>
      <p><strong>AKTIVE DATENQUELLE: LOKAL – SQLite auf diesem Gerät.</strong></p>
      <p class="muted small">Neue Buchungen erscheinen nur lokal, bis du ausdrücklich den Servermodus aktivierst.</p>
      <p class="muted small">Optionaler Dashboard-Servermodus: vollständig getrennt von deiner lokalen Datenbank. Kein automatischer Upload, keine Synchronisierung und keine lokale Ausführung wiederkehrender Buchungen während des Serverbetriebs.</p>
      <label class="field">Dashboard-Server (HTTPS)<input type="url" id="dashboard-server-url" value="${esc(state.settings.dashboard?.url??'')}" placeholder="https://finance.example.de" autocomplete="url"></label>
      <label class="field">Geräte-API-Schlüssel (verschlüsselt im Android-Keystore)<input id="dashboard-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="fm1_…" ${runningNatively()?'':'disabled'}></label>
      <p class="muted small">Bei einem bereits gespeicherten Schlüssel für diese Adresse kannst du das Schlüsselfeld leer lassen.</p>
      <button type="button" class="btn primary" id="dashboard-connect-button" data-action="dashboard-connect" ${runningNatively()&&!dashboardConnecting?'':'disabled'}>${dashboardConnecting?'Verbindung wird geprüft …':'Verbinden'}</button>
      <p class="muted small" id="dashboard-probe-result" role="status" aria-live="polite">${esc(dashboardProbeResult)}</p>
      ${stagedDashboard?`<div class="connection-preview" role="region" aria-label="Serververbindung vor Aktivierung">
        <h3>Serververbindung erfolgreich – noch LOKAL</h3>
        <p>Server: <strong>${esc(stagedDashboard.server)}</strong></p>
        <p>${stagedDashboard.accounts.length} Serverkonten · ${stagedDashboard.first.items.length} Serverbuchungen (erste Seite) · Schreibrecht: ${stagedDashboard.session?.canWrite?'ja':'nein'}</p>
        <p><strong>Aktuell werden neue Buchungen weiterhin lokal gespeichert.</strong> Erst nach „Servermodus aktivieren“ arbeitet die App mit der Server-Datenquelle. Es werden keine lokalen Buchungen hochgeladen.</p>
        <div class="btn-row"><button type="button" class="btn primary" data-action="dashboard-activate-preview">Servermodus aktivieren</button><button type="button" class="btn secondary" data-action="dashboard-cancel-preview">Lokal bleiben</button></div>
      </div>`:''}
      <p class="muted small">FieLanzen prüft die API, meldet dich an und zeigt dir vor dem Aktivieren eine Servervorschau. Lokale Buchungen bleiben getrennt. Wenn der Proxy <strong>nachweislich</strong> ein Client-Zertifikat verlangt, erscheint automatisch die Android-Auswahl; andere Server benötigen keines.</p>
      <details class="audit-list" id="dashboard-advanced"><summary><strong>Erweiterte Verbindungseinstellungen</strong></summary>
        <p class="muted small">Nur bei Verbindungsproblemen: Wenn eine vorgeschaltete Firewall das Zertifikat verlangt, ohne eine erkennbare Fehlermeldung zu senden, kannst du es manuell auswählen. Der private Schlüssel bleibt im Android-KeyChain.</p>
        <div class="btn-row"><button type="button" class="btn secondary" data-action="dashboard-client-cert" ${runningNatively()?'':'disabled'}>Client-Zertifikat manuell auswählen</button><button type="button" class="btn secondary" data-action="dashboard-clear-cert" ${runningNatively()?'':'disabled'}>Zertifikatsfreigabe aufheben</button></div>
      </details>
    </section>
    <section class="card"><div class="section-title"><h2>Datensicherung</h2></div>
      <p class="muted small"><strong>Vollständige Financisto-Sicherung:</strong> Konten, Kategorien, Empfänger, alle Buchungen sowie alle ${state.recurringRules.length} vorhandenen wiederkehrenden Regeln werden bei jeder Sicherung automatisch exportiert. Es gibt keinen gesonderten Terminexport-Schalter.</p>
      <p class="muted small">Achtung: Financisto kann auch in FieLanzen deaktivierte Terminregeln nach einem Import aktivieren. Original-Financisto unterstützt nicht sämtliche FieLanzen-spezifischen Eigenschaften. Für eine vollständige verlustfreie FieLanzen-Wiederherstellung zusätzlich die JSON-Sicherung verwenden.</p>
      <div class="backup-status" id="auto-backup-status">${backupStatusHtml()}</div>
      <div class="btn-row"><button type="button" class="btn primary" data-action="auto-backup-now" ${runningNatively()?'':'disabled'}>Jetzt sichern</button><button type="button" class="btn secondary" data-action="choose-backup">Sicherung prüfen / wiederherstellen</button></div>
      <div class="btn-row"><button type="button" class="btn secondary" data-action="use-default-backup-folder" ${runningNatively()?'':'disabled'}>Downloads/FieLanzen als Ziel</button><button type="button" class="btn secondary" data-action="choose-auto-backup-folder" ${runningNatively()?'':'disabled'}>Anderen Ordner wählen</button></div>
      <details class="audit-list"><summary><strong>Diagnose und Ersatzweg bei Sicherungsfehler</strong></summary>
        <p class="muted small">Zeigt ausschließlich technische Angaben, keine Buchungen oder Kontodaten. Falls der native Android-Dienst ausfällt, kannst du dieselbe Financisto-kompatible Datei über den Android-Teilen-Dialog sichern (nur manuell).</p>
        <button type="button" class="btn secondary" data-action="backup-diagnostics">Diagnose anzeigen</button>
        <button type="button" class="btn secondary" data-action="backup-share-export">Backup über Android teilen</button>
        <pre id="backup-diagnostics-output" class="muted small" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>
      </details>
      <input type="file" id="backup-restore-input" class="hide" aria-label="FieLanzen-JSON, ältere FieLanzen-.backup oder Financisto-.backup wählen">
      <p class="muted small">Standardziel ist <strong>Downloads/FieLanzen</strong>. Ein Klick auf „Jetzt sichern“ erstellt dort unmittelbar eine Datei; eine Ordnerfreigabe ist nicht erforderlich. Der Ordner erscheint erst nach erfolgreichem Schreiben. Sicherungen sind unverschlüsselt und bleiben bei Deinstallation erhalten.</p>
      <label class="field auto-backup-check"><span><input type="checkbox" id="auto-backup-enabled" ${state.settings.autoBackup?.enabled?'checked':''} ${runningNatively()?'':'disabled'}> Automatische Sicherung aktivieren</span></label>
      <div class="auto-backup-options"><label class="field">Intervall<select id="auto-backup-frequency" ${runningNatively()?'':'disabled'}>
        <option value="daily" ${(state.settings.autoBackup?.frequency??'daily')==='daily'?'selected':''}>Täglich</option>
        <option value="weekly" ${state.settings.autoBackup?.frequency==='weekly'?'selected':''}>Wöchentlich</option>
        <option value="monthly" ${state.settings.autoBackup?.frequency==='monthly'?'selected':''}>Monatlich</option>
      </select></label><label class="field">Uhrzeit (lokal)<input id="auto-backup-time" type="time" value="${esc(state.settings.autoBackup?.time??'03:00')}" ${runningNatively()?'':'disabled'}></label><label class="field">Sicherungen aufbewahren (1–50)<input id="auto-backup-keep" type="number" min="1" max="50" step="1" value="${state.settings.autoBackup?.keep??7}" ${runningNatively()?'':'disabled'}></label></div>
      <div class="btn-row"><button type="button" class="btn primary" data-action="save-auto-backup-settings" ${runningNatively()?'':'disabled'}>Sicherungszeitplan speichern</button></div>
      <p class="muted small">${esc(backupSettingsMessage)}</p>
      <p class="muted small">Beim erstmaligen Aktivieren wird sofort eine Sicherung erstellt. Weitere Exporte werden ab der gewählten lokalen Uhrzeit eingeplant und können sich durch Android-Energiesparen verzögern. Ein erneuter App-Start holt fällige Exporte mit dem aktuellen Datenstand nach. Bei geschlossener App verwendet Android den zuletzt nach Datenänderungen vorbereiteten Stand. Für eine vollständige Sicherung von Regeln und Einstellungen weiterhin JSON verwenden. Für andere Zielverzeichnisse ist die gesonderte Android-Ordnerauswahl vorgesehen; Android erlaubt nicht die Freigabe des Download-Stammordners über diesen Dialog. Falls er nicht öffnet, bleibt „Jetzt sichern“ in Downloads verfügbar.</p>
      <details class="audit-list"><summary><strong>Erweitert: vollständige FieLanzen-Sicherung (JSON)</strong></summary>
        <p class="muted small">Financisto kennt keine FieLanzen-Regeln, Einstellungen und Importprotokolle. Nur die JSON-Sicherung enthält diese zusätzlich und stellt sie vollständig wieder her. Ältere FieLanzen-.backup-Dateien lassen sich über „Sicherung prüfen / wiederherstellen“ weiterhin öffnen.</p>
        <button type="button" class="btn secondary" data-action="export-backup">Vollständige JSON-Sicherung herunterladen</button>
      </details>
    </section>
    <section class="card"><div class="section-title"><h2>Importprotokolle und Empfänger-Lücken</h2><button class="btn secondary" data-action="go-import-audits">Anzeigen</button></div>
      <p class="muted small">Vollständige Empfänger-ID-Liste mit Anzahl der betroffenen Buchungen; durchsuchbar, als CSV exportierbar. Bereits mit Alpha 5 importierte Daten lassen sich ohne erneuten Import analysieren. Neue Analysen und Importe werden lokal protokolliert.</p>
      <p class="muted small">Gespeicherte Berichte: ${state.importReports.length}. Die letzten 10 bleiben auch in der JSON-Sicherung erhalten.</p></section>
    <section class="card"><div class="section-title"><h2>Lokale Datenprüfung</h2><button class="btn secondary" data-action="go-data-check">Prüfen</button></div>
      <p class="muted small">Kontostände und Datenreferenzen prüfen, Nullbuchungen, künftige Buchungen und Platzhalter zählen. Bericht als TXT exportierbar. Keine Datenänderungen.</p></section>
    <section class="card"><div class="section-title"><h2>App-Informationen</h2></div><div class="settings-line"><strong>Version</strong><span>${APP_VERSION}</span></div><div class="settings-line"><strong>Datenspeicherung</strong><span>${esc(storage.name)}</span></div><div class="settings-line"><strong>Serververbindung</strong><span>Optional (HTTPS-Mobile-API)</span></div></section>
    <div class="notice"><strong>Entwicklungsfassung:</strong> Bitte weiterhin nur Testdaten verwenden. JSON-Export und -Import sind für die Browser-Vorschau implementiert. Die Android-Dateiauswahl, Sicherung und Wiederherstellung wurden in Alpha 7 auf dem Gerät bestätigt. Vor jedem Update bitte eine JSON-Sicherung erstellen.</div>`;
}

/** The online view is intentionally isolated from the local Snapshot and Storage.
 * There is no implicit synchronization, fallback, offline write queue, or local CRUD.
 */
async function connectedServerClient():Promise<DashboardClient> {
  if(!serverMode)throw new Error('Servermodus ist nicht aktiviert.');
  const stored=await secureSession().getToken();
  if(!stored.token||normalizeDashboardUrl(stored.server)!==normalizeDashboardUrl(remote.server))
    throw new Error('Geräteschlüssel und Serveradresse stimmen nicht überein. Bitte lokal umschalten und neu anmelden.');
  return new DashboardClient(stored.server,stored.token);
}
async function loadRemoteServer(preservePages=false):Promise<void>{
  if(!serverMode||serverLoadBusy)return;
  serverLoadBusy=true;
  remote.loading=true;remote.error='';render();
  try{
    const secure=secureSession();
    remote.pending=parsePending((await secure.getPending()).json);
    const client=await connectedServerClient();
    if(!(await client.capabilities()))throw new Error('Dashboard-Mobile-API v1 ist nicht bestätigt.');
    const session=await client.session();
    remote.session=session; // Authenticated; a faulty booking row must not masquerade as bad credentials.
    const [accounts,categories,payees,first]=await Promise.all([client.accounts(),client.categories(),client.payees(),client.bookings()]);
    const pending=parsePending((await secure.getPending()).json);
    remote={...remote,session,accounts,categories,payees,bookings:first.items,nextBefore:first.nextBefore,pending,error:'',loading:false,visibleCount:readBookingList().pageSize,homeVisibleCount:readBookingList().pageSize,expandedBookingId:null};
    if(!accounts.some(a=>a.currency===remote.reportCurrencyFilter))
      remote.reportCurrencyFilter=accounts[0]?.currency??'EUR';
    if(!accounts.some(a=>a.currency===remote.homeCompare.currency))
      remote.homeCompare.currency=accounts[0]?.currency??'EUR';
    // This optional flag currently only specifies the future pagination policy.
    void preservePages;
  }catch(error){
    remote.error=(remote.session?'Anmeldung erfolgreich; Fehler beim Lesen der Serverdaten: ':'Serververbindung/Anmeldung: ')
      +(error instanceof Error?error.message:'Serverdaten konnten nicht geladen werden.');
    // Keep the authenticated session on data validation errors, never show local data.
    if(error instanceof DashboardApiError && (error.status===401||error.status===403))remote.session=null;
    remote.loading=false;
  }finally{serverLoadBusy=false;render();}
}
async function loadMoreRemoteHistory():Promise<void>{
  if(!serverMode||serverLoadBusy||!remote.nextBefore)return;
  serverLoadBusy=true;remote.loading=true;remote.error='';render();
  try{
    const client=await connectedServerClient();
    // Only three additional API pages per explicit tap, never a silent full-ledger download.
    for(let i=0;i<3&&remote.nextBefore;i++){
      const before=remote.nextBefore;
      const page=await client.bookings(before);
      if(page.nextBefore===before)throw new Error('Wiederholter API-Seitenzeiger.');
      const seen=new Set(remote.bookings.map(b=>b.id));
      remote.bookings.push(...page.items.filter(b=>!seen.has(b.id)));
      remote.nextBefore=page.nextBefore;
    }
  }catch(error){remote.error=error instanceof Error?error.message:'Historische Buchungen konnten nicht geladen werden.';}
  finally{serverLoadBusy=false;remote.loading=false;render();}
}
async function loadMoreRemote(forHome=false):Promise<void>{
  if(!serverMode||serverLoadBusy)return;
  const desired=(forHome?remote.homeVisibleCount:remote.visibleCount)+readBookingList().pageSize;
  const matches=()=>displayedServerBookings(remote,forHome?'home':'bookings').length;
  if(matches()>=desired||!remote.nextBefore){
    if(forHome)remote.homeVisibleCount=desired;else remote.visibleCount=desired;
    render();return;
  }
  serverLoadBusy=true;
  remote.loading=true;
  try {
    // Keep loading until the next visible chunk can be filled (at most 3 API pages).
    const client=await connectedServerClient();
    for(let tries=0;remote.nextBefore&&matches()<desired&&tries<3;tries++){
      const page=await client.bookings(remote.nextBefore);
      if(page.nextBefore===remote.nextBefore)throw new Error('Die API liefert denselben Seitenzeiger erneut.');
      const seen=new Set(remote.bookings.map(b=>b.id));
      remote.bookings.push(...page.items.filter(b=>!seen.has(b.id)));
      remote.nextBefore=page.nextBefore;
    }
    if(forHome)remote.homeVisibleCount=desired;else remote.visibleCount=desired;
    remote.error='';
  }catch(error){remote.error=error instanceof Error?error.message:'Weitere Buchungen konnten nicht geladen werden.';}
  finally{remote.loading=false;serverLoadBusy=false;render();}
}
/** Fetch remote rules only when the server advertises the complete recurring API.
 * No local recurring rule is ever used as a fallback. */
async function loadRemoteRecurring():Promise<void>{
  if(!serverMode||remote.recurringLoading)return;
  remote.recurringLoading=true;remote.recurringError='';render();
  try{
    remote.pending=parsePending((await secureSession().getPending()).json);
    const client=await connectedServerClient();
    const supported=await client.recurringSupported();
    remote.recurringSupported=supported;
    if(!supported){
      remote.recurringLoaded=false;remote.recurringRules=[];
      return;
    }
    const rules=await client.recurringRules();
    remote.recurringRules=rules;
    remote.recurringLoaded=true;remote.recurringError='';
  }catch(error){
    remote.recurringLoaded=false;
    remote.recurringRules=[];
    remote.recurringError=error instanceof Error?error.message:'Serverregeln konnten nicht geladen werden.';
  }finally{remote.recurringLoading=false;render();}
}
/** Server account preference is device-only, per server URL, never sent to the API. */
function remoteDefaultAccount():number|null{
  try {const raw=localStorage.getItem('fielanzen-server-default:'+remote.server);const id=Number(raw);return raw&&remote.accounts.some(a=>a.id===id&&a.active)?id:null;}
  catch {return null;}
}
function remotePicker(dlg:HTMLDialogElement, id:string, menuId:string, items:()=>Array<{id:number;name:string}>, category=false):void{
  const field=dlg.querySelector<HTMLInputElement>('#'+id)!;
  const menu=dlg.querySelector<HTMLDivElement>('#'+menuId)!;
  const hidden=category?dlg.querySelector<HTMLInputElement>('#srv-category'):null;
  const picker=attachDialogSuggestions(dlg,field,menu);
  const close=()=>picker.close();
  // Suggest recently used values first, rather than an alphabetical list starting at A.
  // Only remote API data are used; no local ledger is read in server mode.
  const usage=new Map<number,number>();
  const payeesByName=new Map(remote.payees.map(p=>[suggestionKey(p.name),p.id]));
  for(const booking of remote.bookings){
    const itemId=category?(booking.categoryId??0):(payeesByName.get(suggestionKey(booking.payeeTitle??''))??0);
    if(itemId)usage.set(itemId,(usage.get(itemId)??0)+1);
  }
  const renderMatches=(showAll=false)=>{
    const query=showAll?'':field.value;
    const filtered=rankSuggestions(items(),query,7,usage);
    menu.innerHTML=filtered.map(x=>`<button type="button" role="option" class="category-suggestion" data-remote-choice="${x.id}">${esc(x.name)}</button>`).join('');
    picker.open();
  };
  let modified=false;
  field.addEventListener('focus',()=>{modified=false;if(field.value)field.select();renderMatches(true);});
  field.addEventListener('click',()=>{if(!modified&&field.value)field.select();renderMatches(true);});
  field.addEventListener('input',()=>{modified=true;if(hidden)hidden.value='';renderMatches();});
  field.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!menu.hidden){e.preventDefault();close();return;}
    if(e.key==='Enter'&&!menu.hidden){
      e.preventDefault();
      menu.querySelector<HTMLButtonElement>('[data-remote-choice]')?.click();
    }
  });
  menu.addEventListener('click',e=>{
    const btn=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-remote-choice]');
    if(!btn)return;
    const row=items().find(x=>x.id===Number(btn.dataset.remoteChoice));
    if(row){field.value=row.name;if(hidden)hidden.value=String(row.id);modified=false;close();field.focus({preventScroll:true});}
  });
}
function serverCreateDialog(booking?:RemoteBooking):void{
  if(!serverMode||!remote.session?.canWrite||remote.pending||serverWriteBusy){remote.error='Der Server erlaubt gerade keine neue Schreiboperation.';render();return;}
  const source=remote.accounts.find(a=>a.id===booking?.accountId)??remote.accounts.find(a=>a.id===remoteDefaultAccount())??remote.accounts.find(a=>a.active);
  const kind=booking?.kind??'expense';
  const fields=`<p class="muted small">Diese Buchung wird ausschließlich auf ${esc(remote.server)} geschrieben; die lokale SQLite-Datenbank bleibt unverändert.</p>
    <div class="form-grid"><label class="field">Art<select id="srv-kind"><option value="expense" ${kind==='expense'?'selected':''}>Ausgabe</option><option value="income" ${kind==='income'?'selected':''}>Einnahme</option><option value="transfer" ${kind==='transfer'?'selected':''}>Umbuchung</option></select></label>
    <label class="field">Betrag (${esc(source?.currency??'EUR')})<input id="srv-amount" type="text" inputmode="decimal" required value="${booking?esc(String(booking.amountMinor/(10**(source?.decimals??2))).replace('.',',')):''}" placeholder="0,00"></label></div>
    <label class="field">Quellkonto<select id="srv-account">${remote.accounts.filter(a=>a.active).map(a=>option(a.id,a.name,booking?.accountId??source?.id)).join('')}</select></label>
    <label class="field" id="srv-target-field">Zielkonto bei Umbuchung<select id="srv-destination"><option value="0">– Kein Zielkonto –</option>${remote.accounts.filter(a=>a.active).map(a=>option(a.id,a.name,booking?.toAccountId)).join('')}</select></label>
    <div class="field server-search-field" id="srv-category-section"><label for="srv-category-search">Kategorie</label>
      <div class="category-picker"><input id="srv-category-search" class="category-query" type="search" autocomplete="off" role="combobox" aria-expanded="false" placeholder="Kategorie suchen" value="${esc(remote.categories.find(c=>c.id===booking?.categoryId)?.name??'')}">
      <input type="hidden" id="srv-category" value="${booking?.categoryId??0}"><div id="srv-category-menu" class="category-menu" hidden></div></div>
      <span class="field-help">Passende Kategorie eingeben und aus den Vorschlägen wählen.</span></div>
    <label class="field">Datum<input type="date" id="srv-date" required value="${booking?.date??today()}"></label>
    <div class="field server-search-field" id="srv-payee-section"><label for="srv-payee">Empfänger / Zahler (optional)</label>
      <div class="payee-picker"><input id="srv-payee" maxlength="100" autocomplete="off" value="${esc(booking?.payeeTitle??'')}" placeholder="Empfänger suchen oder neu eintragen" aria-expanded="false">
      <div class="payee-menu" id="srv-payee-menu" hidden></div></div></div>
    <label class="field">Notiz<textarea id="srv-note" maxlength="1000">${esc(booking?.note??'')}</textarea></label>
    ${booking?`<p class="muted small">Buchungsrevision: ${esc(booking.revision)}. Änderungen erfolgen nur mit If-Match.</p>`:''}`;
  const dlg=document.createElement('dialog');
  dlg.innerHTML=`<div class="modal-head"><h2>${booking?'Serverbuchung bearbeiten':'Neue Serverbuchung'}</h2><button type="button" class="btn text close-modal" aria-label="Schließen">✕</button></div>
    <form class="modal-body"><div id="dialog-error" role="alert"></div>${fields}<div class="modal-actions"><button type="button" class="btn secondary close-modal">Abbrechen</button>
    <button type="submit" class="btn primary">${booking?'Änderung am Server speichern':'Auf dem Server buchen'}</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('.close-modal').forEach(b=>b.addEventListener('click',()=>dlg.close()));
  dlg.addEventListener('close',()=>dlg.remove());
  const selectKind=dlg.querySelector<HTMLSelectElement>('#srv-kind')!;
  const selectCategory=dlg.querySelector<HTMLInputElement>('#srv-category')!;
  const categoryQuery=dlg.querySelector<HTMLInputElement>('#srv-category-search')!;
  remotePicker(dlg,'srv-category-search','srv-category-menu',()=>remote.categories.filter(c=>c.kind===selectKind.value).map(c=>({id:c.id,name:c.name})),true);
  remotePicker(dlg,'srv-payee','srv-payee-menu',()=>remote.payees.map(p=>({id:p.id,name:p.name})));
  const selectTarget=dlg.querySelector<HTMLSelectElement>('#srv-destination')!;
  function syncKind():void{
    const type=selectKind.value;
    selectTarget.disabled=type!=='transfer';
    dlg.querySelector<HTMLElement>('#srv-target-field')!.classList.toggle('hide',type!=='transfer');
    const categorySection=dlg.querySelector<HTMLElement>('#srv-category-section')!;
    categorySection.classList.toggle('hide',type==='transfer');
    if(type!=='transfer'&&!remote.categories.some(c=>c.id===Number(selectCategory.value)&&c.kind===type)){selectCategory.value='0';categoryQuery.value='';}
  }
  selectKind.addEventListener('change',syncKind);syncKind();
  dlg.querySelector('form')!.addEventListener('submit',e=>{e.preventDefault();void (async()=>{
    const button=dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;
    try{
      const kind=selectKind.value as RemoteDraft['kind'];
      const accountId=Number(dlg.querySelector<HTMLSelectElement>('#srv-account')!.value);
      const account=remote.accounts.find(a=>a.id===accountId);
      if(!account)throw new Error('Quellkonto ist unbekannt.');
      const amountText=dlg.querySelector<HTMLInputElement>('#srv-amount')!.value.trim().replace(/\s/g,'').replace(',','.');
      const dec=account.decimals;
      const re=dec===0?/^\d+$/:new RegExp(`^\\d+(?:\\.\\d{1,${dec}})?$`);
      if(!re.test(amountText))throw new Error(`Ungültiger Betrag. Maximal ${dec} Nachkommastellen.`);
      const [whole,fract='']=amountText.split('.');
      const amount=Number(whole)*10**dec+Number(fract.padEnd(dec,'0'));
      if(kind!=='transfer'&&categoryQuery.value.trim()&&!Number(selectCategory.value))throw new Error('Bitte die Kategorie aus der Vorschlagsliste auswählen.');
      const draft=validateRemoteDraft({kind,date:dlg.querySelector<HTMLInputElement>('#srv-date')!.value,account_id:accountId,
        to_account_id:kind==='transfer'?Number(selectTarget.value):undefined,
        category_id:kind==='transfer'?0:Number(selectCategory.value),amount_minor:amount,
        payee_title:dlg.querySelector<HTMLInputElement>('#srv-payee')!.value,note:dlg.querySelector<HTMLTextAreaElement>('#srv-note')!.value},remote.accounts,remote.categories);
      const request=createPendingWrite(remote.server,booking?'PUT':'POST',booking?.id??null,draft,booking?.revision);
      await issueServerWrite(request);
      dlg.close();
    }catch(error){const node=dlg.querySelector<HTMLElement>('#dialog-error')!;node.className='error';node.textContent=error instanceof Error?error.message:String(error);}
    finally{button.disabled=false;}
  })();});
  dlg.showModal();
}
/** Server-only rule editor. Never call showDialog(): that helper reloads local SQLite on submit. */
function serverRecurringDialog(rule?:ServerRecurringRule):void{
  if(!serverMode||!remote.recurringSupported||!remote.recurringLoaded||!remote.session?.canWrite||
     remote.pending||serverWriteBusy||remote.recurringLoading){
    remote.recurringError='Regeländerungen sind im Servermodus momentan nicht möglich.';render();return;
  }
  const selected=remote.accounts.find(a=>a.id===rule?.accountId)??remote.accounts.find(a=>a.id===remoteDefaultAccount())??remote.accounts.find(a=>a.active);
  if(!selected){remote.recurringError='Kein aktives Serverkonto vorhanden.';render();return;}
  const choice=(value:string,current:string):string=>value===current?'selected':'';
  const form=`<p class="muted small">Diese Regel wird ausschließlich auf dem Dashboard-Server gespeichert. Neue und bearbeitete Regeln werden zunächst pausiert und müssen anschließend bewusst aktiviert werden.</p>
    <label class="field">Regelname<input id="srv-rec-title" maxlength="160" required value="${esc(rule?.title??'')}" placeholder="z. B. Miete"></label>
    <div class="form-grid"><label class="field">Buchungsart<select id="srv-rec-kind">
      <option value="expense" ${choice('expense',rule?.kind??'expense')}>Ausgabe</option>
      <option value="income" ${choice('income',rule?.kind??'expense')}>Einnahme</option>
      <option value="transfer" ${choice('transfer',rule?.kind??'expense')}>Umbuchung</option></select></label>
      <label class="field">Betrag (${esc(selected.currency)})<input id="srv-rec-amount" inputmode="decimal" required
        value="${rule?esc(String(rule.amountMinor/10**selected.decimals).replace('.',',')):''}" placeholder="0,00"></label></div>
    <div class="form-grid"><label class="field">Quellkonto<select id="srv-rec-account">${remote.accounts.filter(a=>a.active).map(a=>option(a.id,a.name,rule?.accountId??selected.id)).join('')}</select></label>
      <label class="field" id="srv-rec-target-group">Zielkonto<select id="srv-rec-target"><option value="0">– Kein Zielkonto –</option>
        ${remote.accounts.filter(a=>a.active).map(a=>option(a.id,a.name,rule?.toAccountId)).join('')}</select></label></div>
    <div class="field server-search-field" id="srv-rec-category-group"><label for="srv-category-search">Kategorie</label>
      <div class="category-picker"><input id="srv-category-search" class="category-query" type="search" autocomplete="off" placeholder="Kategorie suchen" aria-expanded="false"
        value="${esc(remote.categories.find(c=>c.id===rule?.categoryId)?.name??'')}">
        <input type="hidden" id="srv-category" value="${rule?.categoryId??0}"><div id="srv-category-menu" class="category-menu" hidden></div></div></div>
    <div class="field server-search-field" id="srv-rec-payee-group"><label for="srv-payee">Empfänger / Zahler</label>
      <div class="payee-picker"><input id="srv-payee" maxlength="100" value="${esc(rule?.payeeTitle??'')}" placeholder="Empfänger suchen oder neu eintragen" autocomplete="off">
        <div id="srv-payee-menu" class="payee-menu" hidden></div></div></div>
    <div class="form-grid"><label class="field">Startdatum<input type="date" id="srv-rec-start" required value="${esc(rule?.startOn??today())}"></label>
      <label class="field">Ausführen ab<input type="time" id="srv-rec-time" required value="${esc(rule?.runAt??'00:00')}"></label></div>
    <div class="form-grid"><label class="field">Wiederholung<select id="srv-rec-frequency">
      <option value="daily" ${choice('daily',rule?.frequency??'monthly')}>Täglich</option>
      <option value="weekly" ${choice('weekly',rule?.frequency??'monthly')}>Wöchentlich</option>
      <option value="monthly" ${choice('monthly',rule?.frequency??'monthly')}>Monatlich</option>
      <option value="quarterly" ${choice('quarterly',rule?.frequency??'monthly')}>Vierteljährlich</option>
      <option value="yearly" ${choice('yearly',rule?.frequency??'monthly')}>Jährlich</option></select></label>
      <label class="field">Alle wie viele Intervalle?<input type="number" id="srv-rec-interval" required min="1" max="120" value="${rule?.intervalCount??1}"></label></div>
    <div class="form-grid"><label class="field" id="srv-rec-monthday-group">Tag im Monat (1–31)
      <input type="number" id="srv-rec-monthday" required min="1" max="31" value="${rule?.dayOfMonth??Number(today().slice(-2))}"></label>
      <label class="field">Enddatum (optional)<input type="date" id="srv-rec-end" value="${esc(rule?.endOn??'')}"></label></div>
    <label class="field">Maximal so oft ausführen (optional)<input id="srv-rec-max" type="number" min="1" max="10000" value="${rule?.maxOccurrences??''}" placeholder="Unbegrenzt"></label>
    <label class="field">Notiz<textarea id="srv-rec-note" maxlength="1000">${esc(rule?.note??'')}</textarea></label>
    ${rule?`<p class="notice">Beim Bearbeiten wird der Ausführungsmodus auf „Pausiert“ zurückgesetzt. Bereits gebuchte Umsätze und Ausführungen bleiben erhalten.</p>`:''}`;
  const dlg=document.createElement('dialog');
  dlg.innerHTML=`<div class="modal-head"><h2>${rule?'Serverregel bearbeiten':'Neue Serverregel'}</h2>
    <button type="button" class="btn text close-modal" aria-label="Schließen">✕</button></div>
    <form class="modal-body"><div id="dialog-error" role="alert"></div>${form}
      <div class="modal-actions"><button type="button" class="btn secondary close-modal">Abbrechen</button>
        <button type="submit" class="btn primary">${rule?'Regel speichern (pausiert)':'Regel anlegen (pausiert)'}</button></div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('.close-modal').forEach(b=>b.addEventListener('click',()=>dlg.close()));
  dlg.addEventListener('close',()=>dlg.remove());
  const kind=dlg.querySelector<HTMLSelectElement>('#srv-rec-kind')!;
  const target=dlg.querySelector<HTMLSelectElement>('#srv-rec-target')!;
  const category=dlg.querySelector<HTMLInputElement>('#srv-category')!;
  const categoryQuery=dlg.querySelector<HTMLInputElement>('#srv-category-search')!;
  const frequency=dlg.querySelector<HTMLSelectElement>('#srv-rec-frequency')!;
  const monthday=dlg.querySelector<HTMLInputElement>('#srv-rec-monthday')!;
  const start=dlg.querySelector<HTMLInputElement>('#srv-rec-start')!;
  remotePicker(dlg,'srv-category-search','srv-category-menu',
    ()=>remote.categories.filter(c=>c.kind===kind.value).map(c=>({id:c.id,name:c.name})),true);
  remotePicker(dlg,'srv-payee','srv-payee-menu',()=>remote.payees.map(p=>({id:p.id,name:p.name})));
  const sync=()=>{
    dlg.querySelector<HTMLElement>('#srv-rec-target-group')!.classList.toggle('hide',kind.value!=='transfer');
    target.disabled=kind.value!=='transfer';
    dlg.querySelector<HTMLElement>('#srv-rec-category-group')!.classList.toggle('hide',kind.value==='transfer');
    dlg.querySelector<HTMLElement>('#srv-rec-payee-group')!.classList.toggle('hide',kind.value==='transfer');
    dlg.querySelector<HTMLElement>('#srv-rec-monthday-group')!.classList.toggle('hide',frequency.value==='daily'||frequency.value==='weekly');
    if(kind.value!=='transfer'&&!remote.categories.some(c=>c.id===Number(category.value)&&c.kind===kind.value)){
      category.value='0';categoryQuery.value='';
    }
  };
  kind.addEventListener('change',sync);frequency.addEventListener('change',sync);sync();
  let dayManual=Boolean(rule);
  monthday.addEventListener('input',()=>{dayManual=true;});
  start.addEventListener('change',()=>{if(!dayManual)monthday.value=String(Number(start.value.slice(-2))||1);});
  dlg.querySelector('form')!.addEventListener('submit',e=>{e.preventDefault();void (async()=>{
    const button=dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;
    try{
      const val=(id:string)=>dlg.querySelector<HTMLInputElement>('#'+id)!.value.trim();
      const kindValue=kind.value as ServerRecurringDraft['kind'];
      const accountId=Number(val('srv-rec-account'));
      const account=remote.accounts.find(a=>a.id===accountId);
      if(!account)throw new Error('Quellkonto unbekannt.');
      const amountText=val('srv-rec-amount').replace(/\s/g,'').replace(',','.');
      const decimals=account.decimals;
      const valid=decimals===0?/^\d+$/:new RegExp('^\\d+(?:\\.\\d{1,'+decimals+'})?$');
      if(!valid.test(amountText))throw new Error('Ungültiger Betrag. Maximal '+decimals+' Nachkommastellen.');
      const [whole,fract='']=amountText.split('.');
      const amount=Number(whole)*10**decimals+Number(fract.padEnd(decimals,'0'));
      if(kindValue!=='transfer'&&categoryQuery.value.trim()&&!Number(category.value))
        throw new Error('Kategorie bitte aus der Vorschlagsliste auswählen.');
      const draft=validateServerRecurringDraft({
        title:val('srv-rec-title'),kind:kindValue,account_id:accountId,
        to_account_id:kindValue==='transfer'?Number(target.value):0,
        category_id:kindValue==='transfer'?0:Number(category.value),
        payee_title:kindValue==='transfer'?'':val('srv-payee'),amount_minor:amount,
        note:val('srv-rec-note'),frequency:frequency.value as ServerRecurringFrequency,
        interval_count:Number(val('srv-rec-interval')),day_of_month:Number(val('srv-rec-monthday')),
        start_on:val('srv-rec-start'),run_at:val('srv-rec-time'),
        end_on:val('srv-rec-end')||null,max_occurrences:val('srv-rec-max')?Number(val('srv-rec-max')):null
      },remote.accounts,remote.categories);
      await issueServerWrite(createRecurringPendingWrite(remote.server,rule?'update':'create',
        rule?.id??null,draft,rule?.revision));
      dlg.close();
    }catch(error){
      const errorNode=dlg.querySelector<HTMLElement>('#dialog-error')!;
      errorNode.className='error';errorNode.textContent=error instanceof Error?error.message:String(error);
    }finally{button.disabled=false;}
  })();});
  dlg.showModal();
}

async function issueServerWrite(request:PendingWrite,repeat=false):Promise<void>{
  if(!serverMode||serverWriteBusy)throw new Error('Server-Schreiboperation nicht möglich.');
  if(!remote.session?.canWrite)throw new Error('Dashboard verweigert Schreibzugriff; bestehende Benutzerrechte werden respektiert.');
  if(remote.pending && (!repeat||remote.pending.idempotencyKey!==request.idempotencyKey))throw new Error('Ein früherer Schreibvorgang muss zuerst geklärt werden.');
  serverWriteBusy=true;
  const secure=secureSession();
  try{
    // Persist BEFORE sending. On timeout/restart the same key/payload can be retried.
    if(!repeat){await secure.putPending({json:JSON.stringify(request)});remote.pending=request;}
    await (await connectedServerClient()).write(request);
    await secure.clearPending();remote.pending=null;
    const recurringWrite=request.path.startsWith('/api/mobile/v1/recurring');
    message=recurringWrite?'Serverregel bestätigt. Die Serveransichten werden aktualisiert.':'Serverbuchung bestätigt. Konten und Buchungen werden neu geladen.';
    await loadRemoteServer();
    if(recurringWrite)await loadRemoteRecurring();
  }catch(error){
    // An unknown network outcome is NOT retried with a new UUID automatically.
    remote.error=error instanceof Error?error.message:'Serveroperation nicht bestätigt.';
    if(error instanceof DashboardApiError && error.code==='conflict')remote.error+=' Die Revision ist nicht mehr aktuell. Bitte auf dem Server prüfen.';
    render();throw error;
  }finally{serverWriteBusy=false;}
}
async function connectServerFromSettings():Promise<void>{
  const input=document.querySelector<HTMLInputElement>('#dashboard-api-key');
  const token=input?.value.trim()??'';
  const base=normalizeDashboardUrl(txt('dashboard-server-url'));
  let sessionToken=token;
  if(!sessionToken){
    const saved=await secureSession().getToken();
    if(saved.server===base&&saved.token)sessionToken=saved.token;
  }
  if(!sessionToken)throw new Error('Geräteschlüssel fehlt. Im Dashboard unter Einstellungen → Android-App erzeugen.');
  const client=new DashboardClient(base,sessionToken);
  if(!(await client.capabilities()))throw new Error('Server liefert keine bestätigte Mobile-API v1.');
  const session=await client.session();
  let accounts:RemoteAccount[], categories:RemoteCategory[], payees:RemotePayee[], first:Awaited<ReturnType<DashboardClient['bookings']>>;
  try{[accounts,categories,payees,first]=await Promise.all([client.accounts(),client.categories(),client.payees(),client.bookings()]);}
  catch(error){
    if(error instanceof DashboardApiError&&error.code==='client_certificate_required')throw error;
    throw new Error('API-Schlüssel gültig, aber Serverdaten konnten nicht gelesen werden: '+(error instanceof Error?error.message:String(error)));
  }
  // The former modal confirmation was unreliable in Android WebView. Never switch data
  // source merely because a connection and session check succeeded.
  if((await secureSession().getStatus()).hasPending)
    throw new Error('Eine frühere Serverbuchung ist noch ungeklärt. Bitte zuerst den gespeicherten Auftrag prüfen.');
  stagedDashboard={server:base,token:sessionToken,session,accounts,categories,payees,first};
  dashboardProbeResult='Dashboard-Anmeldung erfolgreich. Noch LOKAL – bitte die Servervorschau prüfen und den Modus ausdrücklich aktivieren.';
  render();
}
async function activateStagedDashboard():Promise<void>{
  if(!stagedDashboard)throw new Error('Keine bestätigte Servervorschau vorhanden. Bitte zuerst verbinden.');
  const stage=stagedDashboard;
  if((await secureSession().getStatus()).hasPending)
    throw new Error('Ungeklärter Server-Schreibauftrag vorhanden. Erst den Auftrag prüfen.');
  // Revalidate credentials and access immediately before persisting server mode.
  const freshSession=await new DashboardClient(stage.server,stage.token).session();
  await storage.saveSettings({...state.settings,dashboard:{url:stage.server}});
  state=await storage.read();
  const secure=secureSession();
  await secure.saveToken({server:stage.server,token:stage.token});
  await secure.setMode({mode:'server'});
  serverMode=true;
  remote={...emptyServerData(),server:stage.server,session:freshSession,accounts:stage.accounts,categories:stage.categories,payees:stage.payees,
    bookings:stage.first.items,nextBefore:stage.first.nextBefore,error:'',loading:false,pending:null,visibleCount:readBookingList().pageSize};
  stagedDashboard=null;
  view='home';
  dashboardProbeResult='Servermodus aktiviert.';
  // Disable only local background executions, never change local finance data.
  if(runningNatively())try{await nativeBackup().configure({...state.settings.autoBackup??defaultAutoBackup(),enabled:false});}catch{/* show later in local mode */}
  render();
}
async function resumeServerSession():Promise<void>{
  const secure=secureSession();const credentials=await secure.getToken();
  if(!credentials.token||!credentials.server)throw new Error('Kein gespeicherter Geräteschlüssel vorhanden. Bitte erneut anmelden.');
  const client=new DashboardClient(credentials.server,credentials.token);
  if(!(await client.capabilities()))throw new Error('Dashboard-Mobile-API v1 nicht erkannt.');
  const session=await client.session();
  let accounts:RemoteAccount[],categories:RemoteCategory[],payees:RemotePayee[],page:Awaited<ReturnType<DashboardClient['bookings']>>;
  try{[accounts,categories,payees,page]=await Promise.all([client.accounts(),client.categories(),client.payees(),client.bookings()]);}
  catch(error){throw new Error('API-Schlüssel gültig, aber Serverdaten konnten nicht gelesen werden: '+(error instanceof Error?error.message:String(error)));}
  stagedDashboard={server:credentials.server,token:credentials.token,session,accounts,categories,payees,first:page};
  dashboardProbeResult='Gespeicherter API-Schlüssel gültig. Noch LOKAL. Bitte Servermodus ausdrücklich aktivieren.';
  view='settings';render();return;

}
async function switchToLocal():Promise<void>{
  await secureSession().setMode({mode:'local'});
  stagedDashboard=null;
  serverMode=false;remote=emptyServerData();view='home';
  state=await storage.read();
  render();
  try{await syncNativeBackup();}catch(error){backupError=String(error);}
}

let appLockEnabled=false;
let appUnlocked=true;
let appUnlockInProgress=false;
let appLockError='';
function appLockSettingsHtml():string{
  if(!runningNatively())return `<section class="card"><h2>App-Sperre</h2><p class="muted small">Fingerabdruck und Geräte-PIN sind nur in der installierten Android-App verfügbar.</p></section>`;
  return `<section class="card"><h2>App-Sperre</h2><p>${appLockEnabled?'Aktiv: Vor dem Anzeigen deiner Finanzdaten wird die Android-Entsperrung verlangt.':'Derzeit deaktiviert.'}</p>
    <p class="muted small">Fingerabdruck oder die sichere Displaysperre (PIN, Muster/Passwort) deines Galaxy-Geräts. Automatische Sperre beim Verlassen der App; kein neues App-Passwort nötig. Die Funktion verschlüsselt exportierte Backups nicht.</p>
    <button type="button" class="btn ${appLockEnabled?'secondary':'primary'}" data-action="${appLockEnabled?'app-lock-disable':'app-lock-enable'}">${appLockEnabled?'App-Sperre deaktivieren':'App-Sperre aktivieren'}</button>
    ${appLockError?`<p class="error" role="alert">${esc(appLockError)}</p>`:''}</section>`;
}
function lockScreen():void{
  if(!appLockEnabled||!appUnlocked||appUnlockInProgress)return;
  appUnlocked=false;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());
  render();
}
async function unlockApp():Promise<void>{
  if(!appLockEnabled){appUnlocked=true;return;}
  if(appUnlockInProgress)return;
  appUnlockInProgress=true;appLockError='';
  try{await appLock().authenticate();appUnlocked=true;if(!storage)await initializeAppData();else render();}
  catch(e){appLockError=e instanceof Error?e.message:'Entsperrung abgebrochen.';render();}
  finally{appUnlockInProgress=false;}
}
async function toggleAppLock(enabled:boolean):Promise<void>{
  try{
    // Android native prompt must authenticate BEFORE changing the native preference.
    const status=await appLock().setEnabled({enabled});
    appLockEnabled=status.enabled;appUnlocked=true;appLockError='';render();
  }catch(e){appLockError=e instanceof Error?e.message:String(e);render();}
}
function renderLocked():void{
  app.innerHTML=`<main class="app-locked"><div class="app-lock-card"><div class="app-lock-mark">F</div><h1>FieLanzen gesperrt</h1><p>Entsperre die App mit Fingerabdruck oder Geräte-PIN.</p>
    <button type="button" class="btn primary" data-action="app-unlock" ${appUnlockInProgress?'disabled':''}>${appUnlockInProgress?'Android-Entsperrung läuft …':'App entsperren'}</button>${appLockError?`<p class="error" role="alert">${esc(appLockError)}</p>`:''}</div></main>`;
}
function render(): void {
  if(appLockEnabled&&!appUnlocked){renderLocked();return;}
  applyTheme();
  app.innerHTML = `<header class="top"><span class="logo" aria-hidden="true"><img class="wolf-logo" src="./sea-wolves-logo.webp" alt=""/><span class="logo-fallback">F</span></span><div><div class="brand">FieLanzen <span style="font-weight:500">Offline</span></div><div class="subbrand">Eigenständige Finanzverwaltung</div></div><span class="top-pill">${serverMode?'SERVER':'LOKAL'}</span></header>
    <div class="mode-banner ${serverMode?'mode-server':'mode-local'}" role="status" aria-live="polite">
      <span><strong>${serverMode?'AKTIV: DASHBOARD-SERVER':'AKTIV: LOKAL'}</strong><small>${serverMode?` · ${esc(remote.server)} · Buchungen nur auf dem Server`:' · Buchungen nur auf diesem Gerät'}</small></span>
      ${serverMode?'<button type="button" class="btn secondary" data-action="server-switch-local">Zu Lokal wechseln</button>':''}
    </div>
    <main class="wrap" id="content" tabindex="-1">${message?`<div class="error" role="alert">${esc(message)}</div>`:''}${serverMode?(view==='settings'?serverSettingsHtml(remote)+appLockSettingsHtml()+licenseSettingsHtml():serverPageHtml(remote,view==='bookings'?'bookings':view==='reports'?'reports':view==='recurring'?'recurring':'home')):(view==='home'?homeHtml():view==='bookings'?bookingsViewHtml():view==='recurring'?recurringHtml():view==='reports'?reportsHtml():view==='import-audits'?importAuditsHtml():view==='data-check'?dataCheckHtml():settingsHtml())}</main>
    <nav class="nav" aria-label="Hauptnavigation"><button data-action="go-home" class="${view==='home'?'active':''}"><span class="nav-icon">⌂</span>Übersicht</button><button data-action="go-bookings" class="${view==='bookings'?'active':''}"><span class="nav-icon">▤</span>Buchungen</button><button data-action="go-recurring" class="${view==='recurring'?'active':''}"><span class="nav-icon">↻</span>Regeln</button><button data-action="go-reports" class="${view==='reports'?'active':''}"><span class="nav-icon">▥</span>Monat</button><button data-action="go-settings" class="${view==='settings'||view==='import-audits'||view==='data-check'?'active':''}"><span class="nav-icon">⚙</span>Mehr</button></nav>`;
  const logo = document.querySelector<HTMLImageElement>('.wolf-logo');
  if (logo) {
    const fallback = () => { logo.hidden = true; };
    logo.addEventListener('error',fallback,{once:true});
    if (logo.complete && logo.naturalWidth===0) fallback();
  }
}
function showDialog(title: string, fields: string, submit: (dialog: HTMLDialogElement) => Promise<void>, label='Speichern', extra=''): void {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn text close-modal" aria-label="Schließen">✕</button></div>
  <form class="modal-body" method="dialog" novalidate><div id="dialog-error" role="alert"></div>${fields}<div class="modal-actions">${extra}<button type="button" class="btn close-modal">Abbrechen</button><button type="submit" class="btn primary">${esc(label)}</button></div></form>`;
  document.body.appendChild(dlg);
  const dismiss = () => dlg.close();
  dlg.querySelectorAll('.close-modal').forEach(x => x.addEventListener('click', dismiss));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submitButton.disabled = true;
    try {await submit(dlg); dlg.close(); state=await storage.read();scheduleSnapshotStaging(); render();}
    catch (err) {const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=err instanceof Error?err.message:String(err); submitButton.disabled=false;}
  });
  dlg.showModal();
  dlg.querySelectorAll<HTMLInputElement>('input[data-select-on-focus]').forEach(input => {
    let firstTap=true;
    input.addEventListener('focus',()=>input.select());
    input.addEventListener('click',()=>{if(firstTap){input.select();firstTap=false;}});
  });
}
function addAccount(): void {
  showDialog('Konto anlegen', `<label class="field">Kontoname<input id="account-name" maxlength="100" required autocomplete="off" placeholder="z. B. Girokonto"></label>
    <label class="field">Anfangsbestand in €<input id="account-opening" data-select-on-focus required inputmode="decimal" value="0,00" placeholder="0,00"></label>`, async () => {
      await storage.addAccount(txt('account-name'),parseSignedEuro(txt('account-opening')));
  });
}

function payeeDialog(id?:number):void {
  const current=id===undefined?undefined:state.payees.find(p=>p.id===id);
  if(id!==undefined&&!current)return;
  const count=current?state.bookings.filter(b=>b.payeeId===current.id).length:0;
  showDialog(current?'Empfänger bearbeiten':'Empfänger anlegen',`<label class="field">Name<input id="payee-name" required maxlength="100" value="${esc(current?.name??'')}" placeholder="Empfänger oder Zahler"></label>
    ${current?`<p class="muted small">Original-ID ${current.id} · ${count} Buchungen. Beim Umbenennen bleiben die Zuordnungen aller Buchungen und Regeln erhalten.</p>`:''}`,async()=>{
    if(current)await storage.updatePayee(current.id,txt('payee-name'));
    else await storage.addPayee(txt('payee-name'));
  },'Speichern',current?`<button type="button" class="btn danger" id="remove-payee">Löschen</button>`:'');
  if(current){
    const dlg=document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
    dlg.querySelector('#remove-payee')?.addEventListener('click',async()=>{
      if(!window.confirm(`Empfänger „${current.name}“ wirklich löschen? Verwendete Empfänger bleiben geschützt.`))return;
      try {await storage.removePayee(current.id);dlg.close();state=await storage.read();scheduleSnapshotStaging();render();}
      catch(err){const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=err instanceof Error?err.message:String(err);}
    });
  }
}
function addCategory(): void {
  showDialog('Kategorie anlegen', `<label class="field">Bezeichnung<input id="cat-name" maxlength="100" required placeholder="z. B. Lebensmittel"></label>
    <label class="field">Art<select id="cat-kind"><option value="expense">Ausgabe</option><option value="income">Einnahme</option></select></label>`,async()=>{
      await storage.addCategory(txt('cat-name'),txt('cat-kind') as CategoryKind);
  });
}
function reconcileAccountDialog(accountId?:number):void{
  if(!state.accounts.length)return;
  const initial=state.accounts.find(a=>a.id===accountId)?.id??defaultAccountId();
  const current=(id:number)=>accountBalance(state,id,today());
  showDialog('Kontostand abgleichen', `<p class="muted small">Wie im Docker-Dashboard wird die Differenz als eigene nachvollziehbare Korrekturbuchung am heutigen Tag gespeichert. Der ursprüngliche Anfangsbestand und alte Buchungen bleiben unverändert.</p>
    <label class="field">Konto<select id="reconcile-account">${state.accounts.map(a=>option(a.id,a.name,initial)).join('')}</select></label>
    <p class="muted small" id="reconcile-current">Aktuell: ${formatEuro(current(initial))}</p>
    <label class="field">Tatsächlicher Kontostand in €<input id="reconcile-target" data-select-on-focus required inputmode="decimal" value="${moneyInput(current(initial))}"></label>
    <label class="field">Notiz (optional)<input id="reconcile-note" maxlength="500" value="Kontostand abgeglichen" placeholder="z. B. Bankabgleich"></label>
    <p class="muted small" id="reconcile-delta">Differenz: ${formatEuro(0)}</p>
    `,async()=>{
      const id=Number(txt('reconcile-account'));
      const amount=parseSignedEuro(txt('reconcile-target'));
      const plan=planAccountReconciliation(state,id,amount,today(),txt('reconcile-note'));
      if(!plan){message='Kontostand ist bereits korrekt, keine Buchung angelegt.';return;}
      await storage.reconcileAccount(id,amount,today(),txt('reconcile-note'));
      message=`Kontostand mit ${plan.kind==='income'?'Zugang':'Abgang'} von ${formatEuro(plan.amountCents)} abgeglichen.`;
  },'Abgleich speichern');
  const dlg=document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
  const update=()=>{
    const id=Number((dlg.querySelector<HTMLSelectElement>('#reconcile-account'))?.value||0);
    const old=current(id);
    const line=dlg.querySelector<HTMLElement>('#reconcile-current');if(line)line.textContent=`Aktuell: ${formatEuro(old)}`;
    const diff=dlg.querySelector<HTMLElement>('#reconcile-delta');
    const target=dlg.querySelector<HTMLInputElement>('#reconcile-target');
    if(diff&&target){try {diff.textContent=`Differenz: ${formatEuro(parseSignedEuro(target.value)-old)}`;}catch {diff.textContent='Bitte gültigen Betrag eingeben';}}
  };
  dlg.querySelector('#reconcile-account')?.addEventListener('change',()=>{
    const id=Number(txt('reconcile-account'));
    const input=dlg.querySelector<HTMLInputElement>('#reconcile-target');if(input)input.value=moneyInput(current(id));
    update();
  });
  dlg.querySelector('#reconcile-target')?.addEventListener('input',update);
}
function editAccount(id: number): void {
  const acc=state.accounts.find(a=>a.id===id);
  if (!acc) return;
  showDialog('Konto bearbeiten', `<label class="field">Kontoname<input id="account-name" maxlength="100" required value="${esc(acc.name)}"></label>
    <label class="field">Anfangsbestand in €<input id="account-opening" data-select-on-focus required inputmode="decimal" value="${moneyInput(acc.openingCents)}"></label>
    <p class="muted small">Eine Änderung des Anfangsbestands verändert auch den aktuellen Kontostand.</p>`,async()=>{
    await storage.updateAccount(id,txt('account-name'),parseSignedEuro(txt('account-opening')));
  },'Speichern',`<button type="button" class="btn danger" id="remove-account">Löschen</button>`);
  const dlg=document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
  dlg.querySelector('#remove-account')?.addEventListener('click',async()=>{
    if(!window.confirm(`Konto „${acc.name}“ endgültig löschen? Konten mit Buchungen werden geschützt.`)) return;
    try {await storage.removeAccount(acc.id);dlg.close();state=await storage.read();scheduleSnapshotStaging();render();}
    catch(error){const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=error instanceof Error?error.message:String(error);}
  });
}
function editCategory(id: number): void {
  const cat=state.categories.find(c=>c.id===id);
  if(!cat) return;
  showDialog('Kategorie bearbeiten', `<label class="field">Bezeichnung<input id="cat-name" maxlength="100" required value="${esc(cat.name)}"></label>
    <label class="field">Art<select id="cat-kind"><option value="expense" ${cat.kind==='expense'?'selected':''}>Ausgabe</option><option value="income" ${cat.kind==='income'?'selected':''}>Einnahme</option></select></label>
    <p class="muted small">Bei bestehenden Buchungen darf die Kategorieart nicht gewechselt werden. Umbenennen ist möglich.</p>`,async()=>{
    await storage.updateCategory(id,txt('cat-name'),txt('cat-kind') as CategoryKind);
  },'Speichern',`<button type="button" class="btn danger" id="remove-category">Löschen</button>`);
  const dlg=document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
  dlg.querySelector('#remove-category')?.addEventListener('click',async()=>{
    if(!window.confirm(`Kategorie „${cat.name}“ endgültig löschen? Kategorien mit Buchungen werden geschützt.`)) return;
    try {await storage.removeCategory(cat.id);dlg.close();state=await storage.read();scheduleSnapshotStaging();render();}
    catch(error){const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=error instanceof Error?error.message:String(error);}
  });
}
async function downloadBackup(): Promise<void> {
  const filename=`FieLanzen-Offline-${today()}-${new Date().toTimeString().slice(0,8).replaceAll(':','')}.json`;
  await exportUserText(exportBackup(state),filename,'application/json;charset=utf-8');
}
async function restoreBackup(file: File): Promise<void> {
  if(file.size>30*1024*1024) throw new Error('Sicherungsdatei überschreitet 30 MB.');
  // One restore picker understands current Financisto archives and older FieLanzen archives.
  const marker=new Uint8Array(await file.slice(0,2).arrayBuffer());
  if(marker[0]===0x1f&&marker[1]===0x8b){
    const plain=await expandGzip(await file.arrayBuffer());
    if(plain.startsWith('PACKAGE:ru.orangesoftware.financisto\n') || plain.startsWith('PACKAGE:tw.tib.financisto\n')){
      await importLegacyFile(file);
      return;
    }
  }
  const {snapshot,exportedAt}=await parseAutomaticBackup(file);
  const fields=`<div class="restore-summary"><p><strong>Gewählte Datei:</strong> ${esc(file.name)}</p>
    <p><strong>Exportiert:</strong> ${esc(new Date(exportedAt).toLocaleString('de-DE'))}</p>
    <p><strong>Enthalten:</strong> ${snapshot.accounts.length} Konten, ${snapshot.categories.length} Kategorien, ${snapshot.payees.length} Empfänger, ${snapshot.bookings.length} Buchungen, ${snapshot.recurringRules.length} Regeln, ${snapshot.importReports.length} Importprotokolle.</p>
    <p><strong>Kontostände der Sicherung:</strong></p>
    ${[...calculateBalances(snapshot)].map(([id,balance])=>`<div class="report-line"><span>${esc(snapshot.accounts.find(a=>a.id===id)?.name??'Konto')}</span><strong>${formatEuro(balance)}</strong></div>`).join('')}
    <p class="muted small">Vergleiche die angezeigten Kontostände mit dem erwarteten Datenstand, bevor du überschreibst.</p>
    <p class="warning"><strong>Achtung:</strong> Beim Wiederherstellen werden die aktuell gespeicherten ${state.bookings.length} Buchungen, Konten/Kategorien und Importprotokolle ersetzt. Alte JSON-Sicherungen enthalten noch keine Importberichte. Kein Zusammenführen!</p></div>
    <label class="field">Zum Bestätigen <strong>WIEDERHERSTELLEN</strong> eingeben<input id="restore-confirm" autocomplete="off" placeholder="WIEDERHERSTELLEN" required></label>`;
  showDialog('Sicherung prüfen und wiederherstellen',fields,async()=>{
    if(txt('restore-confirm').trim()!=='WIEDERHERSTELLEN') throw new Error('Bitte WIEDERHERSTELLEN vollständig eingeben.');
    await storage.replaceAll(snapshot);
    state=await storage.read();
    try{await syncNativeBackup();}catch(error){backupError=String(error);}
    bookingAccountFilter='all';expandedBookingId=null;visibleBookingCount=readBookingList().pageSize;
    message='Sicherung erfolgreich wiederhergestellt.';
  },'Daten ersetzen');
}
function bookTypeFields(type:BookingType,selectedCategory?:number|null,otherAccount?:number|null):string {
  if(type==='transfer')return `<label class="field" id="booking-second">Zielkonto<select id="book-other" required><option value="">Bitte wählen</option>${state.accounts.map(a=>option(a.id,a.name,otherAccount)).join('')}</select></label>`;
  return `<div id="booking-second">${categoryPickerHtml('book',type,selectedCategory)}</div>`;
}
function bookingDialog(b?: Booking, clone = false): void {
  if (!state.accounts.length) {addAccount();return;}
  const type = b?.type ?? 'expense';
  const account = b?.accountId ?? defaultAccountId();
  const other = b?.otherAccountId ?? null;
  const fields = `<div class="form-grid"><label class="field">Buchungsart<select id="book-type"><option value="expense" ${type==='expense'?'selected':''}>Ausgabe</option><option value="income" ${type==='income'?'selected':''}>Einnahme</option><option value="transfer" ${type==='transfer'?'selected':''}>Umbuchung</option></select></label><label class="field">Betrag (€)<input id="book-amount" inputmode="decimal" required value="${b?moneyInput(b.amountCents):''}" placeholder="0,00"></label></div>
    <div class="form-grid"><label class="field">Konto<select id="book-account" required>${state.accounts.map(a=>option(a.id,a.name,account)).join('')}</select></label><div id="second-field">${bookTypeFields(type,b?.categoryId,other)}</div></div>
    <div class="form-grid"><label class="field">Datum<input id="book-date" type="date" required value="${clone ? today() : b?.date ?? today()}"></label>${payeePickerHtml('book',b?.payeeId)}</div>
    <label class="field">Notiz<textarea id="book-note" maxlength="1000" placeholder="Optional">${esc(b?.note??'')}</textarea></label>`;
  showDialog(clone?'Buchung klonen':b?'Buchung bearbeiten':'Neue Buchung',fields,async()=>{
    const nowType=txt('book-type') as BookingType;
    const accountId=Number(txt('book-account'));
    const second = nowType==='transfer' ? Number(txt('book-other')) : Number(txt('book-category'));
    const payeeName=txt('book-payee').trim();
    const input: BookingInput = {
      type:nowType,accountId,otherAccountId:nowType==='transfer'?(second||null):null,
      categoryId:nowType==='transfer'?null:(second||null),payeeId:null,
      amountCents:parseEuro(txt('book-amount'), b?.amountCents===0),date:txt('book-date'),note:txt('book-note').trim()
    };
    // Validate first: invalid bookings must not create orphaned payee entries.
    checkBooking(input,state);
    if(nowType!=='transfer' && payeeName) input.payeeId=await storage.addPayee(payeeName);
    await storage.saveBooking(input,clone ? undefined : b?.id);
  },'Speichern',b && !clone ? `<button type="button" class="btn danger" id="remove-booking">Löschen</button>` : '');
  const dlg = document.querySelector<HTMLDialogElement>('dialog:last-of-type')!;
  const typeInput = dlg.querySelector<HTMLSelectElement>('#book-type')!;
  setupCategoryPicker(dlg,'book');
  setupPayeePicker(dlg,'book');
  typeInput.addEventListener('change',()=>{
    dlg.querySelector('#second-field')!.innerHTML=bookTypeFields(typeInput.value as BookingType);
    setupCategoryPicker(dlg,'book');
    const payee = dlg.querySelector<HTMLInputElement>('#book-payee')!;
    payee.closest('.payee-field')!.classList.toggle('hide',typeInput.value==='transfer');
  });
  const payee = dlg.querySelector<HTMLInputElement>('#book-payee')!;
  payee.closest('.payee-field')!.classList.toggle('hide',type==='transfer');
  if (b && !clone) dlg.querySelector('#remove-booking')?.addEventListener('click',async()=>{
    if (!window.confirm('Diese Buchung wirklich löschen?')) return;
    try {await storage.removeBooking(b.id);dlg.close();state=await storage.read();scheduleSnapshotStaging();render();}
    catch(err){const el=dlg.querySelector('#dialog-error')!;el.className='error';el.textContent=String(err);}
  });
}
async function click(action: string, id?: number): Promise<void> {
  if(!appUnlocked){if(action==='app-unlock')await unlockApp();return;}
  if(action==='app-license'){showLicenseDialog();return;}
  if(action==='app-lock-enable'||action==='app-lock-disable'){await toggleAppLock(action==='app-lock-enable');return;}
  if(action==='app-lock-now'){lockScreen();return;}
  message='';
  if(serverMode){
    const allowed=new Set(['go-home','go-bookings','go-settings','go-recurring','go-reports',
      'server-reload','server-more-bookings','server-add-booking','server-edit-booking','server-delete-booking',
      'toggle-server-booking','server-reset-filters','server-previous-report-month','server-next-report-month','print-report',
      'server-home-reset','server-more-history',
      'server-recurring-reload','server-recurring-add','server-recurring-edit','server-recurring-save-mode',
      'server-recurring-post','server-recurring-delete',
      'server-switch-local','server-save-default','server-forget-token','server-retry-pending','server-discard-pending']);
    if(!allowed.has(action)){remote.error='Lokale Funktionen sind im Servermodus gesperrt. Zuerst zu Lokal wechseln.';render();return;}
    switch(action){
      case 'server-save-default':{
        const chosen=Number(document.querySelector<HTMLSelectElement>('#srv-default-account')?.value||0);
        if(chosen&&!remote.accounts.some(a=>a.id===chosen&&a.active)){remote.error='Bitte ein aktives Serverkonto auswählen.';render();return;}
        try{if(chosen)localStorage.setItem('fielanzen-server-default:'+remote.server,String(chosen));
          else localStorage.removeItem('fielanzen-server-default:'+remote.server);
          remote.error='';message='Standardkonto für diesen Server auf diesem Gerät gespeichert.';
        }catch{remote.error='Standardkonto konnte nicht gespeichert werden.';}
        render();return;
      }
      case 'toggle-server-booking':{
        remote.expandedBookingId=remote.expandedBookingId===id?null:(id??null);
        const root=document.querySelector('#server-booking-results');
        if(root)root.innerHTML=serverBookingResultsHtml(remote,view==='home'?'home':'bookings');
        return;
      }
      case 'server-reset-filters':{
        remote.period='30';remote.periodExplicit=false;remote.kindFilter='all';remote.accountFilter='all';
        remote.categoryFilter='all';remote.dateFrom='';remote.dateTo='';remote.searchBookings='';
        remote.visibleCount=readBookingList().pageSize;remote.expandedBookingId=null;render();return;
      }
      case 'server-previous-report-month':{
        remote.reportMonth=monthOffset(remote.reportMonth,-1);render();return;
      }
      case 'server-next-report-month':{
        remote.reportMonth=monthOffset(remote.reportMonth,1);render();return;
      }
      case 'go-recurring':view='recurring';await loadRemoteRecurring();return;
      case 'server-recurring-reload':await loadRemoteRecurring();return;
      case 'server-recurring-add':serverRecurringDialog();return;
      case 'server-recurring-edit':{
        const rule=remote.recurringRules.find(r=>r.id===id);
        if(rule)serverRecurringDialog(rule);return;
      }
      case 'server-recurring-save-mode':{
        if(!remote.recurringSupported||!remote.recurringLoaded||!remote.session?.canWrite||remote.pending||serverWriteBusy)return;
        const rule=remote.recurringRules.find(r=>r.id===id);
        if(!rule)return;
        const next=document.querySelector<HTMLSelectElement>('#server-recurring-mode-'+rule.id)?.value as ServerRecurringMode|undefined;
        if(!next||!['paused','manual','auto'].includes(next)||next===rule.mode)return;
        if(next==='auto'){
          if(remote.session.role!=='admin'){remote.recurringError='Nur Administratoren dürfen automatische Buchungen freigeben.';render();return;}
          if(!window.confirm('Automatische Regel aktivieren? Das Dashboard wird künftige fällige Buchungen selbstständig in das Finanzbuch schreiben. Keine Banküberweisung.'))return;
        }else if(!window.confirm('Ausführungsmodus für die Serverregel „'+rule.title+'“ ändern?'))return;
        try{await issueServerWrite(createRecurringPendingWrite(remote.server,'mode',rule.id,{mode:next},rule.revision));}
        catch{/* encrypted pending write is retained and visible */}return;
      }
      case 'server-recurring-post':{
        if(!remote.recurringSupported||!remote.recurringLoaded||!remote.session?.canWrite||remote.pending||serverWriteBusy)return;
        const rule=remote.recurringRules.find(r=>r.id===id);
        if(!rule||rule.mode!=='manual'||!rule.nextOn||rule.nextOn>today())return;
        if(window.prompt('Fällige Serverbuchung „'+rule.title+'“ wirklich erzeugen? Zur Bestätigung BUCHEN eingeben.')!=='BUCHEN')return;
        try{await issueServerWrite(createRecurringPendingWrite(remote.server,'post',rule.id,{confirm:'BUCHEN'},rule.revision));}
        catch{/* never invent a new idempotency key on unknown outcome */}return;
      }
      case 'server-recurring-delete':{
        if(!remote.recurringSupported||!remote.recurringLoaded||!remote.session?.canWrite||remote.pending||serverWriteBusy)return;
        const rule=remote.recurringRules.find(r=>r.id===id);
        if(!rule)return;
        if(window.prompt('Serverregel archivieren? Bereits gebuchte Umsätze bleiben erhalten. Zur Bestätigung den vollständigen Regeltitel eingeben: '+rule.title)!==rule.title)return;
        try{await issueServerWrite(createRecurringPendingWrite(remote.server,'delete',rule.id,{confirm_title:rule.title},rule.revision));}
        catch{/* encrypted pending write is retained and visible */}return;
      }
      case 'server-reload':if(view==='recurring')await loadRemoteRecurring();else await loadRemoteServer();return;
      case 'server-more-bookings':await loadMoreRemote(view==='home');return;
      case 'server-more-history':await loadMoreRemoteHistory();return;
      case 'server-home-reset':{
        const current=today().slice(0,7);
        remote.homeCompare={...remote.homeCompare,first:current,second:calendarMonth(current,-1),
          account:'all',category:'all'};
        render();return;
      }
      case 'server-add-booking':serverCreateDialog();return;
      case 'server-edit-booking':{
        const row=remote.bookings.find(x=>x.id===id);if(row)serverCreateDialog(row);return;
      }
      case 'server-delete-booking':{
        const row=remote.bookings.find(x=>x.id===id);if(!row)return;
        if(!remote.session?.canWrite||remote.pending)return;
        if(!window.confirm(`Serverbuchung vom ${row.date} endgültig löschen? Die lokale Datenbank ist nicht betroffen.`))return;
        try{await issueServerWrite(createPendingWrite(remote.server,'DELETE',row.id,null,row.revision));}
        catch{/* pending and error displayed */}return;
      }
      case 'server-retry-pending':{
        try{if(!remote.pending)throw new Error('Kein offener Schreibauftrag.');await issueServerWrite(remote.pending,true);}
        catch{/* message visible */}return;
      }
      case 'server-discard-pending':{
        if(!remote.pending)return;
        if(!window.confirm('Bitte zuvor im Dashboard prüfen, ob die Buchung bereits ausgeführt wurde. Offenen Schreibauftrag erst danach verwerfen?'))return;
        await secureSession().clearPending();remote.pending=null;remote.error='Offener Auftrag manuell freigegeben. Bitte Serverdaten aktualisieren.';render();return;
      }
      case 'server-switch-local':await switchToLocal();return;
      case 'server-forget-token':{
        if(remote.pending){remote.error='Bitte zuerst die offene Serveroperation im Dashboard prüfen und klären, bevor du den API-Schlüssel entfernst.';render();return;}
        if(!window.confirm('Geräte-API-Schlüssel entfernen und zurück zum lokalen Modus wechseln? Eine offene Serveroperation bleibt danach nicht mehr wiederholbar.'))return;
        await secureSession().clearToken();stagedDashboard=null;serverMode=false;remote=emptyServerData();view='home';render();return;
      }
    }
  }

  switch(action){
    case 'dashboard-activate-preview':{
      try{await activateStagedDashboard();}
      catch(error){dashboardProbeResult=error instanceof Error?error.message:String(error);render();}
      break;
    }
    case 'dashboard-cancel-preview':{
      stagedDashboard=null;
      dashboardProbeResult='Lokal bleibt aktiv. Kein Servermodus aktiviert; keine Buchungen übertragen.';
      render();break;
    }
    case 'go-home':view='home';render();break;
    case 'local-home-reset':{
      const current=today().slice(0,7);
      homeCompare={first:current,second:calendarMonth(current,-1),currency:'EUR',account:'all',category:'all'};
      render();break;
    }
    case 'go-bookings':view='bookings';render();break;
    case 'go-settings':view='settings';render();break;
    case 'go-data-check':view='data-check';render();break;
    case 'export-data-check':try{await downloadText(inventoryAsText(inspectSnapshot(state,today()),today()),`FieLanzen-Datenpruefung-${today()}.txt`,'text/plain;charset=utf-8');}catch(e){message=String(e);render();}break;
    case 'go-import-audits':view='import-audits';auditChoice=state.importReports.length?[...state.importReports].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]!.id:'inventory';auditRowsVisible=80;auditQuery='';render();break;
    case 'more-audit-rows':auditRowsVisible+=80;refreshAuditRows();break;
    case 'export-audit-csv':try{await downloadText(toPayeeCsv(getAudit()),`FieLanzen-Empfaenger-Luecken-${today()}.csv`,'text/csv;charset=utf-8');}catch(e){message=String(e);render();}break;
    case 'export-audit-json':try{await downloadText(JSON.stringify(getAudit(),null,2),`FieLanzen-Importprotokoll-${today()}.json`,'application/json;charset=utf-8');}catch(e){message=String(e);render();}break;
    case 'save-inventory':{
      try{const report=inventoryReport(state);await storage.saveImportReport(report);state=await storage.read();scheduleSnapshotStaging();auditChoice=report.id;message='Bestandsanalyse lokal gespeichert (kein Original-Importprotokoll).';render();}
      catch(e){message=String(e);render();}break;
    }
    case 'go-recurring':view='recurring';render();break;
    case 'go-reports':view='reports';render();break;
    case 'previous-report-month':reportMonth=monthOffset(reportMonth,-1);render();break;
    case 'next-report-month':reportMonth=monthOffset(reportMonth,1);render();break;
    case 'export-bookings-csv':try{const rows=filteredBookings();if(!rows.length)throw new Error('Keine Buchungen zum Exportieren.');await downloadText(exportBookingsCsv(rows,state),`FieLanzen-Buchungen-${today()}.csv`,'text/csv;charset=utf-8');}catch(e){message=String(e);render();}break;
    case 'reset-booking-filters':filter='30';bookingPeriodExplicit=false;bookingTypeFilter='all';bookingAccountFilter='all';bookingCategoryFilter='all';bookingQuery='';bookingDateFrom='';bookingDateTo='';visibleBookingCount=readBookingList().pageSize;expandedBookingId=null;render();break;
    case 'print-report':window.print();break;
    case 'run-due':try{await runDue();}catch(e){message=String(e);render();}break;
    case 'add-recurring':ruleDialog();break;
    case 'edit-recurring':{const r=state.recurringRules.find(x=>x.id===id);if(r)ruleDialog(r);break;}
    case 'add-account':addAccount();break;
    case 'reconcile-account':reconcileAccountDialog();break;
    case 'toggle-accounts':{
      accountsOpen=!accountsOpen;
      const section=document.querySelector<HTMLElement>('#account-management');if(section)section.hidden=!accountsOpen;
      document.querySelector('[data-action="toggle-accounts"]')?.setAttribute('aria-expanded',String(accountsOpen));
      break;
    }
    case 'toggle-categories':{
      categoriesOpen=!categoriesOpen;
      const section=document.querySelector<HTMLElement>('#category-management');if(section)section.hidden=!categoriesOpen;
      document.querySelector('[data-action="toggle-categories"]')?.setAttribute('aria-expanded',String(categoriesOpen));
      break;
    }
    case 'toggle-payees':{
      payeesOpen=!payeesOpen;
      const section=document.querySelector<HTMLElement>('#payee-management');if(section)section.hidden=!payeesOpen;
      document.querySelector('[data-action="toggle-payees"]')?.setAttribute('aria-expanded',String(payeesOpen));
      break;
    }
    case 'add-category':categoriesOpen=true;addCategory();break;
    case 'more-categories':visibleCategoryCount+=60;updateCategoryResults();break;
    case 'add-payee':payeesOpen=true;payeeDialog();break;
    case 'edit-payee':if(id!==undefined)payeeDialog(id);break;
    case 'more-payees':visiblePayeeCount+=60;updatePayeeResults();break;
    case 'edit-account':if(id!==undefined)editAccount(id);break;
    case 'edit-category':if(id!==undefined)editCategory(id);break;
    case 'export-backup':try {await downloadBackup();}catch(error){message=error instanceof Error?error.message:String(error);render();}break;
    case 'choose-backup':document.querySelector<HTMLInputElement>('#backup-restore-input')?.click();break;
    case 'choose-auto-backup-folder':try{await selectBackupFolder();}catch(e){backupError=e instanceof Error?e.message:String(e);render();}break;
    case 'use-default-backup-folder':try{await useDownloadsBackupFolder();}catch(e){backupError=e instanceof Error?e.message:String(e);render();}break;
    case 'save-auto-backup-settings':{
      try{
        const next={enabled:(document.querySelector<HTMLInputElement>('#auto-backup-enabled')?.checked??false),
          frequency:(document.querySelector<HTMLSelectElement>('#auto-backup-frequency')?.value??'daily') as 'daily'|'weekly'|'monthly',
          keep:Number(document.querySelector<HTMLInputElement>('#auto-backup-keep')?.value??'7'),
          time:document.querySelector<HTMLInputElement>('#auto-backup-time')?.value??'03:00'};
        await updateAutoBackupSettings(next);
      }catch(e){backupError=e instanceof Error?e.message:String(e);render();}
      break;
    }
    case 'dashboard-client-cert':{
      const output=document.querySelector<HTMLElement>('#dashboard-probe-result');
      try{
        const base=normalizeDashboardUrl(txt('dashboard-server-url'));
        if(output)output.textContent='Android-Zertifikatsauswahl wird geöffnet …';
        await mtlsHttp().chooseCertificate({server:base});
        dashboardProbeResult='Client-Zertifikat für '+new URL(base).hostname+' freigegeben. Jetzt Verbinden wählen.';
      }catch(error){dashboardProbeResult=error instanceof Error?error.message:'Zertifikatsauswahl fehlgeschlagen.';}
      if(output)output.textContent=dashboardProbeResult;
      break;
    }
    case 'dashboard-clear-cert':{
      const output=document.querySelector<HTMLElement>('#dashboard-probe-result');
      try{await mtlsHttp().clearCertificate();dashboardProbeResult='Client-Zertifikatsfreigabe der App aufgehoben. Kein Eingriff in Androids Zertifikatsspeicher.';}
      catch(error){dashboardProbeResult=error instanceof Error?error.message:'Freigabe konnte nicht aufgehoben werden.';}
      if(output)output.textContent=dashboardProbeResult;
      break;
    }
    case 'dashboard-connect':{
      if(dashboardConnecting)break;
      dashboardConnecting=true;
      dashboardProbeResult='Verbinde mit dem Dashboard …';
      const indicator=document.querySelector<HTMLElement>('#dashboard-probe-result');
      if(indicator)indicator.textContent=dashboardProbeResult;
      const button=document.querySelector<HTMLButtonElement>('#dashboard-connect-button');
      if(button){button.disabled=true;button.textContent='Verbindung wird geprüft …';}
      try{
        const base=normalizeDashboardUrl(txt('dashboard-server-url'));
        await connectWithOptionalClientCertificate(
          ()=>connectServerFromSettings(),
          async()=>{
            dashboardProbeResult='Der Proxy verlangt ein Client-Zertifikat. Android-Zertifikatsauswahl wird geöffnet …';
            const output=document.querySelector<HTMLElement>('#dashboard-probe-result');
            if(output)output.textContent=dashboardProbeResult;
            await mtlsHttp().chooseCertificate({server:base});
            dashboardProbeResult='Zertifikat freigegeben. Anmeldung wird erneut geprüft …';
            const outputRetry=document.querySelector<HTMLElement>('#dashboard-probe-result');
            if(outputRetry)outputRetry.textContent=dashboardProbeResult;
          }
        );
      }catch(error){
        dashboardProbeResult=error instanceof Error?error.message:String(error);
        const output=document.querySelector<HTMLElement>('#dashboard-probe-result');
        if(output)output.textContent=dashboardProbeResult;
      }finally{
        dashboardConnecting=false;
        const target=document.querySelector<HTMLButtonElement>('#dashboard-connect-button');
        if(target){target.disabled=false;target.textContent='Verbinden';}
      }
      break;
    }
    case 'auto-backup-now':try{await backupNow();}catch(e){backupError=e instanceof Error?e.message:String(e);render();}break;
    case 'backup-diagnostics':{
      const output=document.querySelector<HTMLElement>('#backup-diagnostics-output');
      if(output){
        output.textContent=backupBridgeDiagnosis()+'\nAndroid-Pluginantwort: wird geprüft …';
        try{
          const plugin=nativeBackup(); // synchronous Capacitor proxy
          const status=await checkedBackupStep<FolderStatus>('Diagnose: getStatus()',plugin.getStatus(),8000);
          output.textContent=backupBridgeDiagnosis()+`\nAndroid-Pluginantwort: OK\nZiel: ${status.destination??'unbekannt'}\nAusgewählt: ${status.selected?'ja':'nein'}`;
        }catch(error){output.textContent=backupBridgeDiagnosis()+`\nAndroid-Pluginantwort: FEHLER – ${error instanceof Error?error.message:String(error)}`;}
      }
      break;
    }
    case 'backup-share-export':{
      try{
        const {bytes}=await exportFinancistoCompatible(state);
        const stamp=new Date().toISOString().replace(/[:.]/g,'-');
        await exportUserBytes(bytes,`FieLanzen-Financisto-Manuell-${stamp}.backup`);
      }catch(e){backupError=e instanceof Error?e.message:String(e);render();}
      break;
    }
    case 'add-booking':bookingDialog();break;
    case 'toggle-booking': {
      expandedBookingId = expandedBookingId === id ? null : (id ?? null);
      const detailsRoot = view === 'bookings' ? document.querySelector('#booking-results') : null;
      if (detailsRoot) updateBookingResults(); else render();
      break;
    }
    case 'more-bookings': if(view==='home'){visibleHomeBookingCount+=readBookingList().pageSize;updateHomeResults();}else{visibleBookingCount += readBookingList().pageSize; updateBookingResults();}break;
    case 'clone-booking': {const book=state.bookings.find(b=>b.id===id);if(book) bookingDialog(book,true);break;}
    case 'delete-booking': {
      const book=state.bookings.find(b=>b.id===id);
      if (!book || !window.confirm('Diese Buchung wirklich endgültig löschen?')) break;
      try {await storage.removeBooking(book.id); expandedBookingId=null; state=await storage.read();scheduleSnapshotStaging();render();}
      catch(err){message=err instanceof Error?err.message:String(err);render();}
      break;
    }
    case 'edit-booking': {const book=state.bookings.find(b=>b.id===id);if(book)bookingDialog(book);break;}
  }
}
document.addEventListener('toggle',e=>{
  const el=e.target as HTMLElement;
  if(el instanceof HTMLDetailsElement && el.id==='home-account-balances')homeBalancesOpen=el.open;
  if(el instanceof HTMLDetailsElement && el.id==='local-home-month-filters')homeFiltersOpen=el.open;
  if(el instanceof HTMLDetailsElement && el.id==='server-home-month-filters')remote.homeFiltersOpen=el.open;
  if(el instanceof HTMLDetailsElement && el.id==='server-home-account-balances')remote.balancesOpen=el.open;
  if(el instanceof HTMLDetailsElement && el.id==='server-booking-advanced-filters')remote.filtersOpen=el.open;
  if(el instanceof HTMLDetailsElement && el.id==='booking-advanced-filters')bookingFiltersOpen=el.open;
},true);
document.addEventListener('click',e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (button && !button.disabled) void click(button.dataset.action!, Number(button.dataset.id));
});
document.addEventListener('change',e=>{
  if(!appUnlocked)return;
  const target=e.target as HTMLInputElement;
  if(target.id.startsWith('local-home-')||target.id.startsWith('server-home-')){
    const isServer=target.id.startsWith('server-home-');
    if(isServer!==serverMode)return;
    const next=isServer?remote.homeCompare:homeCompare;
    const suffix=target.id.slice(isServer?'server-home-'.length:'local-home-'.length);
    const validMonth=/^\d{4}-(0[1-9]|1[0-2])$/;
    if(suffix==='month-a'||suffix==='month-b'){
      if(!validMonth.test(target.value))return;
      next[suffix==='month-a'?'first':'second']=target.value;
    }else if(suffix==='currency'){
      next.currency=target.value;next.account='all';
    }else if(suffix==='account')next.account=target.value;
    else if(suffix==='category')next.category=target.value;
    else return;
    render();return;
  }
  if(['booking-list-size','booking-list-sort','local-list-sort','server-list-sort'].includes(target.id)){
    const current=readBookingList();
    const next={...current, ...(target.id==='booking-list-size'?{pageSize:Number(target.value)}:{sort:target.value})};
    saveBookingList(next as typeof current);
    visibleBookingCount=readBookingList().pageSize;
    visibleHomeBookingCount=readBookingList().pageSize;
    remote.visibleCount=readBookingList().pageSize;
    remote.homeVisibleCount=readBookingList().pageSize;
    remote.expandedBookingId=null;
    expandedBookingId=null;
    render();return;
  }
  if(target.id==='preferred-account'||target.id==='preferred-theme'){
    const next={...state.settings,
      defaultAccountId:target.id==='preferred-account'?(Number(target.value)||null):state.settings.defaultAccountId,
      theme:target.id==='preferred-theme'?target.value as typeof state.settings.theme:state.settings.theme};
    void storage.saveSettings(next).then(async()=>{state=await storage.read();scheduleSnapshotStaging();render();}).catch(err=>{message=String(err);render();});return;
  }
  const element = e.target as HTMLSelectElement;
  if(serverMode && element.id.startsWith('server-filter-')){
    switch(element.id){
      case 'server-filter-period':remote.period=element.value as typeof remote.period;remote.periodExplicit=true;break;
      case 'server-filter-kind':remote.kindFilter=element.value as typeof remote.kindFilter;break;
      case 'server-filter-account':remote.accountFilter=element.value;break;
      case 'server-filter-category':remote.categoryFilter=element.value;break;
      case 'server-filter-from':remote.dateFrom=element.value;break;
      case 'server-filter-to':remote.dateTo=element.value;break;
      default:return;
    }
    remote.visibleCount=readBookingList().pageSize;remote.expandedBookingId=null;render();return;
  }
  if(serverMode && element.id==='server-report-month'){
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(element.value))remote.reportMonth=element.value;
    render();return;
  }
  if(serverMode && element.id==='server-report-account-filter'){
    remote.reportAccountFilter=element.value;render();return;
  }
  if(serverMode && element.id==='server-report-currency-filter'){
    remote.reportCurrencyFilter=element.value;remote.reportAccountFilter='all';render();return;
  }
  if(element.id==='audit-choice'){auditChoice=element.value;auditQuery='';auditRowsVisible=80;render();return;}
  if(element.id==='report-month'){
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(element.value))reportMonth=element.value;render();return;
  }
  if(element.id==='report-account-filter'){reportAccountFilter=element.value;render();return;}
  if(element.id==='category-kind-filter'){categoryKindFilter=element.value as 'all'|CategoryKind;visibleCategoryCount=60;updateCategoryResults();return;}
  if(element.id==='backup-restore-input'){
    const target=e.target as HTMLInputElement;
    const file=target.files?.[0];
    target.value='';
    if(file) void restoreBackup(file).catch(error=>{message=error instanceof Error?error.message:String(error);render();});
    return;
  }
  if (element.id === 'period-filter'){filter = element.value as Period;bookingPeriodExplicit=true;}
  else if (element.id === 'booking-type-filter') bookingTypeFilter = element.value as typeof bookingTypeFilter;
  else if (element.id === 'booking-account-filter') bookingAccountFilter = element.value;
  else if (element.id === 'booking-category-filter') bookingCategoryFilter = element.value;
  else if (element.id === 'booking-date-from') bookingDateFrom = element.value;
  else if (element.id === 'booking-date-to') bookingDateTo = element.value;
  else return;
  visibleBookingCount = readBookingList().pageSize;
  expandedBookingId = null;
  updateBookingResults();
});
document.addEventListener('input',e=>{
  if(!appUnlocked)return;
  if((e.target as HTMLElement).id==='category-search'){
    categoryQuery=(e.target as HTMLInputElement).value;visibleCategoryCount=60;updateCategoryResults();return;
  }
  if((e.target as HTMLElement).id==='payee-search'){payeeQuery=(e.target as HTMLInputElement).value;visiblePayeeCount=60;updatePayeeResults();return;}
  if ((e.target as HTMLElement).id === 'audit-search'){
    auditQuery=(e.target as HTMLInputElement).value;auditRowsVisible=80;refreshAuditRows();return;
  }
  const field=e.target as HTMLInputElement;
  if(field.id==='home-booking-search'){
    homeBookingQuery=field.value;visibleHomeBookingCount=readBookingList().pageSize;expandedBookingId=null;updateHomeResults();return;
  }
  if(field.id==='server-home-search'||field.id==='server-bookings-search'){
    if(!serverMode)return;
    const forHome=field.id==='server-home-search';
    if(forHome){remote.searchHome=field.value;remote.homeVisibleCount=readBookingList().pageSize;}
    else{remote.searchBookings=field.value;remote.visibleCount=readBookingList().pageSize;}
    remote.expandedBookingId=null;
    const root=document.querySelector('#server-booking-results');
    if(root)root.innerHTML=serverBookingResultsHtml(remote,forHome?'home':'bookings');
    const count=document.querySelector(forHome?'#server-home-booking-count':'#server-booking-count');
    if(count)count.textContent=displayedServerBookings(remote,forHome?'home':'bookings').length+(forHome?' Treffer':' Buchungen');
    if(!forHome){const summary=document.querySelector('#server-bookings-summary');if(summary)summary.innerHTML=serverBookingSummaryHtml(remote);}
    return;
  }
  if (!['booking-search','booking-quick-search'].includes(field.id)) return;
  bookingQuery = (e.target as HTMLInputElement).value;
  visibleBookingCount = readBookingList().pageSize;
  expandedBookingId = null;
  updateBookingResults();
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')lockScreen();});
window.addEventListener('pagehide',()=>{lockScreen();});
async function initializeAppData():Promise<void>{
  try {
    const startedAt=performance.now();
    storage=await openStorage();
    state=await storage.read();
    if(runningNatively()){
      // Only a previously explicitly enabled online mode is restored.
      // If it is unreachable, stay visibly in server mode, NEVER show local data as a fallback.
      try{
        const secure=secureSession();const status=await secure.getStatus();
        if(status.mode==='server'){
          serverMode=true;
          remote={...emptyServerData(),server:status.server,loading:true,
            error:status.hasToken?'':'Servermodus aktiv, aber der Geräte-API-Schlüssel fehlt.'};
        }
      }catch(error){message='Android-Keystore konnte nicht geöffnet werden: '+String(error);}
    }
    // Render as soon as the first snapshot is loaded. Native plugin setup and
    // recurring checks must not keep the startup screen visible for a minute.
    render();
    console.info('FieLanzen Start: SQLite und UI geladen in',Math.round(performance.now()-startedAt),'ms');
    window.setTimeout(()=>{
      if(serverMode)void loadRemoteServer();
      else void runDue().catch(e=>{message=`Wiederkehrende Buchungen: ${String(e)}`;render();});
      void syncNativeBackup().then(()=>{
        if(view==='settings')updateBackupStatus();
      }).catch(e=>{
        backupError=e instanceof Error?e.message:String(e);
        console.warn('Android-Sicherung konnte nicht initialisiert werden:',e);
        if(view==='settings')updateBackupStatus();
      });
    },0);
  }catch(e){
    app.innerHTML=`<main class="wrap"><div class="card"><h1>App kann nicht gestartet werden</h1><p class="error">${esc(e instanceof Error?e.message:e)}</p><p class="muted">Der lokale Datenspeicher konnte nicht geöffnet werden. Der lokale Datenspeicher konnte nicht geöffnet werden.</p></div></main>`;
    console.error(e);
  }
}
// Never open SQLite or issue API calls before the native screen lock is cleared.
(async()=>{
  if(runningNatively()){
    try{
      const status=await appLock().getStatus();
      appLockEnabled=status.enabled;
      if(appLockEnabled){appUnlocked=false;renderLocked();await unlockApp();return;}
    }catch(e){
      app.innerHTML=`<main class="app-locked"><div class="app-lock-card"><h1>App-Schutz konnte nicht geprüft werden</h1><p>${esc(e instanceof Error?e.message:String(e))}</p><p>Keine Finanzdaten geladen. Bitte Android-Build prüfen.</p></div></main>`;
      return;
    }
  }
  await initializeAppData();
})();

document.addEventListener('visibilitychange',()=>{
  if(!serverMode && document.visibilityState==='hidden' && storage && state.settings.autoBackup?.enabled && stageTimer!==null){
    clearTimeout(stageTimer);stageTimer=null;void stageCurrentSnapshot();
  }
  if(document.visibilityState==='visible' && storage && appUnlocked){
    if(serverMode)void loadRemoteServer();
    else void runDue().catch(e=>{message=String(e);render();});
    if(runningNatively()) {
      try {void nativeBackup().getStatus().then((status:FolderStatus)=>{backupStatus=status;if(view==='settings')updateBackupStatus();if(!serverMode&&state.settings.autoBackup?.enabled)scheduleSnapshotStaging();}).catch(console.error);}
      catch(error) {console.error('Android-Backup-Status:',error);}
    }
  }
});

// System Back closes an open dialog or returns from a section to the overview.
// No dependency on the web preview; never interferes with stored finance data.
if (runningNatively()) {
  void import('@capacitor/app').then(({App}) => {
    void App.addListener('pause',()=>lockScreen());
    void App.addListener('resume',()=>{if(appLockEnabled&&!appUnlocked&&!appUnlockInProgress)void unlockApp();});
    return App.addListener('backButton', async()=>{
    const dialog=document.querySelector<HTMLDialogElement>('dialog[open]');
    if(dialog){dialog.close();return;}
    if(!appUnlocked)return;
    if(view!=='home'){view='home';render();return;}
    await App.exitApp();
  });}).catch(error=>console.warn('Android lifecycle/button',error));
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(appUnlocked&&state.settings.theme==='system')applyTheme();});
