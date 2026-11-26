// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {PendingWrite} from './dashboard-protocol.js';

/** The Dashboard booking DELETE endpoint expects JSON even when no fields are needed.
 * Preserve the stored UUID, If-Match, path and original pending data. This only
 * changes the wire representation for an otherwise empty booking DELETE.
 */
export function mobileWriteBody(p:Pick<PendingWrite,'method'|'path'|'data'>):object|null{
  if(p.method==='DELETE'&&/^\/api\/mobile\/v1\/bookings\/[1-9]\d*$/.test(p.path)&&p.data===null)
    return {};
  if(p.data===null)return null;
  if(typeof p.data!=='object'||Array.isArray(p.data))
    throw new Error('Ungültiges JSON im gespeicherten Schreibauftrag.');
  return p.data;
}

export function mobileErrorDetail(value:unknown):string|null{
  let decoded=value;
  if(typeof decoded==='string'){
    if(decoded.length>2048)return null;
    try{decoded=JSON.parse(decoded);}catch{return null;}
  }
  if(decoded===null||typeof decoded!=='object'||Array.isArray(decoded))return null;
  const error=(decoded as Record<string,unknown>).error;
  if(typeof error!=='string')return null;
  const text=error.trim();
  return text&&text.length<=280&&!/[\x00-\x1f\x7f]/.test(text)?text:null;
}
