// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** Validated full-ledger monthly summary, never built from paged server bookings. */
export type MonthCategory={categoryId:number;category:string;amountMinor:number;bookingCount:number};
export type MonthRow={
  month:string;incomeMinor:number;expenseMinor:number;balanceMinor:number;
  bookingCount:number;transferCount:number;transferMinor:number;
  categories:{income:MonthCategory[];expense:MonthCategory[]};
};
export type HistoryHighlight={date:string;amountMinor:number;payee:string;category:string};
export type MonthlyReport={
  currency:string;decimals:number;from:string;to:string;complete:true;months:MonthRow[];
  highlights?:{largestExpense:HistoryHighlight|null;largestIncome:HistoryHighlight|null};
};
export type MonthQuery={from:string;to:string;currency:string;accountId?:number;categoryId?:number};
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const monthPattern=/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/;
const moneyInt=(value:unknown,label:string,negative=false):number=>{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||(!negative&&value<0))
    throw new Error('Ungültiger Monatsbericht: '+label);
  return value;
};
const string=(v:unknown,label:string):string=>{
  if(typeof v!=='string'||v.length>300)throw new Error('Ungültiger Monatsbericht: '+label);
  return v;
};
export function monthIndex(ym:string):number{
  if(!monthPattern.test(ym))throw new Error('Ungültiges Monatformat YYYY-MM.');
  return Number(ym.slice(0,4))*12+Number(ym.slice(5,7))-1;
}
export function monthFromIndex(index:number):string{
  return String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');
}
export function buildMonthlyPath(query:MonthQuery):string{
  const span=monthIndex(query.to)-monthIndex(query.from)+1;
  if(span<1||span>36)throw new Error('Die Historie erlaubt maximal 36 aufeinanderfolgende Monate.');
  if(!/^[A-Z]{3}$/.test(query.currency))throw new Error('Ungültiger Währungscode.');
  const args=new URLSearchParams({from:query.from,to:query.to,currency:query.currency});
  for(const [key,value] of [['account_id',query.accountId],['category_id',query.categoryId]] as const){
    if(value!==undefined){
      if(!Number.isSafeInteger(value)||value<=0)throw new Error('Ungültiger Berichtsfilter.');
      args.set(key,String(value));
    }
  }
  return '/api/mobile/v1/reports/monthly?'+args.toString();
}
export function monthlyReportsCapability(input:unknown):boolean{
  const nested=object(input)&&object(input.capabilities)?input.capabilities:object(input)&&object(input.data)?input.data:input;
  return object(nested)&&object(nested.features)&&nested.features.monthly_reports===true;
}
function highlight(v:unknown):HistoryHighlight|null{
  if(v===null||v===undefined)return null;
  if(!object(v))throw new Error('Ungültiges Historien-Highlight.');
  const date=string(v.date,'Datum');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ungültiges Historien-Datum.');
  return {date,amountMinor:moneyInt(v.amount_minor,'Spitzenbetrag'),
    payee:string(v.payee??'','Empfänger'),category:string(v.category??'','Kategorie')};
}
export function parseMonthlyReport(input:unknown):MonthlyReport{
  if(!object(input)||input.complete!==true||!Array.isArray(input.months))
    throw new Error('Der Server liefert keine vollständige Monatsauswertung.');
  const currency=string(input.currency,'Währung');
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('Ungültige Berichtswährung.');
  const decimals=moneyInt(input.decimals,'Nachkommastellen');
  if(decimals>6)throw new Error('Ungültige Berichtswährung.');
  const from=string(input.from,'Startmonat'),to=string(input.to,'Endmonat');
  const span=monthIndex(to)-monthIndex(from)+1;
  if(span<1||span>36||input.months.length!==span)throw new Error('Monatsbericht hat Lücken oder zu viele Monate.');
  const categories=(value:unknown,kind:string):MonthCategory[]=>{
    if(!Array.isArray(value)||value.length>10000)throw new Error('Ungültige Kategorien im Monatsbericht.');
    return value.map((v:unknown)=>{
      if(!object(v))throw new Error('Ungültige Kategorie im Monatsbericht.');
      return {categoryId:moneyInt(v.category_id,'Kategorie-ID'),category:string(v.category,'Kategoriename'),
        amountMinor:moneyInt(v.amount_minor,kind+'-Betrag'),bookingCount:moneyInt(v.booking_count,'Kategorieanzahl')};
    });
  };
  const months=input.months.map((v:unknown,i:number)=>{
    if(!object(v)||v.month!==monthFromIndex(monthIndex(from)+i)||!object(v.categories))
      throw new Error('Monatsbericht enthält fehlende oder ungeordnete Monate.');
    const incomeMinor=moneyInt(v.income_minor,'Einnahmen');
    const expenseMinor=moneyInt(v.expense_minor,'Ausgaben');
    const balanceMinor=moneyInt(v.balance_minor,'Saldo',true);
    if(incomeMinor-expenseMinor!==balanceMinor)throw new Error('Monatsbericht enthält widersprüchliche Beträge.');
    return {month:v.month as string,incomeMinor,expenseMinor,balanceMinor,
      bookingCount:moneyInt(v.booking_count,'Buchungsanzahl'),
      transferCount:moneyInt(v.transfer_count,'Umbuchungsanzahl'),
      transferMinor:moneyInt(v.transfer_minor,'Umbuchungen'),
      categories:{income:categories(v.categories.income,'Einnahme'),expense:categories(v.categories.expense,'Ausgabe')}} as MonthRow;
  });
  const result:MonthlyReport={currency,decimals,from,to,complete:true,months};
  if(input.highlights!==undefined){
    if(!object(input.highlights))throw new Error('Ungültige Historien-Highlights.');
    result.highlights={largestExpense:highlight(input.highlights.largest_expense),
      largestIncome:highlight(input.highlights.largest_income)};
  }
  return result;
}
