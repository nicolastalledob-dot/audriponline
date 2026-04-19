import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { authClient, onAuthStateChange } from '../lib/auth'

export interface UserProfile {
    id: string
    full_name: string | null
}

interface SupabaseContextValue {
    user: User | null
    profile: UserProfile | null
    isLoading: boolean
    updateProfile: (updates: Partial<UserProfile>) => Promise<void>
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null)

export function SupabaseProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await authClient
                .from('profiles')
                .select('id, full_name')
                .eq('id', userId)
                .single()

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching profile:', error)
                return
            }

            if (data) {
                setProfile(data)
            } else {
                const newProfile: UserProfile = { id: userId, full_name: null }
                await authClient.from('profiles').insert(newProfile)
                setProfile(newProfile)
            }
        } catch (err) {
            console.error('Failed to fetch profile:', err)
        }
    }, [])

    useEffect(() => {
        authClient.auth.getSession().then(({ data: { session } }) => {
            const currentUser = session?.user ?? null
            setUser(currentUser)
            if (currentUser) fetchProfile(currentUser.id)
            setIsLoading(false)
        })

        const unsubscribe = onAuthStateChange((u) => {
            setUser(u)
            if (u) fetchProfile(u.id)
            else setProfile(null)
            setIsLoading(false)
        })

        return unsubscribe
    }, [fetchProfile])

    const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
        if (!user) return
        const { error } = await authClient
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
        if (error) throw error
        setProfile(prev => prev ? { ...prev, ...updates } : null)
    }, [user])

    return (
        <SupabaseContext.Provider value={{ user, profile, isLoading, updateProfile }}>
            {children}
        </SupabaseContext.Provider>
    )
}

export function useSupabase() {
    const ctx = useContext(SupabaseContext)
    if (!ctx) throw new Error('useSupabase must be used within SupabaseProvider')
    return ctx
}
