// crypto.randomUUID() requires a secure context (HTTPS or localhost). On
// HTTP origins (e.g. an in-LAN/Tailscale deploy) it's undefined, so fall
// back to a v4 UUID built from crypto.getRandomValues, which is available
// everywhere.
export function generateUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    const buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    buf[6] = (buf[6] & 0x0f) | 0x40
    buf[8] = (buf[8] & 0x3f) | 0x80
    const hex = Array.from(buf, b => b.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}
