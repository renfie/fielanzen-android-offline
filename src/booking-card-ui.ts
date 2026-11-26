// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** Shared visual booking card: data source only supplies fields, permissions and actions.
 * Both LOCAL and DASHBOARD-SERVER use exactly the same card markup and CSS. */
export interface BookingCardView {
  id:number;
  source:'local'|'server';
  expanded:boolean;
  title:string;
  dateLabel:string;
  categoryLabel:string;
  kind:'income'|'expense'|'transfer';
  kindLabel:string;
  amountLabel:string;
  recurring:boolean;
  ruleMatched?:boolean;
  zeroBooking?:boolean;
  details:{label:string;value:string;isNote?:boolean}[];
  actions:{action:string;title:string;style:'secondary'|'primary'|'danger'}[];
}

const escapeHtml=(value:unknown):string=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]!));

export function bookingCardHtml(card:BookingCardView):string {
  const detailId=(card.source==='local'?'booking-details-':'server-booking-details-')+card.id;
  const toggleAction=card.source==='server'?'toggle-server-booking':'toggle-booking';
  const tags=`<span class="booking-type-chip ${card.kind}">${escapeHtml(card.kindLabel)}</span>
    ${card.recurring?'<span class="booking-type-chip recurring">Wiederkehrend</span>':''}
    ${card.ruleMatched&&!card.recurring?'<span class="booking-type-chip rule-match">Regel zugeordnet</span>':''}`;
  const rows=card.details.map(row=>`<div${row.isNote?' class="booking-detail-note"':''}><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('');
  return `<article class="booking-entry ${card.expanded?'is-expanded':''}">
    <button type="button" class="booking" data-action="${toggleAction}" data-id="${card.id}" aria-expanded="${card.expanded}" aria-controls="${detailId}">
      <div class="info"><div class="booking-title">${escapeHtml(card.title)}</div>
        <div class="booking-meta">${escapeHtml(card.dateLabel)} · ${escapeHtml(card.categoryLabel)}${card.zeroBooking?' · Nullbuchung':''}</div>
        <div class="booking-tags">${tags}</div></div>
      <div class="booking-side"><div class="booking-amount ${card.kind}">${escapeHtml(card.amountLabel)}</div><span class="booking-chevron" aria-hidden="true">${card.expanded?'⌃':'⌄'}</span></div>
    </button>
    ${card.expanded?`<div class="booking-details" id="${detailId}"><dl class="detail-grid">${rows}</dl>
      ${card.actions.length?`<div class="btn-row booking-actions">${card.actions.map(action=>`<button type="button" class="btn ${action.style}" data-action="${escapeHtml(action.action)}" data-id="${card.id}">${escapeHtml(action.title)}</button>`).join('')}</div>`:''}
    </div>`:''}
  </article>`;
}
