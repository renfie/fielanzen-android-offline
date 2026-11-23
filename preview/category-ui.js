const norm = (s) => s.trim().toLocaleLowerCase('de');
export function filterManagedCategories(categories, search, kind = 'all') {
    const q = norm(search);
    return categories.filter(c => (kind === 'all' || c.kind === kind) && (norm(c.name).includes(q) || String(c.id).includes(q)))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'de'));
}
export function categorySuggestions(categories, kind, search, usage, limit = 8) {
    const q = norm(search);
    return categories.filter(c => c.kind === kind && norm(c.name).includes(q))
        .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'de'))
        .slice(0, Math.max(0, limit));
}
