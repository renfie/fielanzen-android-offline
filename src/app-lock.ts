import {registerPlugin} from '@capacitor/core';
import {runningNatively} from './file-export.js';
interface LockState {enabled:boolean;}
interface NativeAppLock {
  getStatus():Promise<LockState>;
  authenticate():Promise<{authenticated:boolean}>;
  setEnabled(options:{enabled:boolean}):Promise<LockState>;
}
// Native AndroidX BiometricPrompt, with secure Android device credential fallback.
// Proxy must be returned synchronously; never Promise.resolve(proxy).
const NativeAppLock=registerPlugin<NativeAppLock>('FieLanzenAppLock');
export function appLock():NativeAppLock {
  if(!runningNatively())throw new Error('Die App-Sperre benötigt die installierte Android-App.');
  const capacitor=(window as typeof window & {Capacitor?:{isPluginAvailable?:(plugin:string)=>boolean}}).Capacitor;
  if(!capacitor?.isPluginAvailable?.('FieLanzenAppLock'))
    throw new Error('Android-App-Sperre nicht registriert. Bitte Android-Projekt vollständig neu bauen.');
  return NativeAppLock;
}
