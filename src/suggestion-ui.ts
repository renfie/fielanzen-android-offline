// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

/** One keyboard-aware suggestion list for local and server booking/rule editors. */
export type SuggestionOption = {id:number;name:string};
export const suggestionKey=(value:string):string=>value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de');
export function rankSuggestions<T extends SuggestionOption>(
  values:readonly T[],query:string,limit=8,usage?:ReadonlyMap<number,number>
):T[]{
  const key=suggestionKey(query);
  return values.filter(value=>suggestionKey(value.name).includes(key))
    .sort((a,b)=>{
      if(key){
        const aPrefix=suggestionKey(a.name).startsWith(key),bPrefix=suggestionKey(b.name).startsWith(key);
        if(aPrefix!==bPrefix)return aPrefix?-1:1;
      }
      const count=(usage?.get(b.id)??0)-(usage?.get(a.id)??0);
      return count||a.name.localeCompare(b.name,'de');
    }).slice(0,Math.max(0,limit));
}
export type SuggestionRect={left:number;top:number;bottom:number;width:number};
export type VisibleRect={left:number;right:number;top:number;bottom:number};
export function suggestionLayout(
  field:SuggestionRect,visible:VisibleRect,count:number
):{left:number;top:number;width:number;maxHeight:number;above:boolean}|null{
  if(count<=0)return null;
  const below=Math.max(0,visible.bottom-field.bottom-7);
  const above=Math.max(0,field.top-visible.top-7);
  const openAbove=below<156&&above>below;
  const space=openAbove?above:below;
  if(space<45)return null;
  // At most four visible rows; scroll further matches instead of covering the form.
  const maxHeight=Math.min(188,Math.floor(space));
  const height=Math.min(maxHeight,count*46+6);
  const left=Math.max(visible.left+6,Math.min(field.left,visible.right-60));
  const width=Math.max(0,Math.min(field.width,visible.right-left-6));
  return {left,top:openAbove?field.top-height-3:field.bottom+3,width,maxHeight,above:openAbove};
}
export function attachDialogSuggestions(
  dialog:HTMLDialogElement,input:HTMLInputElement,menu:HTMLDivElement
):{open:()=>void;close:()=>void}{
  menu.setAttribute('popover','manual');
  menu.classList.add('keyboard-aware-menu');
  menu.setAttribute('role','listbox');
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls',menu.id);
  const close=()=>{
    if(menu.matches(':popover-open'))menu.hidePopover();
    menu.hidden=true;
    input.setAttribute('aria-expanded','false');
  };
  const position=()=>{
    if(menu.hidden)return;
    const rect=input.getBoundingClientRect();
    const vv=window.visualViewport;
    const visible={
      left:vv?.offsetLeft??0,
      right:(vv?.offsetLeft??0)+(vv?.width??window.innerWidth),
      top:vv?.offsetTop??0,
      bottom:(vv?.offsetTop??0)+(vv?.height??window.innerHeight)
    };
    const layout=suggestionLayout(rect,visible,menu.querySelectorAll('button').length);
    if(!layout){close();return;}
    menu.style.left=`${layout.left}px`;
    menu.style.top=`${layout.top}px`;
    menu.style.width=`${layout.width}px`;
    menu.style.maxHeight=`${layout.maxHeight}px`;
    menu.dataset.position=layout.above?'above':'below';
  };
  const open=()=>{
    if(!menu.querySelector('button')){close();return;}
    menu.hidden=false;
    // Top-layer popover escapes the scrolling modal and cannot hide behind fields.
    if(typeof menu.showPopover==='function'&&!menu.matches(':popover-open')){
      try{menu.showPopover();}catch{ /* Fixed-position fallback in older WebViews. */ }
    }
    input.setAttribute('aria-expanded','true');
    position();
    requestAnimationFrame(position); // Android's keyboard may resize the visual viewport.
  };
  // Keep the soft keyboard visible while a suggestion button is tapped.
  menu.addEventListener('pointerdown',event=>{
    if((event.target as HTMLElement).closest('button'))event.preventDefault();
  });
  const outside=(event:PointerEvent)=>{
    if(event.target!==input&&!menu.contains(event.target as Node))close();
  };
  document.addEventListener('pointerdown',outside);
  window.addEventListener('resize',position,{passive:true});
  window.addEventListener('scroll',position,{passive:true,capture:true});
  window.visualViewport?.addEventListener('resize',position,{passive:true});
  window.visualViewport?.addEventListener('scroll',position,{passive:true});
  input.addEventListener('blur',()=>{
    window.setTimeout(()=>{
      if(document.activeElement!==input&&!menu.contains(document.activeElement))close();
    },160);
  });
  dialog.addEventListener('close',()=>{
    close();
    document.removeEventListener('pointerdown',outside);
    window.removeEventListener('resize',position);
    window.removeEventListener('scroll',position,true);
    window.visualViewport?.removeEventListener('resize',position);
    window.visualViewport?.removeEventListener('scroll',position);
  },{once:true});
  return {open,close};
}
