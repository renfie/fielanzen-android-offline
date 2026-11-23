// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import {registerPlugin} from '@capacitor/core';
import type {BackupFrequency} from './types.js';
interface FolderStatus {selected:boolean;name:string;destination?:'tree'|'downloads';lastExportAt:string;lastExportName:string;lastError:string;lastStagedAt:string;enabled?:boolean;frequency?:BackupFrequency;time?:string;nextScheduledAt?:string;lastAutomaticAt?:string;lastAttemptAt?:string;}
interface WriteResult {name:string;deleted:number;written:boolean;lastExportAt:string;}
interface BackupNativePlugin {
  getStatus():Promise<FolderStatus>;
  selectFolder():Promise<FolderStatus>;
  useDownloadsFolder():Promise<FolderStatus>;
  stageBackup(options:{base64:string;stageOnly?:boolean}):Promise<{bytes:number;written:boolean;name?:string;deleted?:number}>;
  configure(options:{enabled:boolean;frequency:BackupFrequency;keep:number;time:string}):Promise<{enabled:boolean;nextScheduledAt?:string}>;
  runDueNow():Promise<WriteResult>;
  writeNow():Promise<WriteResult>;
}
export const NativeAutoBackup=registerPlugin<BackupNativePlugin>('FieLanzenAutoBackup');
export type {FolderStatus,WriteResult};
