import { validateRule } from './recurring.js';
import { validateImportReports } from './import-report.js';
import { defaultSettings } from './types.js';
import { checkBooking } from './types.js';
/** FieLanzen's own portable JSON format. NOT a Financisto .backup file. */
export const BACKUP_FORMAT = 'fielanzen-offline';
export const BACKUP_SCHEMA = 4;
const record = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const safeId = (id) => Number.isSafeInteger(id) && Number(id) > 0;
const safeCents = (cents) => Number.isSafeInteger(cents);
const shortName = (name) => typeof name === 'string' && name.length <= 100 && name.trim().length > 0;
const idOrNull = (n) => n === null || safeId(n);
function assert(condition, reason) { if (!condition)
    throw new Error(`Sicherung ungültig: ${reason}`); }
function checkUnique(rows, kind) {
    const ids = new Set();
    const names = new Set();
    for (const row of rows) {
        assert(!ids.has(row.id), `${kind}: doppelte ID ${row.id}`);
        ids.add(row.id);
        const k = row.name.trim().toLocaleLowerCase('de');
        assert(!names.has(k), `${kind}: doppelter Name ${row.name}`);
        names.add(k);
    }
}
/** Validate app preferences from imported backups and native/local stores. */
export function validateSettings(raw, accounts) {
    if (raw === undefined || raw === null)
        return defaultSettings();
    assert(record(raw), 'Einstellungen sind ungültig');
    assert(raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system', 'Darstellung ist ungültig');
    assert(raw.defaultAccountId === null || (safeId(raw.defaultAccountId) && accounts.some(a => a.id === raw.defaultAccountId)), 'Standardkonto ist ungültig');
    const settings = { defaultAccountId: raw.defaultAccountId, theme: raw.theme };
    if (raw.exportScheduledToFinancisto !== undefined) {
        assert(typeof raw.exportScheduledToFinancisto === 'boolean', 'Financisto-Terminexport ist ungültig');
        settings.exportScheduledToFinancisto = raw.exportScheduledToFinancisto;
    }
    if (raw.autoBackup !== undefined) {
        const b = raw.autoBackup;
        assert(record(b) && typeof b.enabled === 'boolean' && (b.frequency === 'daily' || b.frequency === 'weekly' || b.frequency === 'monthly')
            && Number.isSafeInteger(b.keep) && Number(b.keep) >= 1 && Number(b.keep) <= 50, 'automatische Sicherung ist ungültig');
        const time = b.time === undefined ? '03:00' : b.time;
        assert(typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Sicherungszeit ist ungültig');
        settings.autoBackup = { enabled: b.enabled, frequency: b.frequency, keep: b.keep, time };
    }
    if (raw.dashboard !== undefined) {
        assert(record(raw.dashboard) && typeof raw.dashboard.url === 'string' && raw.dashboard.url.length <= 250, 'Server-Konfiguration ungültig');
        const url = raw.dashboard.url.trim();
        if (url) {
            assert(/^https:\/\/[^\s/?#]+(?:\:[0-9]{1,5})?\/?$/i.test(url) && !url.includes('@'), 'Nur HTTPS-Serveradressen ohne Zugangsdaten erlaubt');
            settings.dashboard = { url: url.replace(/\/$/, '') };
        }
    }
    return settings;
}
/** Validate untrusted JSON and return only known typed properties. */
export function validateSnapshot(raw) {
    assert(record(raw), 'Daten fehlen');
    const { accounts: rawAccounts, categories: rawCategories, payees: rawPayees, bookings: rawBookings } = raw;
    assert(Array.isArray(rawAccounts) && rawAccounts.length <= 10000, 'Konten fehlen oder Anzahl zu groß');
    assert(Array.isArray(rawCategories) && rawCategories.length <= 100000, 'Kategorien fehlen oder Anzahl zu groß');
    assert(Array.isArray(rawPayees) && rawPayees.length <= 100000, 'Empfänger fehlen oder Anzahl zu groß');
    assert(Array.isArray(rawBookings) && rawBookings.length <= 500000, 'Buchungen fehlen oder Anzahl zu groß');
    const accounts = rawAccounts.map((v) => {
        assert(record(v) && safeId(v.id) && shortName(v.name) && safeCents(v.openingCents), 'ungültiges Konto');
        return { id: v.id, name: v.name.trim(), openingCents: v.openingCents };
    });
    checkUnique(accounts, 'Konten');
    const categories = rawCategories.map((v) => {
        assert(record(v) && safeId(v.id) && shortName(v.name) && (v.kind === 'expense' || v.kind === 'income'), 'ungültige Kategorie');
        return { id: v.id, name: v.name.trim(), kind: v.kind };
    });
    checkUnique(categories.filter(x => x.kind === 'expense'), 'Ausgabekategorien');
    checkUnique(categories.filter(x => x.kind === 'income'), 'Einnahmekategorien');
    assert(new Set(categories.map(c => c.id)).size === categories.length, 'doppelte Kategorie-ID');
    const payees = rawPayees.map((v) => {
        assert(record(v) && safeId(v.id) && shortName(v.name), 'ungültiger Empfänger');
        return { id: v.id, name: v.name.trim() };
    });
    checkUnique(payees, 'Empfänger');
    const s = { accounts, categories, payees, bookings: [], recurringRules: [], importReports: [], settings: defaultSettings() };
    const seen = new Set();
    const bookings = rawBookings.map((v) => {
        assert(record(v) && safeId(v.id) && !seen.has(v.id), 'ungültige oder doppelte Buchungs-ID');
        seen.add(v.id);
        assert(v.type === 'expense' || v.type === 'income' || v.type === 'transfer', 'ungültige Buchungsart');
        assert(safeId(v.accountId) && idOrNull(v.otherAccountId) && idOrNull(v.categoryId) && idOrNull(v.payeeId)
            && safeCents(v.amountCents) && typeof v.date === 'string' && typeof v.note === 'string' && typeof v.createdAt === 'string'
            && v.createdAt.length <= 60 && !Number.isNaN(Date.parse(v.createdAt)), 'ungültige Buchungsdaten');
        const b = {
            id: v.id, type: v.type, accountId: v.accountId,
            otherAccountId: v.otherAccountId, categoryId: v.categoryId,
            payeeId: v.payeeId, amountCents: v.amountCents,
            date: v.date, note: v.note, createdAt: v.createdAt
        };
        checkBooking(b, s);
        return b;
    });
    const rulesRaw = raw.recurringRules ?? [];
    assert(Array.isArray(rulesRaw) && rulesRaw.length <= 10000, 'Wiederholungsregeln ungültig');
    const recurringRules = rulesRaw.map((v) => {
        assert(record(v), 'ungültige Wiederholungsregel');
        const rule = {
            id: v.id, title: v.title, type: v.type, accountId: v.accountId,
            otherAccountId: v.otherAccountId, categoryId: v.categoryId, payeeId: v.payeeId,
            amountCents: v.amountCents, note: v.note, frequency: v.frequency,
            interval: v.interval, startOn: v.startOn, nextOn: v.nextOn,
            dayOfMonth: v.dayOfMonth, endOn: v.endOn, maxRuns: v.maxRuns,
            runs: v.runs, active: v.active
        };
        validateRule(rule, { ...s, bookings });
        return rule;
    });
    assert(new Set(recurringRules.map(r => r.id)).size === recurringRules.length, 'doppelte Wiederholungsregel-ID');
    const importReports = validateImportReports(raw.importReports ?? []);
    return { ...s, bookings, recurringRules, importReports, settings: validateSettings(raw.settings, accounts) };
}
export function exportBackup(snapshot) {
    const checked = validateSnapshot(snapshot);
    return JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA, exportedAt: new Date().toISOString(), data: checked }, null, 2);
}
export function parseBackup(source) {
    let parsed;
    try {
        parsed = JSON.parse(source);
    }
    catch {
        throw new Error('Keine gültige JSON-Sicherungsdatei.');
    }
    assert(record(parsed), 'Dateiformat ist falsch');
    assert(parsed.format === BACKUP_FORMAT, 'kein FieLanzen-Offline-Backup; Financisto-.backup wird später separat unterstützt');
    assert(parsed.schemaVersion === 1 || parsed.schemaVersion === 2 || parsed.schemaVersion === 3 || parsed.schemaVersion === BACKUP_SCHEMA, 'unbekannte Sicherungsversion');
    assert(typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt)), 'Exportdatum fehlt');
    return { snapshot: validateSnapshot(parsed.data), exportedAt: parsed.exportedAt };
}
