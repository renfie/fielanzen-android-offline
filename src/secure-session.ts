import {registerPlugin} from '@capacitor/core';
import {runningNatively} from './file-export.js';

interface SecureSessionNative {
  getStatus():Promise<{mode:'local'|'server';hasToken:boolean;hasPending:boolean;server:string}>;
  saveToken(args:{server:string;token:string}):Promise<void>;
  getToken():Promise<{server:string;token:string}>;
  setMode(args:{mode:'local'|'server'}):Promise<void>;
  clearToken():Promise<void>;
  putPending(args:{json:string}):Promise<void>;
  getPending():Promise<{json:string}>;
  clearPending():Promise<void>;
}
// Capacitor proxy MUST be returned synchronously, never Promise.resolve(plugin).
const NativeSecureSession=registerPlugin<SecureSessionNative>('FieLanzenSecureSession');
export function secureSession():SecureSessionNative {
  if(!runningNatively())throw new Error('Serverbetrieb mit API-Schlüssel ist nur in der Android-App möglich.');
  const bridge=(window as typeof window & {Capacitor?:{isPluginAvailable?:(n:string)=>boolean}}).Capacitor;
  if(!bridge?.isPluginAvailable?.('FieLanzenSecureSession'))
    throw new Error('Android-Keystore-Plugin ist nicht registriert. Bitte den vollständigen Android-Build verwenden.');
  return NativeSecureSession;
}
