/** Explicit Android KeyChain client-certificate opt-in for dashboard HTTPS.
 * The PKCS#12 private key is never imported into JS or backed up by FieLanzen.
 */
import { registerPlugin } from '@capacitor/core';
import { runningNatively } from './file-export.js';
const NativeMtls = registerPlugin('FieLanzenMtlsHttp');
export function mtlsHttp() {
    if (!runningNatively())
        throw new Error('Client-Zertifikate sind nur in der Android-App verfügbar.');
    const c = window.Capacitor;
    if (!c?.isPluginAvailable?.('FieLanzenMtlsHttp'))
        throw new Error('Android-mTLS-Plugin fehlt. Vollständige neue APK installieren.');
    return NativeMtls; // Capacitor Plugin proxy must never be Promise-resolved
}
export async function useMtlsFor(base) {
    if (!runningNatively())
        return false;
    const c = window.Capacitor;
    if (!c?.isPluginAvailable?.('FieLanzenMtlsHttp'))
        return false;
    const result = await NativeMtls.status();
    return result.configured && result.host.toLowerCase() === new URL(base).hostname.toLowerCase();
}
