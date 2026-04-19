import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { User } from '@supabase/gotrue-js'
import { onAuthStateChange, getSession } from '../lib/auth'
import { api } from '../lib/apiClient'

export interface UserProfile {
    id: string
    full_name: string | null
    settings: Record<string, unknown>
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
            const { data, error } = await api
                .from('profiles')
                .select('id, full_name, settings')
                .eq('id', userId)
                .maybeSingle()

            if (error) {
                console.error('Error fetching profile:', error)
                return
            }

            if (data) {
                setProfile({ ...data, settings: (data as any).settings ?? {} } as UserProfile)
            } else {
                const newProfile: UserProfile = { id: userId, full_name: null, settings: {} }
                const { error: insertErr } = await api.from('profiles').insert(newProfile)
                if (insertErr) console.error('Error creating profile:', insertErr)
                setProfile(newProfile)
            }
        } catch (err) {
            console.error('Failed to fetch profile:', err)
        }
    }, [])

    useEffect(() => {
        getSession().then(session => {
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
        const { error } = await api
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
