import { accountBalance } from './types.js';
import { nextDueDate, validDate } from './recurring.js';
import { validateSnapshot } from './backup.js';
const MAX_GZIP = 30 * 1024 * 1024;
const MAX_TEXT = 65 * 1024 * 1024;
const required = {
    account: ['_id', 'title', 'currency_id', 'total_amount'],
    currency: ['_id', 'name', 'decimals'],
    category: ['_id', 'title'],
    transactions: ['_id', 'datetime', 'from_account_id', 'from_amount']
};
function safeNumber(value, label) {
    if (typeof value !== 'string' || !/^-?\d+$/.test(value))
        throw new Error(`Financisto: ungültiges Zahlenfeld ${label}.`);
    const n = Number(value);
    if (!Number.isSafeInteger(n))
        throw new Error(`Financisto: Betrag oder ID in ${label} ist zu groß.`);
    return n;
}
function safeId(value, label) {
    const n = safeNumber(value, label);
    if (n <= 0)
        throw new Error(`Financisto: ungültige ID in ${label}.`);
    return n;
}
function rowRef(rows, id, kind) {
    const r = rows.get(id);
    if (!r)
        throw new Error(`Financisto: unbekannte ${kind}-ID ${id}.`);
    return r;
}
function uniqueName(value, id, used) {
    let base = value.trim().replace(/\s+/g, ' ').slice(0, 100) || `Unbenannt ${id}`;
    let candidate = base;
    for (let n = 0; used.has(candidate.toLocaleLowerCase('de')); n++) {
        const suffix = ` (${id}${n ? '-' + n : ''})`;
        candidate = base.slice(0, 100 - suffix.length) + suffix;
    }
    used.add(candidate.toLocaleLowerCase('de'));
    return candidate;
}
function berlinDate(millis) {
    const d = new Date(millis);
    if (Number.isNaN(d.getTime()))
        throw new Error('Financisto: ungültiges Buchungsdatum.');
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find(p => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}
export async function expandGzip(bytes) {
    if (!bytes.byteLength || bytes.byteLength > MAX_GZIP)
        throw new Error('Financisto-Backup fehlt oder ist größer als 30 MB.');
    const header = new Uint8Array(bytes, 0, 2);
    if (header[0] !== 0x1f || header[1] !== 0x8b)
        throw new Error('Keine gzip-komprimierte Financisto-.backup-Datei.');
    if (typeof DecompressionStream === 'undefined')
        throw new Error('Dieser Browser unterstützt gzip-Import nicht.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    let size = 0;
    const chunks = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > MAX_TEXT) {
                await reader.cancel();
                throw new Error('Entpacktes Backup ist größer als 65 MB.');
            }
            chunks.push(value);
        }
    }
    catch (e) {
        throw e instanceof Error ? e : new Error('Financisto-Backup beschädigt oder unvollständig.');
    }
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(out).replace(/^\uFEFF/, '');
}
export function parseLegacyText(text) {
    const lines = text.split(/\r?\n/);
    while (lines.length && !lines[lines.length - 1].trim())
        lines.pop();
    if (!['PACKAGE:ru.orangesoftware.financisto', 'PACKAGE:tw.tib.financisto'].includes(lines[0] ?? '') || !lines.includes('#START') || lines[lines.length - 1] !== '#END')
        throw new Error('Unbekanntes oder unvollständiges Financisto-Backup-Format.');
    const result = { account: [], currency: [], category: [], payee: [], transactions: [] };
    let row = null;
    let entity = null;
    for (const line of lines) {
        if (line.startsWith('$ENTITY:')) {
            if (row)
                throw new Error('Financisto-Backup enthält nicht abgeschlossene Datensätze.');
            const name = line.slice(8);
            entity = Object.prototype.hasOwnProperty.call(result, name) ? name : null;
            row = {};
        }
        else if (line === '$$') {
            if (row && entity)
                result[entity].push(row);
            row = null;
            entity = null;
        }
        else if (row) {
            const index = line.indexOf(':');
            if (index > 0)
                row[line.slice(0, index)] = line.slice(index + 1);
        }
    }
    if (row)
        throw new Error('Financisto-Backup wurde unvollständig gespeichert.');
    for (const [kind, fields] of Object.entries(required)) {
        for (const r of result[kind])
            for (const field of fields)
                if (!(field in r))
                    throw new Error(`Financisto: fehlendes Feld ${kind}.${field}.`);
    }
    if (!result.account.length)
        throw new Error('Financisto: Konten fehlen.');
    return result;
}
// Optional date makes the future-due calculation deterministic in tests.
export function convertLegacyTables(tables, asOf) {
    const maps = (which) => new Map(tables[which].map(r => [safeId(r._id, which), r]));
    const currencyMap = maps('currency'), accountMap = maps('account'), payeeMap = maps('payee'), categoryMap = maps('category');
    if (accountMap.size !== tables.account.length || currencyMap.size !== tables.currency.length || categoryMap.size !== tables.category.length || payeeMap.size !== tables.payee.length)
        throw new Error('Financisto: doppelte Objekt-IDs im Backup.');
    const accountNames = new Set();
    const accounts = tables.account.map(a => {
        const id = safeId(a._id, 'Konto');
        const currency = rowRef(currencyMap, safeId(a.currency_id, 'Währung'), 'Währung');
        const decimals = safeNumber(currency.decimals, 'Währungs-Nachkommastellen');
        if (decimals !== 2 || !(String(currency.name).toUpperCase() === 'EUR' || String(currency.name).toLowerCase() === 'euro' || currency.symbol === '€'))
            throw new Error(`Konto „${a.title}“ hat keine unterstützte EUR-Währung mit zwei Nachkommastellen. Import abgebrochen.`);
        return { id, name: uniqueName(a.title ?? '', id, accountNames), openingCents: safeNumber(a.total_amount, 'Kontostand') };
    });
    const payeeNames = new Set();
    const payees = tables.payee.map(p => ({
        id: safeId(p._id, 'Empfänger'), name: uniqueName(p.title ?? '', safeId(p._id, 'Empfänger'), payeeNames)
    }));
    const categories = [];
    const catIds = new Map();
    const usedExpense = new Set(), usedIncome = new Set();
    let nextCategoryId = 1;
    function categoryId(original, kind) {
        const key = `${original}:${kind}`;
        const known = catIds.get(key);
        if (known)
            return known;
        const name = original ? rowRef(categoryMap, original, 'Kategorie').title ?? '' : 'Ohne Kategorie';
        const id = nextCategoryId++;
        categories.push({ id, kind, name: uniqueName(name, original || id, kind === 'income' ? usedIncome : usedExpense) });
        catIds.set(key, id);
        return id;
    }
    const originalPayeeIds = new Set(payees.map(p => p.id));
    const originalCategoryIds = new Set(categoryMap.keys());
    const payeeIds = new Set(payees.map(p => p.id));
    const payeeReferences = new Map();
    const categoryReferences = new Map();
    const addRef = (map, key, id) => map.set(key, [...(map.get(key) ?? []), id]);
    const missingPayeeIds = new Set();
    const missingCategoryIds = new Set();
    const ledger = new Map(accounts.map(a => [a.id, 0]));
    const exportedOpening = new Map(accounts.map(a => [a.id, 0]));
    const usedBookings = new Set();
    const bookings = [];
    let skippedTemplates = 0;
    const legacyTemplates = [];
    let affectedPayeeBookings = 0;
    const zeroBookingIds = [];
    for (const row of tables.transactions) {
        const id = safeId(row._id, 'Buchung');
        if (usedBookings.has(id))
            throw new Error(`Financisto: doppelte Buchungs-ID ${id}.`);
        usedBookings.add(id);
        if (row.is_template && row.is_template !== '0') {
            legacyTemplates.push(row);
            continue;
        }
        const amount = safeNumber(row.from_amount, 'Buchungsbetrag');
        // FieLanzen's standalone export represents openingCents as an actual
        // transaction for Financisto's post-import balance recalculation. Its
        // marker is removed as an unknown column by the original Android importer.
        // Only our own importer reconstructs it as an opening balance rather than
        // showing an extra user booking after a round trip.
        if (row.fielanzen_opening_balance === '1') {
            const from = safeId(row.from_account_id, 'Anfangsbestandskonto');
            if (!accountMap.has(from) || Number(row.to_account_id ?? '0') !== 0 ||
                Number(row.category_id ?? '0') !== 0 || Number(row.payee_id ?? '0') !== 0 ||
                row.is_template && row.is_template !== '0')
                throw new Error(`Financisto: ungültiger FieLanzen-Anfangsbestand ${id}.`);
            const next = exportedOpening.get(from) + amount;
            if (!Number.isSafeInteger(next))
                throw new Error('Financisto: Anfangsbestand zu groß.');
            exportedOpening.set(from, next);
            ledger.set(from, ledger.get(from) + amount);
            continue;
        }
        // Original Financisto may contain zero-value entries (notes, reconciliations or
        // other informational records). Keep them in the imported ledger rather than
        // silently discarding them. A zero does not change account balances.
        // Its sign cannot identify income vs expense; use the expense category for a
        // zero without a target account and warn prominently in the preview.
        if (amount === 0)
            zeroBookingIds.push(id);
        const from = safeId(row.from_account_id, 'Quellkonto');
        if (!accountMap.has(from))
            throw new Error(`Financisto: Quellkonto von Buchung ${id} fehlt.`);
        const to = row.to_account_id ? safeNumber(row.to_account_id, 'Zielkonto') : 0;
        if (to && !accountMap.has(to))
            throw new Error(`Financisto: Zielkonto von Buchung ${id} fehlt.`);
        if (to === from)
            throw new Error(`Financisto: Umbuchung ${id} auf dasselbe Konto.`);
        if (to && amount > 0)
            throw new Error(`Financisto: ungewöhnliche Umbuchung ${id} mit positivem Quellbetrag; manuelle Prüfung nötig.`);
        const dateMillis = safeNumber(row.datetime, 'Buchungsdatum');
        const type = to ? 'transfer' : amount > 0 ? 'income' : 'expense';
        const rawPayeeId = row.payee_id ? safeNumber(row.payee_id, 'Empfänger') : 0;
        const payeeId = rawPayeeId > 0 ? rawPayeeId : 0;
        // Real Financisto backups may retain references to deleted payees.
        // Keep the reference as an explicitly labelled placeholder, not a silent data loss.
        if (payeeId > 0 && !payeeIds.has(payeeId)) {
            const name = uniqueName(`Unbekannter Empfänger (ID ${payeeId})`, payeeId, payeeNames);
            payees.push({ id: payeeId, name });
            payeeIds.add(payeeId);
            missingPayeeIds.add(payeeId);
        }
        if (payeeId > 0 && missingPayeeIds.has(payeeId))
            affectedPayeeBookings++;
        if (payeeId > 0 && !originalPayeeIds.has(payeeId))
            addRef(payeeReferences, payeeId, id);
        const rawCatNumber = row.category_id ? safeNumber(row.category_id, 'Kategorie') : 0;
        const rawCat = rawCatNumber > 0 ? rawCatNumber : 0;
        if (rawCat && !categoryMap.has(rawCat) && type !== 'transfer') {
            // Deleted categories are possible too. Keep bookings and expose the missing
            // label in the preview; never invent a supposedly original category name.
            categoryMap.set(rawCat, { _id: String(rawCat), title: `Unbekannte Kategorie (ID ${rawCat})` });
            missingCategoryIds.add(rawCat);
        }
        if (rawCat > 0 && !originalCategoryIds.has(rawCat) && type !== 'transfer')
            addRef(categoryReferences, rawCat, id);
        if ((row.note ?? '').length > 1000)
            throw new Error(`Financisto: Notiz in Buchung ${id} ist länger als 1.000 Zeichen.`);
        const abs = Math.abs(amount);
        ledger.set(from, ledger.get(from) + amount);
        if (to)
            ledger.set(to, ledger.get(to) + abs);
        bookings.push({ id, type, accountId: from, otherAccountId: to || null,
            categoryId: type === 'transfer' ? null : categoryId(rawCat, type), payeeId: payeeId || null, amountCents: abs,
            date: berlinDate(dateMillis), note: row.note ?? '', createdAt: new Date(dateMillis).toISOString() });
    }
    // A valid first-use export may contain accounts but no bookings yet.
    for (const acc of accounts) {
        acc.openingCents -= ledger.get(acc.id);
        acc.openingCents += exportedOpening.get(acc.id);
        if (!Number.isSafeInteger(acc.openingCents))
            throw new Error('Financisto: Anfangsbestand ist außerhalb des unterstützten Zahlenbereichs.');
    }
    // The legacy app represents recurring templates as transaction records with
    // is_template=2 and a recurrence string. Never turn these into ledger bookings.
    // Only a known simple monthly recurrence is mapped; unrecognized formats are
    // reported as skipped and never guessed. Imported rules are ALWAYS inactive.
    const recurringRules = [];
    const unsupportedTemplates = [];
    const anchorDate = asOf ?? (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    if (!validDate(anchorDate))
        throw new Error('Ungültiger Referenztag für den Import.');
    for (const item of legacyTemplates) {
        const templateId = safeId(item._id, 'Vorlage');
        const raw = item.recurrence ?? '';
        const head = /^(\d{4}-\d{2}-\d{2})T[^~]*~MONTHLY:([^~]*)~INDEFINETELY:null$/.exec(raw);
        if (item.is_template !== '2' || !head || !validDate(head[1])) {
            unsupportedTemplates.push(templateId);
            continue;
        }
        const props = new Map([...head[2].matchAll(/([a-zA-Z0-9_]+)@([^#]+)/g)].map(x => [x[1], x[2]]));
        const day = Number(props.get('monthly_pattern_params_0'));
        const interval = Number(props.get('interval') ?? '1');
        const startOn = head[1];
        if (props.get('monthly_pattern_0') !== 'EVERY_NTH_DAY' || props.get('count') !== '1'
            || !Number.isInteger(interval) || interval < 1 || interval > 120
            || !Number.isInteger(day) || day < 1 || day > 31 || day !== Number(startOn.slice(-2))) {
            unsupportedTemplates.push(templateId);
            continue;
        }
        const from = Number(item.from_account_id ?? 0), to = Number(item.to_account_id ?? 0), amount = Number(item.from_amount ?? '');
        if (!Number.isSafeInteger(amount) || amount === 0 || !accountMap.has(from) ||
            (to !== 0 && (!accountMap.has(to) || to === from || amount >= 0))) {
            unsupportedTemplates.push(templateId);
            continue;
        }
        const type = to ? 'transfer' : amount > 0 ? 'income' : 'expense';
        const rawCat = Number(item.category_id ?? 0), payeeId = Number(item.payee_id ?? 0);
        if (!Number.isSafeInteger(rawCat) || rawCat < 0 || !Number.isSafeInteger(payeeId) || payeeId < 0) {
            unsupportedTemplates.push(templateId);
            continue;
        }
        if (payeeId && !payeeIds.has(payeeId)) {
            payees.push({ id: payeeId, name: uniqueName(`Unbekannter Empfänger (ID ${payeeId})`, payeeId, payeeNames) });
            payeeIds.add(payeeId);
            missingPayeeIds.add(payeeId);
        }
        if (rawCat && !categoryMap.has(rawCat) && type !== 'transfer') {
            categoryMap.set(rawCat, { _id: String(rawCat), title: `Unbekannte Kategorie (ID ${rawCat})` });
            missingCategoryIds.add(rawCat);
        }
        const note = (item.note ?? '').slice(0, 1000);
        const payeeName = payees.find(p => p.id === payeeId)?.name;
        const title = `Financisto #${templateId}: ${payeeName || note || 'Vorlage'}`.slice(0, 100);
        let nextOn = startOn;
        try {
            // Imported templates must not cause historical catch-up postings if enabled
            // later; start at the first recurrence on/after the day of import.
            for (let i = 0; nextOn < anchorDate && i < 4000; i++)
                nextOn = nextDueDate({ frequency: 'monthly', interval, dayOfMonth: day }, nextOn);
            if (nextOn < anchorDate) {
                unsupportedTemplates.push(templateId);
                continue;
            }
            const rule = { id: templateId, title, type, accountId: from, otherAccountId: to || null,
                categoryId: to ? null : categoryId(rawCat, type === 'income' ? 'income' : 'expense'), payeeId: payeeId || null,
                amountCents: Math.abs(amount), note, frequency: 'monthly', interval, startOn, nextOn,
                dayOfMonth: day, endOn: null, maxRuns: null, runs: 0, active: false };
            recurringRules.push(rule);
        }
        catch {
            unsupportedTemplates.push(templateId);
        }
    }
    skippedTemplates = unsupportedTemplates.length;
    // Include references from *all* templates, including unsupported ones; do not
    // claim these templates were imported as ledger transactions.
    const templatePayeeReferences = new Map();
    const templateCategoryReferences = new Map();
    for (const tmpl of legacyTemplates) {
        const id = safeId(tmpl._id, 'Vorlage');
        const payee = tmpl.payee_id ? safeNumber(tmpl.payee_id, 'Vorlagenempfänger') : 0;
        const cat = tmpl.category_id ? safeNumber(tmpl.category_id, 'Vorlagenkategorie') : 0;
        if (payee > 0 && !originalPayeeIds.has(payee))
            addRef(templatePayeeReferences, payee, id);
        if (cat > 0 && !originalCategoryIds.has(cat))
            addRef(templateCategoryReferences, cat, id);
    }
    const combineGaps = (book, tpl) => [...new Set([...book.keys(), ...tpl.keys()])].sort((a, b) => a - b).map(id => ({
        id, bookingIds: (book.get(id) ?? []).sort((a, b) => a - b), templateIds: (tpl.get(id) ?? []).sort((a, b) => a - b)
    }));
    const payeeGaps = combineGaps(payeeReferences, templatePayeeReferences);
    const categoryGaps = combineGaps(categoryReferences, templateCategoryReferences);
    const snapshot = validateSnapshot({ accounts, categories, payees, bookings, recurringRules });
    const accountChecks = snapshot.accounts.map(a => {
        const actualCents = accountBalance(snapshot, a.id);
        const expectedCents = safeNumber(rowRef(accountMap, a.id, 'Konto').total_amount, 'Kontostand');
        return { id: a.id, name: a.name, expectedCents, actualCents, differenceCents: actualCents - expectedCents };
    });
    if (accountChecks.some(x => x.differenceCents !== 0))
        throw new Error('Financisto: Kontostandsabgleich fehlgeschlagen. Keine Daten übernommen.');
    const notes = ['Anfangsbestände aus Financisto-Kontoständen und importierten Buchungen rückgerechnet; die Salden stimmen rechnerisch mit dem Backup überein.',
        `${recurringRules.length} wiederkehrende Vorlage(n) übernommen, alle deaktiviert. Vor einer Aktivierung manuell prüfen; es werden keine historischen Termine automatisch nachgebucht.`];
    if (zeroBookingIds.length)
        notes.push(`Hinweis: ${zeroBookingIds.length} Nullbuchung${zeroBookingIds.length === 1 ? '' : 'en'} mit 0,00 € werden mit Original-ID, Datum, Kategorie, Empfänger und Notiz übernommen (keine Saldoänderung). Ohne Zielkonto ist die Buchungsart mangels Vorzeichen als Ausgabe eingeordnet. IDs: ${zeroBookingIds.slice(0, 20).join(', ')}${zeroBookingIds.length > 20 ? ' …' : ''}. Bitte nach dem Import prüfen.`);
    if (missingPayeeIds.size)
        notes.push(`Hinweis: ${missingPayeeIds.size} verschiedene im Backup nicht enthaltene Empfänger-IDs (möglicherweise früher gelöscht), in ${affectedPayeeBookings} Buchungen referenziert, wurden mit Platzhaltern erhalten (weitere Referenzen in Vorlagen möglich). Betroffene IDs: ${[...missingPayeeIds].slice(0, 12).join(', ')}${missingPayeeIds.size > 12 ? ' …' : ''}. Bitte nach dem Import prüfen.`);
    if (missingCategoryIds.size)
        notes.push(`Hinweis: ${missingCategoryIds.size} im Backup nicht enthaltene Kategorien wurden als „Unbekannte Kategorie (ID …)“ angelegt. Betroffene IDs: ${[...missingCategoryIds].slice(0, 12).join(', ')}${missingCategoryIds.size > 12 ? ' …' : ''}. Bitte nach dem Import prüfen.`);
    if (skippedTemplates)
        notes.push(`Hinweis: ${skippedTemplates} wiederkehrende Vorlagen haben ein nicht unterstütztes oder unvollständiges Wiederholungsformat und wurden NICHT übernommen (IDs: ${unsupportedTemplates.slice(0, 15).join(', ')}${skippedTemplates > 15 ? ' …' : ''}).`);
    return { snapshot, notes, skippedTemplates, importedTemplates: recurringRules.length, accountChecks, missingPayeeIds: payeeGaps.length, affectedPayeeBookings, payeeGaps, categoryGaps, zeroBookingIds, unsupportedTemplateIds: unsupportedTemplates };
}
export async function importFinancistoFile(file) {
    if (file.size > MAX_GZIP)
        throw new Error('Financisto-Backup größer als 30 MB.');
    return convertLegacyTables(parseLegacyText(await expandGzip(await file.arrayBuffer())));
}
