const required = {
    currency: ['_id', 'name', 'title', 'symbol'],
    account: ['_id', 'title', 'creation_date', 'currency_id', 'total_amount'],
    category: ['_id', 'title', 'left', 'right'],
    payee: ['_id', 'title'],
    transactions: ['_id', 'from_account_id', 'to_account_id', 'from_amount', 'to_amount', 'datetime']
};
const integers = {
    currency: ['_id'], account: ['_id', 'currency_id', 'total_amount', 'creation_date'],
    category: ['_id', 'left', 'right'], payee: ['_id'],
    transactions: ['_id', 'from_account_id', 'to_account_id', 'from_amount', 'to_amount', 'datetime']
};
export function auditOriginalFinancisto(plain) {
    const lines = plain.split(/\r?\n/);
    if (lines[0] !== 'PACKAGE:ru.orangesoftware.financisto' ||
        !lines.some(s => /^VERSION_CODE:\d+$/.test(s)) ||
        !lines.some(s => /^VERSION_NAME:\d+\.\d+\.\d+/.test(s)) ||
        !lines.some(s => /^DATABASE_VERSION:\d+$/.test(s)) ||
        !lines.includes('FIELANZEN_EXPORTER_VERSION:20') ||
        !lines.includes('#START') || lines.filter(x => x === '#END').length !== 1 || lines.filter(x => x === '#START').length !== 1)
        throw new Error('Financisto-Sicherung: Dateikopf oder Exportversion fehlt. Veraltete Sicherungsdatei abgelehnt.');
    const result = { accounts: 0, currency: 0, categories: 0, payees: 0, transactions: 0 };
    const seen = new Map();
    let kind = '';
    let fields = {};
    let inBlock = false;
    function check() {
        const needed = required[kind];
        if (!needed)
            return;
        for (const name of needed)
            if (!(name in fields) || fields[name] === '')
                throw new Error(`Financisto-Sicherung: Pflichtfeld ${kind}.${name} fehlt.`);
        for (const name of integers[kind] ?? [])
            if (!/^-?\d+$/.test(fields[name] ?? '') || !Number.isSafeInteger(Number(fields[name])))
                throw new Error(`Financisto-Sicherung: ungültige Zahl in ${kind}.${name}.`);
        const id = Number(fields._id);
        if (id <= 0)
            throw new Error('Financisto-Sicherung: ungültige Datensatz-ID.');
        const set = seen.get(kind) ?? new Set();
        if (set.has(id))
            throw new Error('Financisto-Sicherung: doppelte Datensatz-ID.');
        set.add(id);
        seen.set(kind, set);
        if (kind === 'currency') {
            if (fields.name === 'EUR' && (fields.decimal_separator !== "','" || fields.group_separator !== "'.'" || fields.decimals !== '2'))
                throw new Error('Financisto-Sicherung: EUR-Trennzeichen müssen im Legacy-Format gequotet sein.');
            result.currency++;
        }
        if (kind === 'account') {
            result.accounts++;
        }
        if (kind === 'category')
            result.categories++;
        if (kind === 'payee')
            result.payees++;
        if (kind === 'transactions')
            result.transactions++;
    }
    for (const line of lines) {
        if (line.startsWith('$ENTITY:')) {
            if (inBlock)
                throw new Error('Financisto-Sicherung: nicht abgeschlossener Datensatz.');
            kind = line.slice(8);
            fields = {};
            inBlock = true;
        }
        else if (line === '$$') {
            if (!inBlock)
                throw new Error('Financisto-Sicherung: unerwartetes Datensatzende.');
            check();
            inBlock = false;
            kind = '';
        }
        else if (inBlock) {
            const offset = line.indexOf(':');
            if (offset > 0)
                fields[line.slice(0, offset)] = line.slice(offset + 1);
        }
    }
    if (inBlock || !result.accounts || !result.currency)
        throw new Error('Financisto-Sicherung: unvollständig oder ohne Konten/Währung.');
    // The export path currently creates EUR with currency ID 1 and every account points to it.
    return result;
}
