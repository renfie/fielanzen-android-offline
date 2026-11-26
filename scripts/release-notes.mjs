#!/usr/bin/env node
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// Generates a substantive, bilingual GitHub release description.
// Usage: node scripts/release-notes.mjs v0.2.0 /tmp/notes.md
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const [tag,destination]=process.argv.slice(2);
if(!/^v\d+\.\d+\.\d+(?:-alpha\.\d+)?$/.test(tag??'')||!destination){
  throw new Error('Usage: release-notes.mjs vX.Y.Z[-alpha.N] destination.md');
}
const version=tag.slice(1);
const notesPath=resolve('docs','releases',tag+'.md');
let notes;
if(existsSync(notesPath)){
  notes=readFileSync(notesPath,'utf8');
}else{
  const section=(path)=>{
    const source=readFileSync(path,'utf8');
    const lines=source.split(/\r?\n/);
    const start=lines.findIndex(line=>line.startsWith('## '+version+' '));
    if(start<0)throw new Error('No changelog section for '+tag+' in '+path);
    let end=start+1;
    while(end<lines.length&&!lines[end].startsWith('## '))end++;
    return lines.slice(start,end).join('\n').trim();
  };
  if(!version.includes('-alpha.'))throw new Error('Stable releases require reviewed docs/releases/'+tag+'.md');
  notes='# FieLanzen Offline '+version+'\n\n## Änderungen (Deutsch)\n\n'+
    section('CHANGELOG-OFFLINE.md')+'\n\n## Changes (English)\n\n'+
    section('CHANGELOG-OFFLINE.en.md')+'\n';
}
notes=notes.trim()+'\n\n---\n\n'+
'**Installation / Installation:** Die signierte APK ist unter **Assets** verfügbar. Vor dem Update eine vollständige externe Datensicherung erstellen. Android-Updates benötigen dieselbe App-ID und dasselbe Signaturzertifikat. Eine mit einem anderen Debug-Schlüssel signierte APK lässt sich nicht ohne Weiteres aktualisieren.\n\n'+
'The signed APK and SHA256 checksum are listed under **Assets**. Back up finance data before installing. Android updates require the same package identity and signing certificate. Do not remove the previous app solely to bypass a signing mismatch.\n\n'+
'**Quelltext / Source:** The complete source for this exact release is available in GitHub source archives attached to tag '+tag+'. GNU GPL v2 only; see [LICENSE](https://github.com/renfie/fielanzen-android-offline/blob/'+tag+'/LICENSE) and [README](https://github.com/renfie/fielanzen-android-offline/blob/'+tag+'/README.de.md).\n';
if(notes.length<500)throw new Error('Refusing to publish empty or placeholder release notes.');
writeFileSync(destination,notes);
process.stdout.write('Release notes prepared: '+tag+' ('+notes.length+' characters)\n');
