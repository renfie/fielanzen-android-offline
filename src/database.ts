import type { Account, Booking, BookingInput, Category, CategoryKind, Payee, Snapshot, ImportReport, AppSettings } from './types.js';
import { checkBooking } from './types.js';
import {validateSettings,validateSnapshot} from './backup.js';
import {prependReport} from './import-report.js';
import type {RecurringInput,RecurringRule} from './recurring.js';
import {checkRecurring,dueBookings} from './recurring.js';
import {planAccountReconciliation} from './reconcile.js';

interface Storage {
  readonly name: string;
  read(): Promise<Snapshot>;
  addAccount(name: string, openingCents: number): Promise<void>;
  updateAccount(id: number, name: string, openingCents: number): Promise<void>;
  removeAccount(id: number): Promise<void>;
  reconcileAccount(id:number,targetCents:number,date:string,note:string):Promise<boolean>;
  addCategory(name: string, kind: CategoryKind): Promise<void>;
  updateCategory(id: number, name: string, kind: CategoryKind): Promise<void>;
  removeCategory(id: number): Promise<void>;
  addPayee(name: string): Promise<number>;
  updatePayee(id: number, name: string): Promise<void>;
  removePayee(id: number): Promise<void>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveBooking(input: BookingInput, id?: number): Promise<void>;
  removeBooking(id: number): Promise<void>;
  replaceAll(snapshot: Snapshot): Promise<void>;
  saveRecurring(input: RecurringInput, id?: number): Promise<void>;
  removeRecurring(id: number): Promise<void>;
  runDue(until: string): Promise<number>;
  saveImportReport(report:ImportReport):Promise<void>;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
const assertName = (s: string, field = 'Bezeichnung'): string => {
  const name = normalize(s);
  if (!name || name.length > 100) throw new Error(`${field} muss 1 bis 100 Zeichen lang sein.`);
  return name;
};

function checkedDuplicate<T extends {id:number; name: string}>(rows: T[], name: string, ignoreId?: number): void {
  if (rows.some(a => a.id !== ignoreId && a.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) {
    throw new Error(`„${name}“ ist bereits vorhanden.`);
  }
}

class BrowserStorage implements Storage {
  name = 'Browser-Vorschau (IndexedDB)';
  private db!: IDBDatabase;
  async init(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fielanzen-offline-preview', 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of ['accounts', 'categories', 'payees', 'bookings', 'recurringRules','importReports','appSettings']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, {keyPath: 'id', autoIncrement: true});
        }
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onblocked = () => reject(new Error('Die Datenbank ist in einer weiteren Registerkarte geöffnet.'));
    });
    this.db.onversionchange=()=>this.db.close();
  }
  private tx<T>(store: string, mode: IDBTransactionMode, action: (obj: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      let result: T;
      tx.onerror = () => reject(tx.error ?? new Error('Datenspeicherfehler'));
      tx.onabort = () => reject(tx.error ?? new Error('Datenspeicher abgebrochen'));
      tx.oncomplete = () => resolve(result);
      const req = action(tx.objectStore(store));
      req.onsuccess = () => { result = req.result; };
    });
  }
  async read(): Promise<Snapshot> {
    const [accounts, categories, payees, bookings, recurringRules, importReports] = await Promise.all([
      this.tx<Account[]>('accounts', 'readonly', s => s.getAll()),
      this.tx<Category[]>('categories', 'readonly', s => s.getAll()),
      this.tx<Payee[]>('payees', 'readonly', s => s.getAll()),
      this.tx<Booking[]>('bookings', 'readonly', s => s.getAll()),
      this.tx<RecurringRule[]>('recurringRules', 'readonly', s => s.getAll()),
      this.tx<ImportReport[]>('importReports', 'readonly', s => s.getAll())
    ]);
    const record = await this.tx<{id:string;value:AppSettings}|undefined>('appSettings','readonly',s => s.get('app'));
    const settings=validateSettings(record?.value,accounts);
    return {accounts, categories, payees, bookings, recurringRules, importReports,settings};
  }
  async addAccount(raw: string, openingCents: number): Promise<void> {
    const name = assertName(raw, 'Kontoname');
    if (!Number.isSafeInteger(openingCents)) throw new Error('Ungültiger Anfangsbestand.');
    checkedDuplicate((await this.read()).accounts, name);
    await this.tx('accounts', 'readwrite', s => s.add({name, openingCents}));
  }
  async updateAccount(id: number, raw: string, openingCents: number): Promise<void> {
    const name = assertName(raw,'Kontoname');
    if (!Number.isSafeInteger(openingCents)) throw new Error('Ungültiger Anfangsbestand.');
    const snapshot = await this.read();
    if (!snapshot.accounts.some(a => a.id === id)) throw new Error('Konto nicht gefunden.');
    checkedDuplicate(snapshot.accounts,name,id);
    await this.tx('accounts','readwrite',s=>s.put({id,name,openingCents}));
  }
  async reconcileAccount(id:number,targetCents:number,date:string,note:string):Promise<boolean>{
    const snapshot=await this.read();
    const plan=planAccountReconciliation(snapshot,id,targetCents,date,note);
    if(!plan)return false;
    await new Promise<void>((resolve,reject)=>{
      const tx=this.db.transaction(['categories','bookings'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('Kontostandsabgleich fehlgeschlagen'));
      tx.onabort=()=>reject(tx.error??new Error('Kontostandsabgleich abgebrochen'));
      const bookings=tx.objectStore('bookings');
      const addBooking=(categoryId:number)=>bookings.add({type:plan.kind,accountId:id,
        otherAccountId:null,categoryId,payeeId:null,amountCents:plan.amountCents,
        date:plan.date,note:plan.note,createdAt:new Date().toISOString()});
      if(plan.categoryId!==null)addBooking(plan.categoryId);
      else{
        const req=tx.objectStore('categories').add({name:plan.categoryName,kind:plan.kind});
        req.onsuccess=()=>addBooking(Number(req.result));
      }
    });
    return true;
  }
  async removeAccount(id: number): Promise<void> {
    const s=await this.read();
    if (s.bookings.some(b=>b.accountId===id || b.otherAccountId===id) || s.recurringRules.some(r=>r.accountId===id || r.otherAccountId===id)) throw new Error('Konto wird von Buchungen verwendet und kann nicht gelöscht werden.');
    await new Promise<void>((resolve,reject)=>{
      const tx=this.db.transaction(['accounts','appSettings'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('Konto konnte nicht gelöscht werden.'));
      tx.onabort=()=>reject(tx.error??new Error('Konto konnte nicht gelöscht werden.'));
      tx.objectStore('accounts').delete(id);
      if(s.settings.defaultAccountId===id)tx.objectStore('appSettings').put({id:'app',value:{...s.settings,defaultAccountId:null}});
    });
  }
  async addCategory(raw: string, kind: CategoryKind): Promise<void> {
    const name = assertName(raw, 'Kategorie');
    const categories = (await this.read()).categories.filter(c => c.kind === kind);
    checkedDuplicate(categories, name);
    await this.tx('categories', 'readwrite', s => s.add({name, kind}));
  }
  async updateCategory(id: number, raw: string, kind: CategoryKind): Promise<void> {
    const name=assertName(raw,'Kategorie');
    const s=await this.read();
    const previous=s.categories.find(c=>c.id===id);
    if (!previous) throw new Error('Kategorie nicht gefunden.');
    if (previous.kind!==kind && (s.bookings.some(b=>b.categoryId===id) || s.recurringRules.some(r=>r.categoryId===id))) throw new Error('Die Kategorieart kann bei bestehenden Buchungen nicht geändert werden.');
    checkedDuplicate(s.categories.filter(c=>c.kind===kind),name,id);
    await this.tx('categories','readwrite',store=>store.put({id,name,kind}));
  }
  async removeCategory(id: number): Promise<void> {
    const s=await this.read();
    if (s.bookings.some(b=>b.categoryId===id) || s.recurringRules.some(r=>r.categoryId===id)) throw new Error('Kategorie wird von Buchungen verwendet und kann nicht gelöscht werden.');
    await this.tx('categories','readwrite',store=>store.delete(id));
  }
  async addPayee(raw: string): Promise<number> {
    const name = assertName(raw, 'Empfänger');
    const old = (await this.read()).payees.find(p => p.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'));
    if (old) return old.id;
    return Number(await this.tx('payees', 'readwrite', s => s.add({name})));
  }
  async updatePayee(id:number,raw:string):Promise<void>{
    const name=assertName(raw,'Empfänger');
    const s=await this.read();
    if(!s.payees.some(p=>p.id===id))throw new Error('Empfänger nicht gefunden.');
    checkedDuplicate(s.payees,name,id);
    await this.tx('payees','readwrite',store=>store.put({id,name}));
  }
  async removePayee(id:number):Promise<void>{
    const s=await this.read();
    if(s.bookings.some(b=>b.payeeId===id)||s.recurringRules.some(r=>r.payeeId===id))throw new Error('Empfänger wird von Buchungen oder Regeln verwendet und kann nicht gelöscht werden. Umbenennen ist möglich.');
    await this.tx('payees','readwrite',store=>store.delete(id));
  }
  async saveSettings(settings:AppSettings):Promise<void>{
    const s=await this.read();
    const checked=validateSettings(settings,s.accounts);
    await this.tx('appSettings','readwrite',store=>store.put({id:'app',value:checked}));
  }
  async saveBooking(input: BookingInput, id?: number): Promise<void> {
    checkBooking(input, await this.read());
    if (id !== undefined && !(await this.read()).bookings.some(b => b.id === id)) throw new Error('Buchung nicht gefunden.');
    const old = id === undefined ? undefined : (await this.read()).bookings.find(b => b.id === id);
    await this.tx('bookings', 'readwrite', s => id === undefined
      ? s.add({...input, createdAt: new Date().toISOString()})
      : s.put({...input, id, createdAt: old!.createdAt}));
  }
  async removeBooking(id: number): Promise<void> { await this.tx('bookings', 'readwrite', s => s.delete(id)); }
  async saveRecurring(input: RecurringInput, id?: number): Promise<void> {
    const state=await this.read();
    checkRecurring(input,state);
    const old=id===undefined?undefined:state.recurringRules.find(r=>r.id===id);
    if(id!==undefined&&!old) throw new Error('Regel nicht gefunden.');
    if (input.maxRuns!==null && old && input.maxRuns<old.runs) throw new Error('Die Höchstzahl darf nicht kleiner als bereits ausgeführte Buchungen sein.');
    // Änderungen betreffen zukünftige Ausführungen; nie zurückgesetzte Ausführungen doppelt buchen.
    const nextOn=old ? (old.nextOn>input.startOn?old.nextOn:input.startOn) : input.startOn;
    const rule={...input,nextOn,runs:old?.runs??0,...(id===undefined?{}:{id})};
    await this.tx('recurringRules','readwrite',store=> id===undefined?store.add(rule):store.put(rule));
  }
  async removeRecurring(id:number):Promise<void>{await this.tx('recurringRules','readwrite',store=>store.delete(id));}
  async runDue(until:string):Promise<number>{
    const snapshot=await this.read();
    let total=0;
    for(const old of snapshot.recurringRules.filter(x=>x.active)){
      const planned=dueBookings(old,until);
      if(!planned.bookings.length && planned.active===old.active) continue;
      for(const b of planned.bookings) checkBooking(b,snapshot);
      const count=await new Promise<number>((resolve,reject)=>{
        const transaction=this.db.transaction(['bookings','recurringRules'],'readwrite');
        let inserted=0;
        transaction.onabort=()=>reject(transaction.error??new Error('Wiederholung fehlgeschlagen.'));
        transaction.onerror=()=>reject(transaction.error??new Error('Wiederholung fehlgeschlagen.'));
        transaction.oncomplete=()=>resolve(inserted);
        const ruleStore=transaction.objectStore('recurringRules');
        const req=ruleStore.get(old.id);
        req.onsuccess=()=>{
          const current=req.result as RecurringRule | undefined;
          if(!current || current.nextOn!==old.nextOn || current.runs!==old.runs || !current.active) return;
          for(const b of planned.bookings){transaction.objectStore('bookings').add({...b,createdAt:new Date().toISOString()});inserted++;}
          ruleStore.put({...current,...planned});
        };
      });
      total+=count;
    }
    return total;
  }
  async saveImportReport(report:ImportReport):Promise<void>{
    const reports=prependReport((await this.read()).importReports,report);
    await new Promise<void>((resolve,reject)=>{
      const tx=this.db.transaction(['importReports'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('Protokoll konnte nicht gespeichert werden'));
      tx.onabort=()=>reject(tx.error??new Error('Protokollspeicherung abgebrochen'));
      const store=tx.objectStore('importReports');store.clear();
      for(const r of reports)store.put(r);
    });
  }
  async replaceAll(snapshot: Snapshot): Promise<void> {
    const checked=validateSnapshot(snapshot);
    await new Promise<void>((resolve,reject)=>{
      const transaction=this.db.transaction(['bookings','payees','categories','accounts','recurringRules','importReports','appSettings'],'readwrite');
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error ?? new Error('Wiederherstellung fehlgeschlagen'));
      transaction.onabort=()=>reject(transaction.error ?? new Error('Wiederherstellung wurde abgebrochen'));
      for (const name of ['bookings','payees','categories','accounts','recurringRules','importReports','appSettings']) transaction.objectStore(name).clear();
      transaction.objectStore('appSettings').put({id:'app',value:checked.settings});
      for (const name of ['accounts','categories','payees','bookings','recurringRules','importReports'] as const)
        for(const row of checked[name]) transaction.objectStore(name).put(row);
    });
  }
}

// SQLiteConnection is used only inside the native Android Capacitor bridge. Never
// silently fall back to browser storage when running on a native device.
class NativeStorage implements Storage {
  name = 'Android SQLite';
  private db: any;
  async init(): Promise<void> {
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    this.db = await sqlite.createConnection('fielanzen_offline', false, 'no-encryption', 1, false);
    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;');
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        opening_cents INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE,
        kind TEXT NOT NULL CHECK(kind IN ('expense','income')),
        UNIQUE(name,kind)
      );
      CREATE TABLE IF NOT EXISTS payees (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('expense','income','transfer')),
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        other_account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
        payee_id INTEGER REFERENCES payees(id) ON DELETE RESTRICT,
        amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
        booking_date TEXT NOT NULL,
        recurring_rule_id INTEGER,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        CHECK ((type='transfer' AND other_account_id IS NOT NULL AND category_id IS NULL AND other_account_id <> account_id)
          OR (type <> 'transfer' AND other_account_id IS NULL AND category_id IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date DESC,id DESC);
      CREATE INDEX IF NOT EXISTS idx_bookings_account ON bookings(account_id);
      CREATE TABLE IF NOT EXISTS import_reports (
        id TEXT PRIMARY KEY NOT NULL, report_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recurring_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,type TEXT NOT NULL,account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        other_account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
        payee_id INTEGER REFERENCES payees(id) ON DELETE RESTRICT,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), note TEXT NOT NULL DEFAULT '',
        frequency TEXT NOT NULL, interval INTEGER NOT NULL,
        start_on TEXT NOT NULL, next_on TEXT NOT NULL, day_of_month INTEGER NOT NULL,
        end_on TEXT, max_runs INTEGER, runs INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
    `);
    // Non-destructive migration for older installed Alpha 26 SQLite databases.
    const columns=await this.db.query('PRAGMA table_info(bookings)');
    if(!(columns.values??[]).some((column:{name:string})=>column.name==='recurring_rule_id'))
      await this.db.execute('ALTER TABLE bookings ADD COLUMN recurring_rule_id INTEGER;');
  }
  private async rows(query: string, parameters: unknown[] = []): Promise<any[]> {
    const result = await this.db.query(query, parameters);
    return result.values ?? [];
  }
  async read(): Promise<Snapshot> {
    const accounts = await this.rows('SELECT id,name,opening_cents AS openingCents FROM accounts ORDER BY name COLLATE NOCASE');
    const categories = await this.rows('SELECT id,name,kind FROM categories ORDER BY name COLLATE NOCASE');
    const payees = await this.rows('SELECT id,name FROM payees ORDER BY name COLLATE NOCASE');
    const bookings = await this.rows(`SELECT id,type,account_id AS accountId,other_account_id AS otherAccountId,
      category_id AS categoryId,payee_id AS payeeId,amount_cents AS amountCents,
      booking_date AS date,recurring_rule_id AS recurringRuleId,note,created_at AS createdAt FROM bookings ORDER BY booking_date DESC,id DESC`);
    const rawRules=await this.rows(`SELECT id,title,type,account_id AS accountId,other_account_id AS otherAccountId,
      category_id AS categoryId,payee_id AS payeeId,amount_cents AS amountCents,note,frequency,interval,
      start_on AS startOn,next_on AS nextOn,day_of_month AS dayOfMonth,end_on AS endOn,
      max_runs AS maxRuns,runs,active FROM recurring_rules ORDER BY id`);
    const recurringRules=rawRules.map(r=>({...r,active:Boolean(r.active)})) as RecurringRule[];
    const reportRows=await this.rows('SELECT report_json FROM import_reports ORDER BY id');
    const importReports=reportRows.map(r=>JSON.parse(r.report_json) as ImportReport);
    const stored=await this.rows("SELECT value FROM app_settings WHERE key='preferences'");
    const settings=validateSettings(stored.length?JSON.parse(stored[0].value):undefined,accounts);
    return {accounts, categories, payees, bookings, recurringRules, importReports,settings};
  }
  async addAccount(raw: string, openingCents: number): Promise<void> {
    const name = assertName(raw, 'Kontoname');
    if (!Number.isSafeInteger(openingCents)) throw new Error('Ungültiger Anfangsbestand.');
    checkedDuplicate((await this.read()).accounts, name);
    await this.db.run('INSERT INTO accounts (name,opening_cents) VALUES (?,?)', [name,openingCents]);
  }
  async updateAccount(id: number, raw: string, openingCents: number): Promise<void> {
    const name=assertName(raw,'Kontoname');
    if(!Number.isSafeInteger(openingCents)) throw new Error('Ungültiger Anfangsbestand.');
    const s=await this.read();
    if(!s.accounts.some(a=>a.id===id)) throw new Error('Konto nicht gefunden.');
    checkedDuplicate(s.accounts,name,id);
    await this.db.run('UPDATE accounts SET name=?,opening_cents=? WHERE id=?',[name,openingCents,id]);
  }
  async reconcileAccount(id:number,targetCents:number,date:string,note:string):Promise<boolean>{
    const snapshot=await this.read();
    const plan=planAccountReconciliation(snapshot,id,targetCents,date,note);
    if(!plan)return false;
    await this.db.beginTransaction();
    try{
      let categoryId=plan.categoryId;
      if(categoryId===null){
        await this.db.run('INSERT INTO categories (name,kind) VALUES (?,?)',[plan.categoryName,plan.kind],false);
        const category=await this.rows('SELECT id FROM categories WHERE name=? AND kind=?',[plan.categoryName,plan.kind]);
        if(!category.length)throw new Error('Korrekturkategorie konnte nicht angelegt werden.');
        categoryId=Number(category[0].id);
      }
      await this.db.run(`INSERT INTO bookings
        (type,account_id,other_account_id,category_id,payee_id,amount_cents,booking_date,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        [plan.kind,id,null,categoryId,null,plan.amountCents,date,plan.note,new Date().toISOString()],false);
      await this.db.commitTransaction();
      return true;
    }catch(err){try{await this.db.rollbackTransaction();}catch{}throw err;}
  }
  async removeAccount(id: number): Promise<void> {
    const s=await this.read();
    if(s.bookings.some(b=>b.accountId===id || b.otherAccountId===id) || s.recurringRules.some(r=>r.accountId===id || r.otherAccountId===id)) throw new Error('Konto wird von Buchungen oder Regeln verwendet und kann nicht gelöscht werden.');
    await this.db.beginTransaction();
    try{
      await this.db.run('DELETE FROM accounts WHERE id=?',[id],false);
      if(s.settings.defaultAccountId===id)
        await this.db.run("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('preferences',?)",[JSON.stringify({...s.settings,defaultAccountId:null})],false);
      await this.db.commitTransaction();
    }catch(err){try{await this.db.rollbackTransaction();}catch{}throw err;}
  }
  async addCategory(raw: string, kind: CategoryKind): Promise<void> {
    const name = assertName(raw, 'Kategorie');
    checkedDuplicate((await this.read()).categories.filter(c => c.kind === kind), name);
    await this.db.run('INSERT INTO categories (name,kind) VALUES (?,?)', [name,kind]);
  }
  async updateCategory(id: number, raw: string, kind: CategoryKind): Promise<void> {
    const name=assertName(raw,'Kategorie');
    const s=await this.read();
    const previous=s.categories.find(c=>c.id===id);
    if(!previous) throw new Error('Kategorie nicht gefunden.');
    if(previous.kind!==kind && (s.bookings.some(b=>b.categoryId===id) || s.recurringRules.some(r=>r.categoryId===id))) throw new Error('Die Kategorieart kann bei bestehenden Buchungen und Regeln nicht geändert werden.');
    checkedDuplicate(s.categories.filter(c=>c.kind===kind),name,id);
    await this.db.run('UPDATE categories SET name=?,kind=? WHERE id=?',[name,kind,id]);
  }
  async removeCategory(id: number): Promise<void> {
    const s=await this.read();
    if(s.bookings.some(b=>b.categoryId===id) || s.recurringRules.some(r=>r.categoryId===id)) throw new Error('Kategorie wird von Buchungen oder Regeln verwendet und kann nicht gelöscht werden.');
    await this.db.run('DELETE FROM categories WHERE id=?',[id]);
  }
  async addPayee(raw: string): Promise<number> {
    const name = assertName(raw, 'Empfänger');
    const match = (await this.read()).payees.find(p => p.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'));
    if (match) return match.id;
    await this.db.run('INSERT INTO payees (name) VALUES (?)',[name]);
    const result = await this.rows('SELECT id FROM payees WHERE name=? COLLATE NOCASE',[name]);
    if (!result.length) throw new Error('Empfänger konnte nicht gespeichert werden.');
    return Number(result[0].id);
  }
  async updatePayee(id:number,raw:string):Promise<void>{
    const name=assertName(raw,'Empfänger');
    const s=await this.read();
    if(!s.payees.some(p=>p.id===id))throw new Error('Empfänger nicht gefunden.');
    checkedDuplicate(s.payees,name,id);
    await this.db.run('UPDATE payees SET name=? WHERE id=?',[name,id]);
  }
  async removePayee(id:number):Promise<void>{
    const s=await this.read();
    if(s.bookings.some(b=>b.payeeId===id)||s.recurringRules.some(r=>r.payeeId===id))throw new Error('Empfänger wird von Buchungen oder Regeln verwendet und kann nicht gelöscht werden. Umbenennen ist möglich.');
    await this.db.run('DELETE FROM payees WHERE id=?',[id]);
  }
  async saveSettings(settings:AppSettings):Promise<void>{
    const s=await this.read();
    const checked=validateSettings(settings,s.accounts);
    await this.db.run("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('preferences',?)",[JSON.stringify(checked)]);
  }
  async saveBooking(input: BookingInput, id?: number): Promise<void> {
    checkBooking(input, await this.read());
    const args = [input.type,input.accountId,input.otherAccountId,input.categoryId,input.payeeId,input.amountCents,input.date,input.note];
    if (id === undefined) {
      await this.db.run(`INSERT INTO bookings (type,account_id,other_account_id,category_id,payee_id,amount_cents,booking_date,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`, [...args, new Date().toISOString()]);
    } else {
      const result = await this.db.run(`UPDATE bookings SET type=?,account_id=?,other_account_id=?,category_id=?,payee_id=?,amount_cents=?,booking_date=?,note=? WHERE id=?`, [...args,id]);
      if (!result?.changes?.changes) throw new Error('Buchung nicht gefunden.');
    }
  }
  async removeBooking(id: number): Promise<void> { await this.db.run('DELETE FROM bookings WHERE id=?',[id]); }
  async saveRecurring(input:RecurringInput,id?:number):Promise<void>{
    const snapshot=await this.read();checkRecurring(input,snapshot);
    if(id!==undefined&&!snapshot.recurringRules.some(r=>r.id===id)) throw new Error('Regel nicht gefunden.');
    const existing=id===undefined?undefined:snapshot.recurringRules.find(x=>x.id===id);
    if (input.maxRuns!==null && existing && input.maxRuns<existing.runs) throw new Error('Die Höchstzahl darf nicht kleiner als bereits ausgeführte Buchungen sein.');
    const nextOn=existing?(existing.nextOn>input.startOn?existing.nextOn:input.startOn):input.startOn;
    const args=[input.title,input.type,input.accountId,input.otherAccountId,input.categoryId,input.payeeId,
      input.amountCents,input.note,input.frequency,input.interval,input.startOn,nextOn,input.dayOfMonth,
      input.endOn,input.maxRuns,existing?.runs??0,input.active?1:0];
    const fields='title,type,account_id,other_account_id,category_id,payee_id,amount_cents,note,frequency,interval,start_on,next_on,day_of_month,end_on,max_runs,runs,active';
    if(id===undefined){
      await this.db.run(`INSERT INTO recurring_rules (${fields}) VALUES (${args.map(()=>'?').join(',')})`,args);
    }else{
      await this.db.run(`UPDATE recurring_rules SET ${fields.split(',').map(x=>x+'=?').join(',')} WHERE id=?`,[...args,id]);
    }
  }
  async removeRecurring(id:number):Promise<void>{await this.db.run('DELETE FROM recurring_rules WHERE id=?',[id]);}
  async runDue(until:string):Promise<number>{
    // Most installations contain only inactive/imported templates. Check due
    // rules with one small SQL query BEFORE loading the entire 15k-row ledger.
    const due=await this.rows('SELECT 1 AS due FROM recurring_rules WHERE active=1 AND next_on<=? LIMIT 1',[until]);
    if(!due.length)return 0;
    let total=0;
    const snapshot=await this.read();
    for(const rule of snapshot.recurringRules.filter(x=>x.active)){
      const planned=dueBookings(rule,until);
      if(!planned.bookings.length&&planned.active===rule.active) continue;
      for(const b of planned.bookings) checkBooking(b,snapshot);
      await this.db.beginTransaction();
      try{
        const current=await this.rows('SELECT next_on,runs,active FROM recurring_rules WHERE id=?',[rule.id]);
        if(current.length&&current[0].next_on===rule.nextOn&&current[0].runs===rule.runs&&current[0].active){
          for(const b of planned.bookings){
            await this.db.run(`INSERT INTO bookings (type,account_id,other_account_id,category_id,payee_id,amount_cents,booking_date,note,created_at,recurring_rule_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [b.type,b.accountId,b.otherAccountId,b.categoryId,b.payeeId,b.amountCents,b.date,b.note,new Date().toISOString(),rule.id],false);
          }
          await this.db.run('UPDATE recurring_rules SET next_on=?,runs=?,active=? WHERE id=?',
            [planned.nextOn,planned.runs,planned.active?1:0,rule.id],false);
          total+=planned.bookings.length;
        }
        await this.db.commitTransaction();
      }catch(e){try{await this.db.rollbackTransaction();}catch{}throw e;}
    }
    return total;
  }
  async saveImportReport(report:ImportReport):Promise<void>{
    const reports=prependReport((await this.read()).importReports,report);
    await this.db.beginTransaction();
    try{
      await this.db.run('DELETE FROM import_reports',[],false);
      for(const r of reports)await this.db.run('INSERT INTO import_reports (id,report_json) VALUES (?,?)',[r.id,JSON.stringify(r)],false);
      await this.db.commitTransaction();
    }catch(e){try{await this.db.rollbackTransaction();}catch{}throw e;}
  }
  async replaceAll(snapshot: Snapshot): Promise<void> {
    const checked=validateSnapshot(snapshot);
    // Efficient bounded native bridge batches; all tables change in ONE SQLite transaction.
    // Individual bridge calls per imported record would be prohibitively slow for 15k+ rows.
    await this.db.beginTransaction();
    try {
      for(const table of ['import_reports','recurring_rules','bookings','payees','categories','accounts','app_settings'])
        await this.db.run(`DELETE FROM ${table}`,[],false);
      const batch:Array<{statement:string;values:unknown[]}>=[];
      const put=async(statement:string,values:unknown[])=>{
        batch.push({statement,values});
        if(batch.length>=200) await flush();
      };
      const flush=async()=>{
        if(!batch.length)return;
        const items=batch.splice(0,batch.length);
        await this.db.executeSet(items,false);
      };
      await put("INSERT INTO app_settings (key,value) VALUES ('preferences',?)",[JSON.stringify(checked.settings)]);
      await flush();
      for(const a of checked.accounts) await put('INSERT INTO accounts (id,name,opening_cents) VALUES (?,?,?)',[a.id,a.name,a.openingCents]);
      await flush();
      for(const c of checked.categories) await put('INSERT INTO categories (id,name,kind) VALUES (?,?,?)',[c.id,c.name,c.kind]);
      await flush();
      for(const p of checked.payees) await put('INSERT INTO payees (id,name) VALUES (?,?)',[p.id,p.name]);
      await flush();
      for(const b of checked.bookings) await put(`INSERT INTO bookings
        (id,type,account_id,other_account_id,category_id,payee_id,amount_cents,booking_date,note,created_at,recurring_rule_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [b.id,b.type,b.accountId,b.otherAccountId,b.categoryId,b.payeeId,b.amountCents,b.date,b.note,b.createdAt,b.recurringRuleId??null]);
      await flush();
      for(const r of checked.recurringRules) await put(`INSERT INTO recurring_rules
        (id,title,type,account_id,other_account_id,category_id,payee_id,amount_cents,note,frequency,interval,start_on,next_on,day_of_month,end_on,max_runs,runs,active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [r.id,r.title,r.type,r.accountId,r.otherAccountId,r.categoryId,r.payeeId,r.amountCents,r.note,r.frequency,r.interval,r.startOn,r.nextOn,r.dayOfMonth,r.endOn,r.maxRuns,r.runs,r.active?1:0]);
      await flush();
      for(const r of checked.importReports) await put('INSERT INTO import_reports (id,report_json) VALUES (?,?)',[r.id,JSON.stringify(r)]);
      await flush();
      await this.db.commitTransaction();
    } catch(error){
      try{await this.db.rollbackTransaction();}catch(rollbackError){console.error('SQLite rollback failed',rollbackError);}
      throw error;
    }
  }

}

export async function openStorage(): Promise<Storage> {
  const cap = (window as typeof window & {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor;
  if (cap?.isNativePlatform?.()) {
    const storage = new NativeStorage();
    await storage.init();
    return storage;
  }
  const storage = new BrowserStorage();
  await storage.init();
  return storage;
}
