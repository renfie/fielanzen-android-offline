export class DashboardApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'DashboardApiError';
    }
}
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v) => typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
function pos(v, label) { const n = int(v); if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error(`Dashboard-Antwort enthält ungültige ${label}.`); return n; }
function nonnegative(v, label) { const n = int(v); if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`Dashboard-Antwort enthält ungültige ${label}.`); return n; }
const label = (v, name) => { if (typeof v !== 'string' || v.length > 1000)
    throw new Error(`Dashboard-Antwort enthält ungültiges ${name}.`); return v; };
const ensureDate = (v) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T12:00:00Z')))
    throw new Error('Ungültiges Buchungsdatum vom Dashboard.'); return v; };
function rows(value, prop) {
    if (Array.isArray(value))
        return value;
    if (obj(value)) {
        for (const option of [prop, 'items', 'results', 'data'])
            if (Array.isArray(value[option]))
                return value[option];
        if (obj(value.data))
            for (const option of [prop, 'items', 'results'])
                if (Array.isArray(value.data[option]))
                    return value.data[option];
    }
    throw new Error(`Dashboard-Antwort enthält keine ${prop}-Liste.`);
}
function account(raw) {
    if (!obj(raw))
        throw new Error('Ungültiges Serverkonto.');
    return { id: pos(raw.id, 'Konto-ID'), name: label(raw.name, 'Kontonamen'), currency: label(raw.currency ?? 'EUR', 'Währung'), symbol: label(raw.symbol ?? '€', 'Währungssymbol'),
        decimals: nonnegative(raw.decimals ?? 2, 'Nachkommastellen'), balanceMinor: int(raw.balance_minor), projectedBalanceMinor: int(raw.projected_balance_minor ?? raw.balance_minor),
        active: raw.active !== false && raw.active !== 0, includedInTotal: raw.included_in_total !== false && raw.included_in_total !== 0 };
}
export function parseAccounts(input) {
    const result = rows(input, 'accounts').map(account);
    for (const a of result)
        if (!Number.isSafeInteger(a.balanceMinor) || !Number.isSafeInteger(a.projectedBalanceMinor) || a.decimals > 6)
            throw new Error('Ungültiger Kontostand oder Währung im Serverergebnis.');
    if (new Set(result.map(a => a.id)).size !== result.length)
        throw new Error('Doppelte Serverkonto-ID.');
    return result;
}
export function parseCategories(input) {
    return rows(input, 'categories').map(r => {
        if (!obj(r))
            throw new Error('Ungültige Serverkategorie.');
        if (r.kind !== 'income' && r.kind !== 'expense')
            throw new Error('Unbekannte Kategorieart vom Server.');
        return { id: pos(r.id, 'Kategorie-ID'), name: label(r.name, 'Kategorienamen'), kind: r.kind };
    });
}
export function parsePayees(input) {
    return rows(input, 'payees').map(r => {
        if (!obj(r))
            throw new Error('Ungültiger Serverempfänger.');
        return { id: pos(r.id, 'Empfänger-ID'), name: label(r.name, 'Empfängernamen') };
    });
}
/** Read-only amounts from the API can be signed (e.g. an expense as -2599).
 * Outgoing writes remain POSITIVE integer minor units and are validated separately.
 * Missing, decimal and unsafe values must fail closed rather than inventing 0. */
export function readBookingAmount(value, kind, bookingId) {
    const n = int(value);
    if (!Number.isSafeInteger(n)) {
        const id = Number.isSafeInteger(int(bookingId)) ? ` #${int(bookingId)}` : '';
        const reason = value === null || value === undefined ? 'fehlt' : 'ist keine ganze Cent-Zahl';
        throw new Error(`Dashboard-Buchung${id}: amount_minor ${reason}. Keine Daten verändert.`);
    }
    if (n === Number.MIN_SAFE_INTEGER)
        throw new Error('Dashboard-Buchungsbetrag außerhalb des Zahlenbereichs.');
    // Expense and transfer amounts are sometimes returned as negative ledger values.
    // Both signs are accepted for reads; NEVER change the category or booking kind.
    void kind;
    return Math.abs(n);
}
export function parseBooking(raw) {
    if (!obj(raw))
        throw new Error('Ungültige Serverbuchung.');
    const kind = raw.kind;
    if (kind !== 'income' && kind !== 'expense' && kind !== 'transfer')
        throw new Error('Unbekannte Buchungsart vom Server.');
    const revision = raw.revision;
    if (!(typeof revision === 'string' || typeof revision === 'number') || String(revision).length > 150 || !String(revision))
        throw new Error('Der Server liefert keine gültige Buchungsrevision. Bearbeitung/Löschen nicht möglich.');
    return { id: pos(raw.id, 'Buchungs-ID'), revision: String(revision), kind,
        date: ensureDate(raw.date), accountId: pos(raw.account_id, 'Buchungskonto'),
        toAccountId: kind === 'transfer' ? pos(raw.to_account_id, 'Umbuchungsziel') : null,
        categoryId: kind === 'transfer' ? 0 : nonnegative(raw.category_id ?? 0, 'Kategorie-ID'),
        // Dashboard may return ledger-signed minor units for expenses/transfers.
        // Preserve the book kind as authority and normalise only the magnitude for UI/editing.
        amountMinor: readBookingAmount(raw.amount_minor, kind, raw.id),
        payeeTitle: typeof (raw.payee_title ?? raw.payee) === 'string' ? label(raw.payee_title ?? raw.payee, 'Empfänger') : '',
        note: typeof raw.note === 'string' ? label(raw.note, 'Notiz') : '',
        ...(raw.is_recurring !== undefined ? { isRecurring: raw.is_recurring === true || raw.is_recurring === 1 } : {}),
        ...(raw.is_rule_matched !== undefined ? { isRuleMatched: raw.is_rule_matched === true || raw.is_rule_matched === 1 } : {}) };
}
export function parseBookings(input) {
    const page = rows(input, 'bookings').map(parseBooking);
    if (page.length > 500)
        throw new Error('Zu viele Buchungen in einer API-Seite.');
    const cursor = obj(input) ? (input.next_before ?? (obj(input.data) ? input.data.next_before : null) ?? null) : null;
    if (cursor !== null && (typeof cursor !== 'string' && typeof cursor !== 'number' || String(cursor).length > 512))
        throw new Error('Ungültiger Paginierungscursor.');
    if (new Set(page.map(x => x.id)).size !== page.length)
        throw new Error('Doppelte Serverbuchungs-ID.');
    return { items: page, nextBefore: cursor === null ? null : String(cursor) };
}
export function parseSession(input) {
    const value = obj(input) && obj(input.session) ? input.session : obj(input) && obj(input.data) ? input.data : input;
    if (!obj(value))
        throw new Error('Die Dashboard-Sitzungsantwort ist ungültig.');
    const financeMode = value.finance_mode;
    if (typeof financeMode !== 'string')
        throw new Error('Der Server nennt keinen finance_mode.');
    const access = typeof value.access === 'string' ? value.access : 'read';
    return { financeMode, access, canWrite: value.can_write === true && financeMode === 'web' && access === 'write' };
}
export function parseCapabilities(input) {
    const value = obj(input) && obj(input.capabilities) ? input.capabilities : obj(input) && obj(input.data) ? input.data : input;
    if (!obj(value))
        return false;
    return value.mobile_api === 1 || value.mobile_api === '1' || value.api_version === 1 || value.api_version === '1' || value.version === 'v1' || value.version === 1;
}
export function validateRemoteDraft(raw, accounts, categories) {
    if (!['income', 'expense', 'transfer'].includes(raw.kind))
        throw new Error('Ungültige Buchungsart.');
    const account = accounts.find(x => x.id === raw.account_id && x.active);
    if (!account)
        throw new Error('Das Quellkonto ist nicht aktiv oder fehlt auf dem Server.');
    const amount = nonnegative(raw.amount_minor, 'Betrag');
    if (amount === 0)
        throw new Error('Betrag muss größer als null sein.');
    const date = ensureDate(raw.date);
    if (raw.kind === 'transfer') {
        if (!accounts.some(x => x.id === raw.to_account_id && x.id !== raw.account_id && x.active))
            throw new Error('Gültiges aktives Zielkonto erforderlich.');
        if (raw.category_id !== 0)
            throw new Error('Umbuchungen dürfen keine Kategorie erhalten.');
    }
    else if (!categories.some(c => c.id === raw.category_id && c.kind === raw.kind))
        throw new Error('Kategorie passt nicht zur Buchungsart.');
    if (raw.payee_title.length > 100 || raw.note.length > 1000)
        throw new Error('Empfänger/Notiz zu lang.');
    const output = { kind: raw.kind, date, account_id: raw.account_id, category_id: raw.category_id, amount_minor: amount,
        payee_title: raw.payee_title.trim(), note: raw.note.trim() };
    if (raw.kind === 'transfer')
        output.to_account_id = raw.to_account_id;
    return output;
}
export function parsePending(input) {
    if (!input)
        return null;
    let p;
    try {
        p = JSON.parse(input);
    }
    catch {
        throw new Error('Gespeicherte Serveroperation ist beschädigt.');
    }
    if (!obj(p) || !['POST', 'PUT', 'DELETE'].includes(String(p.method)) || typeof p.server !== 'string' || typeof p.path !== 'string' ||
        !/^\/api\/mobile\/v1\/bookings(?:\/\d+)?$/.test(p.path) || typeof p.idempotencyKey !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.idempotencyKey))
        throw new Error('Gespeicherte Serveroperation hat ein ungültiges Format.');
    return p;
}
