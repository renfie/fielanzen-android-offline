export const defaultAutoBackup = () => ({ enabled: false, frequency: 'daily', keep: 7, time: '03:00' });
export const defaultSettings = () => ({ defaultAccountId: null, theme: 'system' });
export const emptySnapshot = () => ({ accounts: [], categories: [], payees: [], bookings: [], recurringRules: [], importReports: [], settings: defaultSettings() });
export function parseEuro(input, allowZero = false) {
    // Exact integer cents, no floating-point rounding; optional zero for imported legacy bookings.
    const raw = input.trim().replace(/\s/g, '').replace(/€/g, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized))
        throw new Error('Bitte einen gültigen positiven Euro-Betrag eingeben.');
    const [euros = '', cents = ''] = normalized.split('.');
    const result = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result < 0 || (!allowZero && result === 0))
        throw new Error('Der Betrag muss größer als 0 sein.');
    return result;
}
export function parseSignedEuro(input) {
    const trimmed = input.trim();
    if (trimmed === '' || trimmed === '0' || trimmed === '0,00')
        return 0;
    if (trimmed.startsWith('-'))
        return -parseEuro(trimmed.slice(1));
    return parseEuro(trimmed);
}
export function formatEuro(cents) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
export function accountBalance(s, accountId, asOf) {
    let total = s.accounts.find(a => a.id === accountId)?.openingCents ?? 0;
    for (const b of s.bookings) {
        if (asOf && b.date > asOf)
            continue;
        if (b.accountId === accountId)
            total += b.type === 'income' ? b.amountCents : -b.amountCents;
        if (b.type === 'transfer' && b.otherAccountId === accountId)
            total += b.amountCents;
    }
    return total;
}
export function checkBooking(input, s) {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
        throw new Error('Ungültiger Betrag.');
    const dt = new Date(`${input.date}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(dt.getTime())
        || `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` !== input.date) {
        throw new Error('Ungültiges Datum.');
    }
    if (!s.accounts.some(a => a.id === input.accountId))
        throw new Error('Bitte ein Konto auswählen.');
    if (input.type === 'transfer') {
        if (input.otherAccountId === null || input.accountId === input.otherAccountId || !s.accounts.some(a => a.id === input.otherAccountId))
            throw new Error('Bitte ein anderes Zielkonto auswählen.');
        if (input.categoryId !== null)
            throw new Error('Umbuchungen haben keine Kategorie.');
    }
    else {
        if (input.otherAccountId !== null)
            throw new Error('Nur Umbuchungen haben ein Zielkonto.');
        const category = s.categories.find(c => c.id === input.categoryId);
        if (!category || category.kind !== input.type)
            throw new Error('Bitte eine passende Kategorie auswählen.');
    }
    if (input.payeeId !== null && !s.payees.some(p => p.id === input.payeeId))
        throw new Error('Ungültiger Empfänger.');
    if (input.note.length > 1000)
        throw new Error('Notiz darf höchstens 1.000 Zeichen lang sein.');
}
