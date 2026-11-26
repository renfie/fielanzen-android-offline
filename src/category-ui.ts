// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import type {Category,CategoryKind} from './types.js';
const norm=(s:string)=>s.trim().toLocaleLowerCase('de');
export function filterManagedCategories(categories:Category[],search:string,kind:'all'|CategoryKind='all'):Category[]{
  const q=norm(search);
  return categories.filter(c=>(kind==='all'||c.kind===kind)&&(norm(c.name).includes(q)||String(c.id).includes(q)))
    .sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name,'de'));
}
export function categorySuggestions(categories:Category[],kind:CategoryKind,search:string,usage:ReadonlyMap<number,number>,limit=8):Category[]{
  const q=norm(search);
  return categories.filter(c=>c.kind===kind&&norm(c.name).includes(q))
    .sort((a,b)=>{
      if(q){
        const aPrefix=norm(a.name).startsWith(q),bPrefix=norm(b.name).startsWith(q);
        if(aPrefix!==bPrefix)return aPrefix?-1:1;
      }
      return (usage.get(b.id)??0)-(usage.get(a.id)??0)||a.name.localeCompare(b.name,'de');
    })
    .slice(0,Math.max(0,limit));
}
