import { PostgrestClient } from '@supabase/postgrest-js'
import { getSession } from './auth'

function resolveUrl(envVar: string | undefined, name: string): string {
    if (!envVar) throw new Error(`${name} env var missing`)
    return envVar.startsWith('/') ? window.location.origin + envVar : envVar
}

const API_URL = resolveUrl(import.meta.env.VITE_API_URL as string, 'VITE_API_URL')
export const AUDIO_URL = resolveUrl(import.meta.env.VITE_AUDIO_URL as string, 'VITE_AUDIO_URL')

async function authedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
): Promise<Response> {
    const session = await getSession()
    const headers = new Headers(init.headers)
    if (session?.access_token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
    }
    return fetch(input, { ...init, headers })
}

export const api = new PostgrestClient(API_URL, {
    schema: 'app',
    fetch: authedFetch as any,
})

export async function streamUrlFor(trackId: string): Promise<string> {
    const session = await getSession()
    const token = session?.access_token ?? ''
    return `${AUDIO_URL}/stream/${trackId}?access_token=${encodeURIComponent(token)}`
}
