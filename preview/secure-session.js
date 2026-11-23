import { registerPlugin } from '@capacitor/core';
import { runningNatively } from './file-export.js';
// Capacitor proxy MUST be returned synchronously, never Promise.resolve(plugin).
const NativeSecureSession = registerPlugin('FieLanzenSecureSession');
export function secureSession() {
    if (!runningNatively())
        throw new Error('Serverbetrieb mit API-Schlüssel ist nur in der Android-App möglich.');
    const bridge = window.Capacitor;
    if (!bridge?.isPluginAvailable?.('FieLanzenSecureSession'))
        throw new Error('Android-Keystore-Plugin ist nicht registriert. Bitte den vollständigen Android-Build verwenden.');
    return NativeSecureSession;
}
