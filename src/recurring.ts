// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {BookingInput, BookingType, Snapshot} from './types.js';
import {checkBooking} from './types.js';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface RecurringRule {
  id: number;
  title: string;
  type: BookingType;
  accountId: number;
  otherAccountId: number | null;
  categoryId: number | null;
  payeeId: number | null;
  amountCents: number;
  note: string;
  frequency: Frequency;
  interval: number;
  startOn: string;
  nextOn: string;
  dayOfMonth: number;
  endOn: string | null;
  maxRuns: number | null;
  runs: number;
  active: boolean;
}
export type RecurringInput = Omit<RecurringRule, 'id' | 'nextOn' | 'runs'>;

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function addDays(s: string, days: number): string {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function plusMonths(s: string, months: number, day: number): string {
  const [year, month] = s.split('-').map(Number) as [number, number, number];
  const index = year * 12 + month - 1 + months;
  const y = Math.floor(index/12), m = index%12 + 1;
  if (y > 9999) throw new Error('Wiederholung liegt außerhalb des Kalenderbereichs.');
  const last = new Date(Date.UTC(y,m,0)).getUTCDate();
  return `${y.toString().padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function nextDueDate(rule: Pick<RecurringRule,'frequency'|'interval'|'dayOfMonth'>, due: string): string {
  switch(rule.frequency){
    case 'daily': return addDays(due,rule.interval);
    case 'weekly': return addDays(due,rule.interval*7);
    case 'monthly': return plusMonths(due,rule.interval,rule.dayOfMonth);
    case 'yearly': return plusMonths(due,rule.interval*12,rule.dayOfMonth);
  }
}
export function checkRecurring(input: RecurringInput, snapshot: Snapshot): void {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Wiederkehrende Buchungen benötigen einen Betrag größer als 0.');
  if (!input.title.trim() || input.title.length > 100) throw new Error('Bezeichnung der Regel muss 1 bis 100 Zeichen lang sein.');
  if (!['daily','weekly','monthly','yearly'].includes(input.frequency) || !Number.isInteger(input.interval) || input.interval < 1 || input.interval > 120)
    throw new Error('Ungültiger Wiederholungsrhythmus.');
  if (!validDate(input.startOn) || !Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31 || input.dayOfMonth !== Number(input.startOn.slice(-2)))
    throw new Error('Ungültiges Startdatum.');
  if (input.endOn !== null && (!validDate(input.endOn) || input.endOn < input.startOn)) throw new Error('Ungültiges Enddatum.');
  if (input.maxRuns !== null && (!Number.isInteger(input.maxRuns) || input.maxRuns < 1 || input.maxRuns > 100000)) throw new Error('Ungültige Höchstzahl an Buchungen.');
  checkBooking({type:input.type,accountId:input.accountId,otherAccountId:input.otherAccountId,
    categoryId:input.categoryId,payeeId:input.payeeId,amountCents:input.amountCents,date:input.startOn,note:input.note},snapshot);
}
export function validateRule(rule: RecurringRule, snapshot: Snapshot): void {
  if (!Number.isSafeInteger(rule.id) || rule.id < 1 || !Number.isSafeInteger(rule.runs) || rule.runs < 0 || typeof rule.active !== 'boolean' || !validDate(rule.nextOn) || rule.nextOn < rule.startOn)
    throw new Error('Ungültige Wiederholungsregel.');
  checkRecurring(rule,snapshot);
  if (rule.maxRuns !== null && rule.runs > rule.maxRuns) throw new Error('Anzahl ausgeführter Wiederholungen ist größer als das Limit.');
}
export function dueBookings(rule: RecurringRule, until: string, limit = 36): {bookings:BookingInput[]; nextOn:string; runs:number; active:boolean} {
  if (!validDate(until)) throw new Error('Ungültiges Ausführungsdatum.');
  const bookings: BookingInput[] = [];
  let nextOn = rule.nextOn, runs=rule.runs, active=rule.active;
  while (active && nextOn <= until && bookings.length < limit) {
    if ((rule.endOn && nextOn > rule.endOn) || (rule.maxRuns !== null && runs >= rule.maxRuns)) {active=false;break;}
    bookings.push({type:rule.type,accountId:rule.accountId,otherAccountId:rule.otherAccountId,
      categoryId:rule.categoryId,payeeId:rule.payeeId,amountCents:rule.amountCents,date:nextOn,note:rule.note,recurringRuleId:rule.id});
    nextOn=nextDueDate(rule,nextOn);
    runs++;
    if ((rule.endOn && nextOn > rule.endOn) || (rule.maxRuns !== null && runs >= rule.maxRuns)) active=false;
  }
  return {bookings,nextOn,runs,active};
}
