/** Experimental Financisto-compatible gzip export.
 * Standalone mode creates a fresh archive without requiring private source data.
 * Optional source-preserving mode retains unknown legacy fields using a user-picked
 * original file in memory only. No private archive is bundled with the app.
 * Recurring templates are exported only after an explicit user opt-in.
 * Restoring them into Financisto can activate schedules; never include by default.
 */
import {accountBalance} from './types.js';
import type {Snapshot,Booking} from './types.js';
import {validateSnapshot} from './backup.js';
import {expandGzip,parseLegacyText,convertLegacyTables} from './financisto.js';
import {auditOriginalFinancisto} from './financisto-audit.js';
import {scheduledTemplates} from './financisto-schedules.js';

type Fields=Record<string,string>;
const KNOWN=new Set(['account','currency','category','payee','transactions']);
const toNumber=(value:string|undefined):number=>Number(value??'0');
const safe=(value:unknown):string=>{
  const text=String(value??'');
  if(/[\r\n\x00]/.test(text)||text==='$$')throw new Error('Financisto-Export: Namen/Notizen mit Zeilenumbruch oder Steuerzeichen werden nicht unterstützt.');
  return text;
};
const record=(kind:string,fields:Fields)=>`$ENTITY:${kind}\n${Object.entries(fields).map(([k,v])=>{
  if(!/^[a-z_][a-z0-9_]*$/i.test(k))throw new Error('Financisto-Export: unzulässiger Feldname.');
  return `${k}:${safe(v)}\n`;
}).join('')}$$\n`;
const fileDate=(day:string)=>Date.parse(`${day}T12:00:00Z`);
const sameBooking=(a:Booking,b:Booking)=>a.id===b.id&&a.type===b.type&&a.accountId===b.accountId&&a.otherAccountId===b.otherAccountId&&a.categoryId===b.categoryId&&a.payeeId===b.payeeId&&a.amountCents===b.amountCents&&a.date===b.date&&a.note===b.note;
interface Block {kind:string|null;row:Fields;raw:string;}
function blocks(source:string):Block[]{
  const lines=source.replace(/\r\n/g,'\n').split('\n');const result:Block[]=[];
  let i=0;
  while(i<lines.length){
    const start=lines[i]!;
    if(!start.startsWith('$ENTITY:')){result.push({kind:null,row:{},raw:start+'\n'});i++;continue;}
    const kind=start.slice(8);const row:Fields={};const first=i++;
    while(i<lines.length&&lines[i]!=='$$'){
      const line=lines[i++]!;const separator=line.indexOf(':');
      if(separator>0)row[line.slice(0,separator)]=line.slice(separator+1);
    }
    if(i===lines.length)throw new Error('Financisto-Export: ursprünglicher Datensatz ist unvollständig.');
    i++;
    result.push({kind,row,raw:lines.slice(first,i).join('\n')+'\n'});
  }
  return result;
}
const money=(booking:Booking)=>booking.type==='income'?booking.amountCents:-booking.amountCents;
const emptyTransaction=(sample:Fields,id:number):Fields=>({
  _id:String(id),from_account_id:'0',to_account_id:'0',category_id:'0',
  project_id:'0',location_id:'0',note:'',from_amount:'0',to_amount:'0',
  datetime:'0',accuracy:'0',latitude:'0',longitude:'0',is_template:'0',
  status:'UR',is_ccard_payment:'0',last_recurrence:'0',payee_id:'0',
  parent_id:'0',updated_on:'0',original_currency_id:'0',original_from_amount:'0',
  ...Object.fromEntries(Object.keys(sample).map(key=>[key,'']))
});
export interface LegacyExportSummary {
  accounts:number;categories:number;payees:number;bookings:number;
  originalTemplatesOmitted:number;offlineRulesOmitted:number;
  originalMatches:number;bytes:number;scheduledExported?:number;inactiveScheduledIncluded?:number;
}
/** Kept only for compatibility with older integrations. Backups always include all schedules. */
export interface LegacyExportOptions {includeScheduled?:boolean;}
export async function exportFinancistoCompatible(snapshot:Snapshot,original?:File,options:LegacyExportOptions={}):Promise<{bytes:Uint8Array;summary:LegacyExportSummary}>{
  // Always complete: old callers/settings can no longer exclude scheduled templates.
  options={includeScheduled:true};
  const data=validateSnapshot(snapshot);
  if(!original)return exportFinancistoStandalone(data,options);
  const originalPlain=await expandGzip(await original.arrayBuffer());
  const source=parseLegacyText(originalPlain);
  const baseline=convertLegacyTables(source);
  const originalBookings=new Map(baseline.snapshot.bookings.map(b=>[b.id,b]));
  const currentBookings=new Map(data.bookings.map(b=>[b.id,b]));
  const baselineAccounts=new Set(baseline.snapshot.accounts.map(a=>a.id));
  if(!baselineAccounts.size||[...baselineAccounts].some(id=>!data.accounts.some(a=>a.id===id)))
    throw new Error('Financisto-Export: Konten aus der Originaldatei fehlen. Bitte passende Vorlage wählen.');
  if([...originalBookings.keys()].some(id=>!currentBookings.has(id)))
    throw new Error('Financisto-Export: Originalbuchungen fehlen im heutigen Stand. Der sichere Rückexport kann gelöschte Ursprungsbuchungen noch nicht abbilden.');
  let matches=0;
  for(const [id,b] of originalBookings)if(sameBooking(b,currentBookings.get(id)!))matches++;
  if(!matches|| (originalBookings.size>=20&&matches/originalBookings.size<0.75))
    throw new Error('Financisto-Export: Originaldatei passt nicht ausreichend zum vorhandenen Datenbestand. Export abgebrochen.');
  const sourceBlocks=blocks(originalPlain);
  const sourceRows=new Map<string,Map<number,Fields>>();
  for(const kind of KNOWN)sourceRows.set(kind,new Map());
  for(const b of sourceBlocks)if(b.kind&&KNOWN.has(b.kind)&&Number.isSafeInteger(toNumber(b.row._id)))
    sourceRows.get(b.kind)!.set(toNumber(b.row._id),b.row);
  const categoryMapping=new Map<number,number>();
  // Locally normalised categories split the original category into expense/income.
  // Reconstruct their source IDs from matching original bookings.
  const sourceTx=sourceRows.get('transactions')!;
  for(const b of baseline.snapshot.bookings){
    if(b.categoryId===null)continue;
    const raw=toNumber(sourceTx.get(b.id)?.category_id);
    if(raw>0)categoryMapping.set(b.categoryId,raw);
  }
  let categoryNext=Math.max(0,...sourceRows.get('category')!.keys())+1;
  const allCategories=new Map<number,Fields>();
  const assigned=new Map<number,string>();
  for(const c of data.categories){
    let raw=categoryMapping.get(c.id);
    // A single legacy category can serve both kinds. If the offline names
    // diverge, create a second legacy ID instead of overwriting one name.
    if(!raw ||(assigned.has(raw)&&assigned.get(raw)!==c.name))raw=categoryNext++;
    categoryMapping.set(c.id,raw);
    assigned.set(raw,c.name);
    const base=sourceRows.get('category')!.get(raw);
    allCategories.set(raw,{_id:String(raw),title:'',left:String(2*raw),right:String(2*raw+1),
      last_location_id:'0',last_project_id:'0',type:'0',updated_on:'0',is_active:'1',...base});
    allCategories.get(raw)!._id=String(raw);allCategories.get(raw)!.title=safe(c.name);
  }
  // Keep original categories (including hierarchy) not referenced by a booking.
  for(const [id,row] of sourceRows.get('category')!)if(!allCategories.has(id))allCategories.set(id,row);
  const currency=source.currency.find(c=>(c.name??'').toUpperCase()==='EUR'||c.symbol==='€');
  if(!currency||Number(currency.decimals)!==2)throw new Error('Financisto-Export: EUR-Währung der Originaldatei fehlt.');
  const currencyId=currency._id!;
  const rows=new Map<string,Map<number,Fields>>();
  for(const kind of KNOWN)rows.set(kind,new Map());
  for(const acc of data.accounts){
    const sourceAccount=sourceRows.get('account')!.get(acc.id);
    const accountRow={_id:String(acc.id),title:'',creation_date:String(Date.now()),currency_id:currencyId,
      total_amount:'0',type:'CASH',sort_order:'0',is_active:'1',is_include_into_totals:'1',...sourceAccount};
    Object.assign(accountRow,{_id:String(acc.id),title:safe(acc.name),currency_id:currencyId,total_amount:String(accountBalance(data,acc.id))});
    rows.get('account')!.set(acc.id,accountRow);
  }
  for(const [id,row] of sourceRows.get('currency')!)rows.get('currency')!.set(id,row);
  for(const [id,row] of allCategories)rows.get('category')!.set(id,row);
  for(const payee of data.payees){
    const base=sourceRows.get('payee')!.get(payee.id);
    const payeeRow={_id:String(payee.id),title:'',last_category_id:'0',updated_on:'0',is_active:'1',...base};
    Object.assign(payeeRow,{_id:String(payee.id),title:safe(payee.name)});
    rows.get('payee')!.set(payee.id,payeeRow);
  }
  const originalTemplates=source.transactions.filter(t=>t.is_template==='2'&&Boolean(t.recurrence));
  const reserved=new Set(source.transactions.map(t=>toNumber(t._id)));
  for(const booking of data.bookings){
    const base=sourceTx.get(booking.id);
    if(!base&&reserved.has(booking.id))throw new Error(`Financisto-Export: Neue Buchung ${booking.id} überschneidet sich mit einer alten Vorlagen-ID. Export abgebrochen.`);
    const legacyCategory=booking.categoryId===null?0:categoryMapping.get(booking.categoryId);
    if(legacyCategory===undefined)throw new Error(`Financisto-Export: Kategorie zu Buchung ${booking.id} nicht zuordenbar.`);
    const amount=money(booking);
    const fields={...(base??emptyTransaction(source.transactions[0]??{},booking.id)),
      _id:String(booking.id),from_account_id:String(booking.accountId),to_account_id:String(booking.otherAccountId??0),
      category_id:String(legacyCategory),payee_id:String(booking.payeeId??0),
      from_amount:String(amount),to_amount:String(booking.type==='transfer'?booking.amountCents:0),
      datetime:String(base&&sameBooking(booking,originalBookings.get(booking.id)??booking)?base.datetime:fileDate(booking.date)),
      note:safe(booking.note),is_template:'0'};
    rows.get('transactions')!.set(booking.id,fields);
  }
  // Preserve native templates from the original backup. Previously these were
  // silently stripped even when the export was requested with schedules.
  if(options.includeScheduled){
    for(const t of originalTemplates){
      const id=toNumber(t._id);
      if(rows.get('transactions')!.has(id))throw new Error('Financisto-Export: Vorlagen-ID überschneidet sich mit Buchung.');
      rows.get('transactions')!.set(id,t);
    }
  }
  const chosenTemplates=options.includeScheduled
    ?scheduledTemplates(data.recurringRules,new Set([...reserved,...rows.get('transactions')!.keys()]),
      categoryId=>categoryId===null?0:(categoryMapping.get(categoryId)??0))
    :{rows:[],exported:0,inactiveIncluded:0};
  for(const planned of chosenTemplates.rows){
    if(rows.get('transactions')!.has(planned.id))throw new Error('Financisto-Export: Doppelte Vorlagen-ID.');
    rows.get('transactions')!.set(planned.id,planned.fields);
  }
  // Audit actual schedule row count before writing the gzip archive.
  const expectedScheduleCount=(options.includeScheduled?originalTemplates.length:0)+chosenTemplates.exported;
  // Raw chunks preserve unknown entities, header, plugin-specific extensions.
  const emitted=new Map<string,Set<number>>([...KNOWN].map(k=>[k,new Set<number>()]));
  const output:string[]=[];
  for(const b of sourceBlocks){
    if(!b.kind||!KNOWN.has(b.kind)){output.push(b.raw);continue;}
    const id=toNumber(b.row._id);
    // Templates are intentionally not exported: no surprise recurrence when imported.
    const replacement=rows.get(b.kind)!.get(id);
    if(replacement){
      // Preserve byte structure for unchanged imported transaction bodies.
      const matching=b.kind==='transactions'&&originalBookings.has(id)&&sameBooking(originalBookings.get(id)!,currentBookings.get(id)!);
      output.push(matching?b.raw:record(b.kind,replacement));
      emitted.get(b.kind)!.add(id);
    }
  }
  const newRecords:string[]=[];
  for(const kind of ['currency','account','category','payee','transactions'])
    for(const [id,row] of rows.get(kind)!)if(!emitted.get(kind)!.has(id))newRecords.push(record(kind,row));
  // Place new entities before #END (trailing newline is allowed).
  const plain=output.join('');const marker=plain.lastIndexOf('#END');
  if(marker<0||plain.slice(marker).trim()!=='#END')throw new Error('Financisto-Export: ursprünglicher Paketabschluss fehlt.');
  const result=plain.slice(0,marker)+newRecords.join('')+plain.slice(marker);
  // An independent import through the same strict parser must exactly preserve
  // booking IDs, booking types, amounts, dates, account IDs and account balances.
  const parsed=parseLegacyText(result);
  if(parsed.transactions.filter(t=>t.is_template==='2'&&Boolean(t.recurrence)).length!==expectedScheduleCount)
    throw new Error('Financisto-Export: Anzahl terminierter Vorlagen im Rückimport weicht ab.');
  const round=convertLegacyTables(parsed);
  if(round.snapshot.bookings.length!==data.bookings.length||round.snapshot.accounts.length!==data.accounts.length)
    throw new Error('Financisto-Export: Rückimport hat abweichende Buchungs- oder Kontenzahlen.');
  const roundBookings=new Map(round.snapshot.bookings.map(b=>[b.id,b]));
  const mappingNew=new Map<number,number>();
  for(const booking of data.bookings){
    const check=roundBookings.get(booking.id);
    if(!check||booking.type!==check.type||booking.amountCents!==check.amountCents||booking.date!==check.date||
      booking.accountId!==check.accountId||booking.otherAccountId!==check.otherAccountId||booking.payeeId!==check.payeeId)
      throw new Error(`Financisto-Export: Rückimport von Buchung ${booking.id} weicht ab.`);
    if(booking.categoryId!==null){
      const old=mappingNew.get(booking.categoryId);
      if(old!==undefined&&old!==check.categoryId)throw new Error('Financisto-Export: unterschiedliche Kategoriezuordnung beim Rückimport.');
      mappingNew.set(booking.categoryId,check.categoryId!);
    }
  }
  for(const account of data.accounts){
    const current=round.snapshot.accounts.find(a=>a.id===account.id);
    if(!current||current.name!==account.name||accountBalance(round.snapshot,account.id)!==accountBalance(data,account.id))
      throw new Error(`Financisto-Export: Kontostand für ${account.name} weicht nach Rückimport ab.`);
  }
  if(typeof CompressionStream==='undefined')throw new Error('Financisto-Export: Gzip-Unterstützung fehlt.');
  const zipped=new Uint8Array(await new Response(new Blob([new TextEncoder().encode(result)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const summary:LegacyExportSummary={accounts:data.accounts.length,categories:rows.get('category')!.size,payees:data.payees.length,
    bookings:data.bookings.length,originalTemplatesOmitted:options.includeScheduled?0:originalTemplates.length,offlineRulesOmitted:options.includeScheduled?0:data.recurringRules.length,
    originalMatches:matches,bytes:zipped.byteLength,scheduledExported:expectedScheduleCount,
    inactiveScheduledIncluded:chosenTemplates.inactiveIncluded};
  return {bytes:zipped,summary};
}

/** Purely generated legacy archive: works with a fresh FieLanzen database and
 * does NOT contain a private template, hard-coded bookings or sample accounts.
 * The complete FieLanzen backup remains the authoritative lossless format.
 */
export async function exportFinancistoStandalone(snapshot:Snapshot,options:LegacyExportOptions={}):Promise<{bytes:Uint8Array;summary:LegacyExportSummary}>{
  const data=validateSnapshot(snapshot);
  if(!data.accounts.length)
    throw new Error('Financisto-Export: zuerst mindestens ein Konto anlegen. Eine vollständige FieLanzen-Sicherung ist auch ohne Konten möglich.');
  // Our category IDs are globally unique. Keep them stable in the source rows;
  // the Financisto importer may re-number the in-memory normalized categories.
  const categoryIds=new Set(data.categories.map(c=>c.id));
  // Mirror the actual Financisto legacy header and required SQLite columns.
  // The original Android restorer does not report every SQLite insert failure:
  // a syntactically valid file with missing currency.title can restore empty.
  const parts=["PACKAGE:ru.orangesoftware.financisto\nVERSION_CODE:117\nVERSION_NAME:1.8.2\nDATABASE_VERSION:217\nFIELANZEN_EXPORTER_VERSION:20\n#START\n"];
  parts.push(record('currency',{_id:'1',name:'EUR',title:'Euro',symbol:'€',
    is_default:'1',decimals:'2',decimal_separator:"','",group_separator:"'.'",
    symbol_format:'RS',updated_on:'0'}));
  for(const account of [...data.accounts].sort((a,b)=>a.id-b.id)){
    parts.push(record('account',{
      _id:String(account.id),title:account.name,creation_date:String(Date.now()),
      currency_id:'1',total_amount:String(accountBalance(data,account.id)),
      type:'CASH',sort_order:'0',is_active:'1',is_include_into_totals:'1',
      last_category_id:'0',last_account_id:'0',total_limit:'0',card_issuer:'VISA',
      closing_day:'0',payment_day:'0',last_transaction_date:'0',updated_on:'0'
    }));
  }
  for(const category of [...data.categories].sort((a,b)=>a.id-b.id)){
    parts.push(record('category',{
      _id:String(category.id),title:category.name,left:String(category.id*2),
      right:String(category.id*2+1),last_location_id:'0',last_project_id:'0',
      type:category.kind==='income'?'1':'0',updated_on:'0',is_active:'1'
    }));
  }
  for(const payee of [...data.payees].sort((a,b)=>a.id-b.id)){
    parts.push(record('payee',{
      _id:String(payee.id),title:payee.name,last_category_id:'0',updated_on:'0',is_active:'1'
    }));
  }
  // The legacy Android app recalculates every account balance from transactions
  // AFTER restore, ignoring imported account.total_amount. Represent local
  // opening balances as real Financisto transactions so its ledger is correct.
  // A harmless extension marker lets FieLanzen reconstruct those amounts as
  // openingCents without turning them into additional user bookings.
  const maxBookingId=data.bookings.reduce((max,b)=>Math.max(max,b.id),0);
  let nextOpeningId=maxBookingId;
  const firstBookingDay=data.bookings.reduce<string>((min,b)=>!min||b.date<min?b.date:min,'');
  const openingTimestamp=firstBookingDay?Date.parse(`${firstBookingDay}T12:00:00Z`)-86400000
    :Date.parse('2000-01-01T12:00:00Z');
  for(const account of [...data.accounts].sort((a,b)=>a.id-b.id)){
    if(!account.openingCents)continue;
    if(!Number.isSafeInteger(nextOpeningId+1))throw new Error('Financisto-Export: IDs für Anfangsbuchungen ausgeschöpft.');
    parts.push(record('transactions',{
      ...emptyTransaction({},++nextOpeningId),
      from_account_id:String(account.id),from_amount:String(account.openingCents),
      datetime:String(openingTimestamp),note:'Anfangsbestand (FieLanzen)',
      fielanzen_opening_balance:'1'
    }));
  }
  for(const booking of [...data.bookings].sort((a,b)=>a.id-b.id)){
    if(booking.categoryId!==null&&!categoryIds.has(booking.categoryId))
      throw new Error(`Financisto-Export: Kategorie in Buchung ${booking.id} fehlt.`);
    parts.push(record('transactions',{
      ...emptyTransaction({},booking.id),
      _id:String(booking.id),from_account_id:String(booking.accountId),
      to_account_id:String(booking.otherAccountId??0),
      category_id:String(booking.categoryId??0),payee_id:String(booking.payeeId??0),
      from_amount:String(money(booking)),to_amount:String(booking.type==='transfer'?booking.amountCents:0),
      datetime:String(fileDate(booking.date)),note:booking.note,is_template:'0'
    }));
  }
  const usedIds=new Set<number>();
  for(const booking of data.bookings)usedIds.add(booking.id);
  for(let id=maxBookingId+1;id<=nextOpeningId;id++)usedIds.add(id);
  const planned=options.includeScheduled
    ?scheduledTemplates(data.recurringRules,usedIds,categoryId=>categoryId??0)
    :{rows:[],exported:0,inactiveIncluded:0};
  for(const template of planned.rows)parts.push(record('transactions',template.fields));
  parts.push('#END');
  const plain=parts.join('');
  // Independent second-pass parse with the real import logic, not a surface
  // string comparison. This catches mismapped accounts, transfers, dates, etc.
  auditOriginalFinancisto(plain);
  const parsedStandalone=parseLegacyText(plain);
  if(parsedStandalone.transactions.filter(t=>t.is_template==='2'&&Boolean(t.recurrence)).length!==planned.exported)
    throw new Error('Financisto-Export: Terminvorlagen fehlen beim Rückimport.');
  const checked=convertLegacyTables(parsedStandalone);
  if(checked.snapshot.bookings.length!==data.bookings.length||checked.snapshot.accounts.length!==data.accounts.length)
    throw new Error('Financisto-Export: Rückimport hat eine abweichende Anzahl an Konten oder Buchungen.');
  const restored=new Map(checked.snapshot.bookings.map(b=>[b.id,b]));
  const restoredCategories=new Map(checked.snapshot.categories.map(c=>[c.id,c]));
  const expectedCategories=new Map(data.categories.map(c=>[c.id,c]));
  for(const booking of data.bookings){
    const back=restored.get(booking.id);
    if(!back ||back.type!==booking.type||back.accountId!==booking.accountId||
      back.otherAccountId!==booking.otherAccountId||back.amountCents!==booking.amountCents||
      back.date!==booking.date||back.note!==booking.note||back.payeeId!==booking.payeeId)
      throw new Error(`Financisto-Export: Rückimport von Buchung ${booking.id} weicht ab.`);
    if(booking.categoryId!==null){
      const expected=expectedCategories.get(booking.categoryId);
      const actual=back.categoryId===null?undefined:restoredCategories.get(back.categoryId);
      if(!expected||!actual||expected.name!==actual.name||expected.kind!==actual.kind)
        throw new Error(`Financisto-Export: Kategorie von Buchung ${booking.id} weicht ab.`);
    }
  }
  for(const account of data.accounts){
    const back=checked.snapshot.accounts.find(a=>a.id===account.id);
    if(!back||back.name!==account.name||accountBalance(checked.snapshot,account.id)!==accountBalance(data,account.id))
      throw new Error(`Financisto-Export: Kontostand von ${account.name} weicht ab.`);
  }
  if(typeof CompressionStream==='undefined')throw new Error('Financisto-Export: Gzip-Unterstützung fehlt.');
  const bytes=new Uint8Array(await new Response(new Blob([new TextEncoder().encode(plain)]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  return {bytes,summary:{accounts:data.accounts.length,categories:data.categories.length,
    payees:data.payees.length,bookings:data.bookings.length,originalTemplatesOmitted:0,
    offlineRulesOmitted:options.includeScheduled?0:data.recurringRules.length,originalMatches:0,bytes:bytes.byteLength,
    scheduledExported:planned.exported,inactiveScheduledIncluded:planned.inactiveIncluded}};
}
