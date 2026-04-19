import { useState } from 'react'
import { signIn, signUp } from '../lib/auth'

export default function AuthScreen() {
    const [mode, setMode] = useState<'in' | 'up'>('in')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setBusy(true)
        try {
            if (mode === 'up') await signUp(email, password)
            else await signIn(email, password)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="auth-screen">
            <div className="auth-card">
                <h1 className="auth-title">AudRip</h1>
                <p className="auth-subtitle">Your local music, elevated</p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                        disabled={busy}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                        required
                        minLength={8}
                        disabled={busy}
                    />
                    <button type="submit" className="auth-submit-btn" disabled={busy}>
                        {busy ? '...' : mode === 'in' ? 'Sign in' : 'Create account'}
                    </button>
                </form>

                {error && <p className="auth-error">{error}</p>}

                <button
                    type="button"
                    className="auth-mode-toggle"
                    onClick={() => { setError(null); setMode(mode === 'in' ? 'up' : 'in') }}
                    disabled={busy}
                >
                    {mode === 'in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
            </div>
        </div>
    )
}
