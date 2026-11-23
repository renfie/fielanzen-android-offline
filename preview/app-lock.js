import { registerPlugin } from '@capacitor/core';
import { runningNatively } from './file-export.js';
// Native AndroidX BiometricPrompt, with secure Android device credential fallback.
// Proxy must be returned synchronously; never Promise.resolve(proxy).
const NativeAppLock = registerPlugin('FieLanzenAppLock');
export function appLock() {
    if (!runningNatively())
        throw new Error('Die App-Sperre benötigt die installierte Android-App.');
    const capacitor = window.Capacitor;
    if (!capacitor?.isPluginAvailable?.('FieLanzenAppLock'))
        throw new Error('Android-App-Sperre nicht registriert. Bitte Android-Projekt vollständig neu bauen.');
    return NativeAppLock;
}
