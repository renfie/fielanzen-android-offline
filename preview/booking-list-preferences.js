export const DEFAULT_BOOKING_LIST = { pageSize: 30, sort: 'newest' };
const STORAGE_KEY = 'fielanzen-booking-list-v1';
export function validatedBookingList(value) {
    if (!value || typeof value !== 'object')
        return { ...DEFAULT_BOOKING_LIST };
    const input = value;
    return {
        pageSize: input.pageSize === 30 || input.pageSize === 50 || input.pageSize === 100 ? input.pageSize : 30,
        sort: input.sort === 'oldest' || input.sort === 'amount-desc' || input.sort === 'amount-asc' ? input.sort : 'newest'
    };
}
export function readBookingList() {
    try {
        return validatedBookingList(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    }
    catch {
        return { ...DEFAULT_BOOKING_LIST };
    }
}
export function saveBookingList(prefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validatedBookingList(prefs)));
}
export function bookingListSettingsHtml(prefs) {
    const size = prefs.pageSize, sort = prefs.sort;
    return `<section class="card"><h2>Buchungsliste</h2><div class="form-grid">
    <label class="field">Datensätze pro Anzeige<select id="booking-list-size"><option value="30" ${size === 30 ? 'selected' : ''}>30 Buchungen</option><option value="50" ${size === 50 ? 'selected' : ''}>50 Buchungen</option><option value="100" ${size === 100 ? 'selected' : ''}>100 Buchungen</option></select></label>
    <label class="field">Standardsortierung<select id="booking-list-sort"><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Datum: neueste zuerst</option><option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Datum: älteste zuerst</option><option value="amount-desc" ${sort === 'amount-desc' ? 'selected' : ''}>Betrag: höchster zuerst</option><option value="amount-asc" ${sort === 'amount-asc' ? 'selected' : ''}>Betrag: niedrigster zuerst</option></select></label>
  </div><p class="muted small">Gilt für die lokale und die Serveransicht auf diesem Gerät. Im Servermodus werden nur bereits geladene Buchungen sortiert; weitere Daten kannst du nachladen.</p></section>`;
}
export function sortTransactionRows(items, sort, amount) {
    return [...items].sort((a, b) => {
        const byDate = sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
        if (sort === 'newest' || sort === 'oldest')
            return byDate || (sort === 'oldest' ? a.id - b.id : b.id - a.id);
        const byAmount = amount(a) - amount(b);
        return (sort === 'amount-asc' ? byAmount : -byAmount) || b.date.localeCompare(a.date) || b.id - a.id;
    });
}
