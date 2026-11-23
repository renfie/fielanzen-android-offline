/** Only a PROVEN proxy certificate challenge may trigger Android KeyChain selection.
 * Generic HTTP 400/401, timeouts and server errors must never request a certificate.
 * Connection is retried once at most, within an explicit user-initiated action.
 */
import { DashboardApiError } from './dashboard-protocol.js';
const KNOWN_PROXY_CERTIFICATE_MESSAGES = /(?:no required ssl certificate was sent|the ssl certificate error|client certificate required|ssl client certificate required|client certificate verification failed)/i;
export function isClientCertificateChallenge(status, response) {
    if (![400, 403, 495, 496].includes(status))
        return false;
    const body = typeof response === 'string' ? response : typeof response === 'object' && response !== null ? JSON.stringify(response) : '';
    return KNOWN_PROXY_CERTIFICATE_MESSAGES.test(body.slice(0, 16000));
}
export function isClientCertificateRequired(error) {
    return error instanceof DashboardApiError && error.code === 'client_certificate_required';
}
export async function connectWithOptionalClientCertificate(connect, chooseCertificate) {
    try {
        return await connect();
    }
    catch (error) {
        if (!isClientCertificateRequired(error))
            throw error;
        await chooseCertificate(); // Android needs explicit approval; never auto-select a private key
        return connect(); // one retry only, no retry loops or writes
    }
}
