import { createClient, User } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function signInWithGoogle() {
    const { error } = await authClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    })
    if (error) throw error
}

export async function signOut() {
    const { error } = await authClient.auth.signOut()
    if (error) throw error
}

export async function getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await authClient.auth.getUser()
    return user
}

export function onAuthStateChange(callback: (user: User | null) => void) {
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
        callback(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
}
