// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** Native-only Dashboard Mobile API. Read requests never mutate local SQLite.
 * Every write explicitly carries a UUID idempotency key; PUT and DELETE carry If-Match.
 * Network failures do NOT trigger invisible retries.
 */
import {CapacitorHttp} from '@capacitor/core';
import {runningNatively} from './file-export.js';
import {mtlsHttp,useMtlsFor} from './mtls-http.js';
import {isClientCertificateChallenge} from './dashboard-connection.js';
import {DashboardApiError,parseAccounts,parseCategories,parsePayees,parseBookings,parseSession,parseCapabilities} from './dashboard-protocol.js';
import {recurringCapability,parseServerRecurringRules} from './server-recurring.js';
import {reconciliationCapability} from './server-reconciliation.js';
import {buildMonthlyPath,monthlyReportsCapability,parseMonthlyReport,type MonthQuery,type MonthlyReport} from './monthly-api.js';
import type {ServerRecurringRule} from './server-recurring.js';
import type {RemoteAccount,RemoteCategory,RemotePayee,RemotePage,RemoteDraft,RemoteBooking,DashboardSession,PendingWrite} from './dashboard-protocol.js';
export type {RemoteAccount,RemoteCategory,RemotePayee,RemotePage,RemoteDraft,RemoteBooking,DashboardSession,PendingWrite};
export interface DashboardProbe {online:boolean;apiReady:boolean;message:string;}
export function normalizeDashboardUrl(input:string):string{
  const raw=input.trim();if(!raw||raw.length>250)throw new Error('Bitte eine Dashboard-Adresse angeben (maximal 250 Zeichen).');
  const url=new URL(raw);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash||url.pathname!=='/'&&!/^\/$/.test(url.pathname))
    throw new Error('Nur eine HTTPS-Basisadresse ohne Pfad, Zugangsdaten oder Parameter ist zulässig.');
  return url.origin;
}
const API='/api/mobile/v1';
function asData(data:unknown):unknown{
  if(typeof data==='string'){
    if(data.length>10_000_000)throw new Error('API-Antwort ist zu groß.');
    try{return JSON.parse(data);}catch{return data;}
  }
  return data;
}
export async function apiCall(base:string,path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',token?:string,body?:object|null,headersExtra:Record<string,string>={}):Promise<unknown>{
  const normalized=normalizeDashboardUrl(base);
  if(!path.startsWith('/api/mobile/v1/')&&path!=='/healthz')throw new Error('Nur bekannte Dashboard-API-Pfade zulässig.');
  if(!runningNatively()){
    if(method!=='GET'||token)throw new Error('Angemeldete Serverzugriffe sind nur in der Android-App erlaubt.');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
    try{
      const r=await fetch(normalized+path,{method:'GET',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
      if(r.status<200||r.status>=300)throw new DashboardApiError(r.status,'http',`HTTP ${r.status}`);
      return asData(await r.text());
    }finally{clearTimeout(timer);}
  }
  const headers:Record<string,string>={'Accept':'application/json','Cache-Control':'no-store',...headersExtra};
  if(token){if(/[\r\n]/.test(token))throw new Error('Ungültiger API-Schlüssel.');headers['Authorization']='Bearer '+token;}
  if(method!=='GET')headers['Content-Type']='application/json';
  let result:{status:number;data:unknown};
  try{
    if(await useMtlsFor(normalized)){
      result=await mtlsHttp().request({url:normalized+path,method,headers,data:body});
    }else{
      result=await CapacitorHttp.request({url:normalized+path,method,headers,data:body===undefined?undefined:body,
        connectTimeout:9000,readTimeout:15000});
    }
  }catch{throw new DashboardApiError(0,'network','Netzwerk-/TLS-Fehler: Serverantwort unklar. Bei Client-Zertifikatspflicht unter Datenquelle ein Android-Zertifikat auswählen. Schreibvorgang nicht mit neuer ID wiederholen.');}
  if(isClientCertificateChallenge(result.status,result.data))throw new DashboardApiError(result.status,'client_certificate_required','Der HTTPS-Proxy verlangt ein Client-Zertifikat. Bitte im Android-System freigeben.');
  if(result.status===401||result.status===403)throw new DashboardApiError(result.status,'denied','Zugriff verweigert oder API-Schlüssel widerrufen. Keine Daten geändert.');
  if(result.status===409||result.status===412)throw new DashboardApiError(result.status,'conflict','Versions-/Buchungskonflikt. Serverdaten neu laden; keine automatische Überschreibung.');
  if(result.status===428)throw new DashboardApiError(result.status,'precondition','Änderung ohne gültige Revision abgewiesen.');
  if(result.status<200||result.status>=300)throw new DashboardApiError(result.status,'http',`Dashboard antwortet mit HTTP ${result.status}. ${result.status===400?'Die Anfrage wurde vom Server abgewiesen. ':''}Kein automatischer Wiederholungsversuch.`);
  return asData(result.data);
}
export async function probeDashboard(input:string):Promise<DashboardProbe>{
  const base=normalizeDashboardUrl(input);
  try{
    await apiCall(base,'/healthz');
  }catch(e){return{online:false,apiReady:false,message:'Dashboard-Gesundheitsprüfung fehlgeschlagen: '+(e instanceof Error?e.message:String(e))};}
  try{
    const capability=await apiCall(base,API+'/capabilities');
    return parseCapabilities(capability)?{online:true,apiReady:true,message:'Dashboard-Mobile-API erkannt. Anmeldung ist verfügbar; lokale Daten bleiben unverändert.'}:
      {online:true,apiReady:false,message:'Dashboard antwortet, aber das Mobile-API-v1-Schema ist nicht bestätigt.'};
  }catch(e){return{online:true,apiReady:false,message:'Dashboard erreichbar; Mobile-API antwortet nicht gültig: '+(e instanceof Error?e.message:String(e))};}
}
export class DashboardClient {
  constructor(public readonly base:string,private readonly token:string){this.base=normalizeDashboardUrl(base);if(!token)throw new Error('API-Schlüssel fehlt.');}
  capabilities():Promise<boolean>{return apiCall(this.base,API+'/capabilities').then(parseCapabilities);}
  session():Promise<DashboardSession>{return apiCall(this.base,API+'/session','GET',this.token).then(parseSession);}
  accounts():Promise<RemoteAccount[]>{return apiCall(this.base,API+'/accounts','GET',this.token).then(parseAccounts);}
  categories():Promise<RemoteCategory[]>{return apiCall(this.base,API+'/categories','GET',this.token).then(parseCategories);}
  payees():Promise<RemotePayee[]>{return apiCall(this.base,API+'/payees','GET',this.token).then(parsePayees);}
  recurringSupported():Promise<boolean>{
    return apiCall(this.base,API+'/capabilities').then(recurringCapability);
  }
  monthlyReportsSupported():Promise<boolean>{
    return apiCall(this.base,API+'/capabilities').then(monthlyReportsCapability);
  }
  reconciliationSupported():Promise<boolean>{
    return apiCall(this.base,API+'/capabilities').then(reconciliationCapability);
  }
  monthlyReports(query:MonthQuery):Promise<MonthlyReport>{
    return apiCall(this.base,buildMonthlyPath(query),'GET',this.token).then(parseMonthlyReport);
  }
  recurringRules():Promise<ServerRecurringRule[]>{
    return apiCall(this.base,API+'/recurring','GET',this.token).then(parseServerRecurringRules);
  }
  bookings(before?:string):Promise<RemotePage>{
    const cursor=before?'&before='+encodeURIComponent(before):'';
    return apiCall(this.base,API+'/bookings?limit=100'+cursor,'GET',this.token).then(parseBookings);
  }
  write(p:PendingWrite):Promise<unknown>{
    if(normalizeDashboardUrl(p.server)!==this.base)throw new Error('Offener Schreibauftrag gehört zu einem anderen Dashboard.');
    if(p.method!=='POST'&& !p.ifMatch)throw new Error('If-Match-Revisionsnummer fehlt.');
    const headers:Record<string,string>={'Idempotency-Key':p.idempotencyKey};
    if(p.method!=='POST')headers['If-Match']=p.ifMatch!;
    if(p.data!==null&&(typeof p.data!=='object'||Array.isArray(p.data)))
      throw new Error('Ungültiges JSON im gespeicherten Schreibauftrag.');
    return apiCall(this.base,p.path,p.method,this.token,p.data as object|null,headers);
  }
}
export function createPendingWrite(server:string,method:'POST'|'PUT'|'DELETE',id:number|null,data:RemoteDraft|null,revision?:string):PendingWrite{
  if((method==='POST')!== (id===null))throw new Error('Ungültiger Schreibauftrag.');
  if(method!=='POST'&&(!revision||!revision.trim()))throw new Error('Revision für Bearbeitung oder Löschung fehlt.');
  if(typeof crypto.randomUUID!=='function')throw new Error('Sichere UUID-Erzeugung ist nicht verfügbar.');
  return {server:normalizeDashboardUrl(server),method,path:API+'/bookings'+(id===null?'':'/'+id),
    data,idempotencyKey:crypto.randomUUID(),...(revision?{ifMatch:revision}:{}),createdAt:new Date().toISOString()};
}
