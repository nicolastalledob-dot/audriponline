import { GoTrueClient, type User } from '@supabase/gotrue-js'

const AUTH_URL_RAW = import.meta.env.VITE_AUTH_URL as string

if (!AUTH_URL_RAW) {
    throw new Error('VITE_AUTH_URL env var missing')
}

const AUTH_URL = AUTH_URL_RAW.startsWith('/')
    ? window.location.origin + AUTH_URL_RAW
    : AUTH_URL_RAW

export const auth = new GoTrueClient({
    url: AUTH_URL,
    autoRefreshToken: true,
    persistSession: true,
    storageKey: 'audrip-auth',
    detectSessionInUrl: false,
})

export async function signUp(email: string, password: string) {
    const { data, error } = await auth.signUp({ email, password })
    if (error) throw error
    return data
}

export async function signIn(email: string, password: string) {
    const { data, error } = await auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
}

export async function signOut() {
    const { error } = await auth.signOut()
    if (error) throw error
}

export async function getSession() {
    const { data } = await auth.getSession()
    return data.session
}

export async function getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await auth.getUser()
    return user
}

export function onAuthStateChange(callback: (user: User | null) => void) {
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
        callback(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
}
