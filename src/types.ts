// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {RecurringRule} from './recurring.js';
export type BookingType = 'expense' | 'income' | 'transfer';
export type CategoryKind = 'expense' | 'income';
export interface Account { id: number; name: string; openingCents: number; }
export interface Category { id: number; name: string; kind: CategoryKind; }
export interface Payee { id: number; name: string; }
export type AppTheme = 'system' | 'light' | 'dark';
export type BackupFrequency = 'daily' | 'weekly' | 'monthly';
export interface AutomaticBackupPreferences { enabled:boolean; frequency:BackupFrequency; keep:number; time:string; }
/** Only a future server target is configured. Local SQLite remains authoritative. Never store API keys here. */
export interface DashboardConnection { url:string; }
export interface AppSettings { defaultAccountId: number | null; theme: AppTheme; exportScheduledToFinancisto?:boolean; autoBackup?:AutomaticBackupPreferences; dashboard?:DashboardConnection; }
export const defaultAutoBackup = ():AutomaticBackupPreferences => ({enabled:false,frequency:'daily',keep:7,time:'03:00'});
export const defaultSettings = (): AppSettings => ({defaultAccountId: null, theme: 'system'});
export interface Booking {
  id: number; type: BookingType; accountId: number; otherAccountId: number | null;
  categoryId: number | null; payeeId: number | null; amountCents: number;
  date: string; note: string; createdAt: string; recurringRuleId?:number|null;
}
export type BookingInput = Omit<Booking, 'id' | 'createdAt'>;
export interface ImportGap { id:number; bookingIds:number[]; templateIds:number[]; }
export interface ImportAccountCheck { id:number; name:string; expectedCents:number; actualCents:number; differenceCents:number; }
/** Locally retained audit metadata, also contained in FieLanzen's JSON backups. */
export interface ImportReport {
  id:string; kind:'import'|'analysis'|'inventory'; createdAt:string; sourceFile:string|null;
  counts:{accounts:number; categories:number; payees:number; bookings:number;
    importedTemplates:number|null; skippedTemplates:number|null};
  payeeGaps:ImportGap[]; categoryGaps:ImportGap[];
  zeroBookingIds:number[]; unsupportedTemplateIds:number[]; accountChecks:ImportAccountCheck[];
  notes:string[];
}
export interface Snapshot { accounts: Account[]; categories: Category[]; payees: Payee[]; bookings: Booking[]; recurringRules: RecurringRule[]; importReports: ImportReport[]; settings: AppSettings; }
export const emptySnapshot = (): Snapshot => ({ accounts: [], categories: [], payees: [], bookings: [], recurringRules: [], importReports: [], settings: defaultSettings() });

export function parseEuro(input: string, allowZero = false): number {
  // Exact integer cents, no floating-point rounding; optional zero for imported legacy bookings.
  const raw = input.trim().replace(/\s/g, '').replace(/€/g, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Bitte einen gültigen positiven Euro-Betrag eingeben.');
  const [euros = '', cents = ''] = normalized.split('.');
  const result = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result < 0 || (!allowZero && result === 0)) throw new Error('Der Betrag muss größer als 0 sein.');
  return result;
}
export function parseSignedEuro(input: string): number {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '0' || trimmed === '0,00') return 0;
  if (trimmed.startsWith('-')) return -parseEuro(trimmed.slice(1));
  return parseEuro(trimmed);
}
export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
export function accountBalance(s: Snapshot, accountId: number, asOf?: string): number {
  let total = s.accounts.find(a => a.id === accountId)?.openingCents ?? 0;
  for (const b of s.bookings) {
    if(asOf && b.date>asOf)continue;
    if (b.accountId === accountId) total += b.type === 'income' ? b.amountCents : -b.amountCents;
    if (b.type === 'transfer' && b.otherAccountId === accountId) total += b.amountCents;
  }
  return total;
}
export function checkBooking(input: BookingInput, s: Snapshot): void {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new Error('Ungültiger Betrag.');
  const dt = new Date(`${input.date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(dt.getTime())
    || `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` !== input.date) {
    throw new Error('Ungültiges Datum.');
  }
  if (!s.accounts.some(a => a.id === input.accountId)) throw new Error('Bitte ein Konto auswählen.');
  if (input.type === 'transfer') {
    if (input.otherAccountId === null || input.accountId === input.otherAccountId || !s.accounts.some(a => a.id === input.otherAccountId)) throw new Error('Bitte ein anderes Zielkonto auswählen.');
    if (input.categoryId !== null) throw new Error('Umbuchungen haben keine Kategorie.');
  } else {
    if (input.otherAccountId !== null) throw new Error('Nur Umbuchungen haben ein Zielkonto.');
    const category = s.categories.find(c => c.id === input.categoryId);
    if (!category || category.kind !== input.type) throw new Error('Bitte eine passende Kategorie auswählen.');
  }
  if (input.payeeId !== null && !s.payees.some(p => p.id === input.payeeId)) throw new Error('Ungültiger Empfänger.');
  if (input.note.length > 1000) throw new Error('Notiz darf höchstens 1.000 Zeichen lang sein.');
}
