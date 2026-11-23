// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** Optional, explicitly enabled export of FieLanzen recurring rules as Financisto
 * scheduled templates. Importing these rows in Financisto ACTIVATES them.
 * No recurring template is ever counted as a posted ledger booking.
 * Format follows Financisto Recurrence.parse() and RecurrencePattern.updateRRule().
 */
import type {RecurringRule} from './recurring.js';

export interface ScheduledTemplateExport {
  rows:Array<{id:number;fields:Record<string,string>}>;
  exported:number;
  inactiveIncluded:number;
}
const weekday=['SUN','MON','TUE','WED','THR','FRI','SAT'];
const safeDay=(date:string):number=>Date.parse(`${date}T00:00:00Z`);

function recurrence(rule:RecurringRule):string {
  // Start at nextOn, not the historical startOn: no old occurrences are scheduled.
  const stamp=`${rule.nextOn}T12:00:00`;
  let pattern:string;
  switch(rule.frequency){
    case 'daily': pattern=`DAILY:interval@${rule.interval}#`;break;
    case 'weekly': {
      const day=weekday[new Date(safeDay(rule.nextOn)).getUTCDay()];
      pattern=`WEEKLY:days@${day}#interval@${rule.interval}#`;break;
    }
    case 'monthly': {
      // FieLanzen clamps 31 to the last calendar day; Financisto supports LAST-DAY.
      // Days 29/30 cannot be mapped exactly in February without complex RRULEs.
      if(rule.dayOfMonth===29||rule.dayOfMonth===30)
        throw new Error('Monatsregeln am 29./30. haben in Financisto abweichendes Februar-Verhalten.');
      const piece=rule.dayOfMonth===31
        ?'monthly_pattern_params_0@LAST-DAY#monthly_pattern_0@SPECIFIC_DAY#'
        :`monthly_pattern_0@EVERY_NTH_DAY#monthly_pattern_params_0@${rule.dayOfMonth}#`;
      pattern=`MONTHLY:count@1#interval@${rule.interval}#${piece}`;break;
    }
    case 'yearly':
      // Original Financisto has no YEARLY preset, but accepts RFC5545 RRULE in GEEKY.
      if(rule.endOn||rule.maxRuns!==null)
        throw new Error('Begrenzte Jahresregeln können nicht verlustfrei in Financisto übernommen werden.');
      pattern=`GEEKY:interval@FREQ=YEARLY;INTERVAL=${rule.interval}#`;break;
    default: throw new Error('Nicht unterstützter Wiederholungsrhythmus.');
  }
  let period='INDEFINETELY:null'; // Spelling is part of the original format.
  if(rule.endOn&&rule.maxRuns!==null)throw new Error('Regeln mit Ende-Datum und Anzahl gleichzeitig sind in Financisto nicht direkt abbildbar.');
  if(rule.endOn)period=`STOPS_ON_DATE:date@${rule.endOn.replace(/-/g,'')}T000000#`;
  if(rule.maxRuns!==null){
    const left=rule.maxRuns-rule.runs;
    if(left<=0)throw new Error('Eine bereits vollständig ausgeführte Regel hat keine zukünftigen Termine.');
    period=`EXACTLY_TIMES:count@${left}#`;
  }
  if(rule.endOn!==null&&rule.nextOn>rule.endOn)throw new Error('Die Regel liegt nach ihrem Enddatum.');
  return `${stamp}~${pattern}~${period}`;
}

export function scheduledTemplates(rules:RecurringRule[],usedTransactionIds:Set<number>,categoryMap:(categoryId:number|null)=>number):ScheduledTemplateExport {
  const rows:ScheduledTemplateExport['rows']=[];
  let nextId=Math.max(0,...usedTransactionIds);
  let inactiveIncluded=0;
  for(const rule of rules){
    let recur:string;
    try{recur=recurrence(rule);}catch(e){
      // No silent loss: the user must adjust/omit a rule in the app first.
      const reason=e instanceof Error?e.message:'Unbekannter Wiederholungsfehler.';
      throw new Error(`Geplanter Financisto-Export nicht möglich: Regel-ID ${rule.id}: ${reason}`);
    }
    if(!Number.isSafeInteger(nextId+1))throw new Error('Financisto-Export: Keine freie Vorlagen-ID.');
    const id=++nextId;
    const fromAmount=rule.type==='income'?rule.amountCents:-rule.amountCents;
    rows.push({id,fields:{
      _id:String(id),from_account_id:String(rule.accountId),to_account_id:String(rule.otherAccountId??0),
      category_id:String(rule.type==='transfer'?0:categoryMap(rule.categoryId)),
      project_id:'0',location_id:'0',payee_id:String(rule.payeeId??0),
      from_amount:String(fromAmount),to_amount:String(rule.type==='transfer'?-rule.amountCents:0),
      datetime:String(safeDay(rule.nextOn)+12*60*60*1000),note:rule.note||rule.title,
      is_template:'2',template_name:rule.title,recurrence:recur,
      status:'PN',last_recurrence:String(Date.now()),notification_options:'0',is_ccard_payment:'0',
      parent_id:'0',updated_on:'0',original_currency_id:'0',original_from_amount:'0',
      accuracy:'0',latitude:'0',longitude:'0'
    }});
    if(!rule.active)inactiveIncluded++;
  }
  return {rows,exported:rows.length,inactiveIncluded};
}
