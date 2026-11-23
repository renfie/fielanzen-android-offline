import {exportBackup,parseBackup} from './backup.js';
import type {Snapshot} from './types.js';

/** FieLanzen native gzip(JSON) .backup: deliberately NOT a Financisto-native export. */
export const APP_BACKUP_EXTENSION='.backup';
const MAX_ARCHIVE_BYTES=30*1024*1024;
const MAX_JSON_BYTES=65*1024*1024;
export async function encodeAutomaticBackup(snapshot:Snapshot):Promise<Uint8Array>{
  if(typeof CompressionStream==='undefined')throw new Error('Gzip-Komprimierung ist auf diesem Gerät nicht verfügbar.');
  const bytes=new TextEncoder().encode(exportBackup(snapshot));
  if(bytes.byteLength>MAX_JSON_BYTES)throw new Error('Datenbestand ist für eine Sicherung zu groß.');
  const compressed=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const result=new Uint8Array(await new Response(compressed).arrayBuffer());
  if(result.byteLength>MAX_ARCHIVE_BYTES)throw new Error('Komprimierte Sicherung ist zu groß.');
  return result;
}
export async function parseAutomaticBackup(file:File):Promise<ReturnType<typeof parseBackup>>{
  if(file.size>MAX_ARCHIVE_BYTES)throw new Error('Sicherungsdatei ist größer als 30 MB.');
  const raw=new Uint8Array(await file.arrayBuffer());
  if(raw[0]===0x1f&&raw[1]===0x8b){
    if(typeof DecompressionStream==='undefined')throw new Error('Gzip-Entpacken ist auf diesem Gerät nicht verfügbar.');
    const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks:Uint8Array[]=[];let length=0;
    while(true){
      const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>MAX_JSON_BYTES){await reader.cancel();throw new Error('Entpackte Sicherung überschreitet 65 MB.');}
      chunks.push(value);
    }
    const merged=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
    return parseBackup(new TextDecoder().decode(merged));
  }
  return parseBackup(new TextDecoder().decode(raw));
}
export function encodeBase64(bytes:Uint8Array):string{
  const chunks:string[]=[];
  for(let start=0;start<bytes.length;start+=8192)
    chunks.push(String.fromCharCode(...bytes.subarray(start,start+8192)));
  return btoa(chunks.join(''));
}
