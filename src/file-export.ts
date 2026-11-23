/** Files are created only on explicit user action. No network and no cloud sync. */
export function runningNatively():boolean {
  const bridge=(window as typeof window & {Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor;
  return Boolean(bridge?.isNativePlatform?.());
}
/** The user must select a destination in Android's share sheet. Cache is not a backup. */
export async function exportUserText(content:string,filename:string,mime:string):Promise<void> {
  if (runningNatively()) {
    const [{Filesystem,Directory,Encoding},{Share}]=await Promise.all([
      import('@capacitor/filesystem'),import('@capacitor/share')
    ]);
    const safeName=filename.replace(/[^a-zA-Z0-9._-]/g,'_');
    const result=await Filesystem.writeFile({path:safeName,data:content,directory:Directory.Cache,encoding:Encoding.UTF8,recursive:true});
    await Share.share({title:`FieLanzen Offline – ${safeName}`,dialogTitle:'Datei speichern oder teilen',files:[result.uri],text:'FieLanzen Offline – lokal erzeugte Datei'});
    return;
  }
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  try {
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
  } finally {window.setTimeout(()=>URL.revokeObjectURL(url),30000);}
}

/** Binary user-initiated download for compatible Financisto gzip archives. */
export async function exportUserBytes(content:Uint8Array,filename:string,mime='application/gzip'):Promise<void>{
  if(runningNatively()){
    const [{Filesystem,Directory},{Share}]=await Promise.all([import('@capacitor/filesystem'),import('@capacitor/share')]);
    const parts:string[]=[];
    for(let offset=0;offset<content.length;offset+=8192)
      parts.push(String.fromCharCode(...content.subarray(offset,offset+8192)));
    const data=btoa(parts.join(''));
    const result=await Filesystem.writeFile({path:filename.replace(/[^a-zA-Z0-9._-]/g,'_'),data,directory:Directory.Cache,recursive:true});
    await Share.share({title:`Financisto-kompatibler Export – ${filename}`,dialogTitle:'Backup-Datei speichern',files:[result.uri]});
    return;
  }
  const blob=new Blob([new Uint8Array(content)],{type:mime});
  const url=URL.createObjectURL(blob);
  try{
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),30000);}
}
