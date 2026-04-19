import { RotateCcw, X, LogOut } from 'lucide-react'
import { useSupabase } from '../contexts/SupabaseContext'
import { signOut } from '../lib/auth'

import '../styles/index.css'

export const DEFAULT_ACCENT_COLOR = '#00ff88'

export type ThemeKey = 'dark' | 'light' | 'synthwave' | 'nord' | 'solarized' | 'ocean' | 'sunset' | 'forest' | 'rose'

export interface ThemePreset {
    name: string
    colors: {
        bgPrimary: string
        bgSecondary: string
        bgTertiary: string
        bgGlass: string
        bgGlassHover: string
        bgFrosted: string
        textPrimary: string
        textSecondary: string
        textMuted: string
        overlayRgb: string
        fxOverlayBg: string
        shadowSm: string
        shadowMd: string
        borderGlass: string
        playerBgBrightness: string
        playerBgOpacity: string
    }
    preview: string
}

export const THEME_PRESETS: Record<ThemeKey, ThemePreset> = {
    dark: {
        name: 'Dark',
        preview: '#000000',
        colors: {
            bgPrimary: '#000000', bgSecondary: '#0a0a0a', bgTertiary: '#141414',
            bgGlass: 'rgba(20, 20, 20, 0.8)', bgGlassHover: 'rgba(30, 30, 30, 0.9)',
            bgFrosted: 'rgba(10, 10, 12, 0.95)', textPrimary: '#ffffff',
            textSecondary: '#888888', textMuted: '#555555', overlayRgb: '255, 255, 255',
            fxOverlayBg: 'rgba(0, 0, 0, 0.70)', shadowSm: '0 2px 8px rgba(0, 0, 0, 0.5)',
            shadowMd: '0 4px 16px rgba(0, 0, 0, 0.6)', borderGlass: '1px solid rgba(255, 255, 255, 0.08)',
            playerBgBrightness: '0.4', playerBgOpacity: '0.6'
        }
    },
    light: {
        name: 'Light',
        preview: '#f0f0f0',
        colors: {
            bgPrimary: '#f0f0f0', bgSecondary: '#e4e4e4', bgTertiary: '#d8d8d8',
            bgGlass: 'rgba(240, 240, 240, 0.85)', bgGlassHover: 'rgba(228, 228, 228, 0.9)',
            bgFrosted: 'rgba(235, 235, 238, 0.95)', textPrimary: '#111111',
            textSecondary: '#555555', textMuted: '#888888', overlayRgb: '0, 0, 0',
            fxOverlayBg: 'rgba(220, 220, 225, 0.80)', shadowSm: '0 2px 8px rgba(0, 0, 0, 0.1)',
            shadowMd: '0 4px 16px rgba(0, 0, 0, 0.12)', borderGlass: '1px solid rgba(0, 0, 0, 0.08)',
            playerBgBrightness: '1.3', playerBgOpacity: '0.15'
        }
    },
    synthwave: {
        name: 'Synthwave',
        preview: '#1a0a2e',
        colors: {
            bgPrimary: '#1a0a2e', bgSecondary: '#16082a', bgTertiary: '#2d1150',
            bgGlass: 'rgba(26, 10, 46, 0.85)', bgGlassHover: 'rgba(45, 17, 80, 0.9)',
            bgFrosted: 'rgba(20, 8, 38, 0.95)', textPrimary: '#f0e6ff',
            textSecondary: '#b088d4', textMuted: '#6b4d8a', overlayRgb: '240, 230, 255',
            fxOverlayBg: 'rgba(26, 10, 46, 0.80)', shadowSm: '0 2px 8px rgba(100, 0, 200, 0.3)',
            shadowMd: '0 4px 16px rgba(100, 0, 200, 0.4)', borderGlass: '1px solid rgba(180, 100, 255, 0.12)',
            playerBgBrightness: '0.35', playerBgOpacity: '0.65'
        }
    },
    nord: {
        name: 'Nord',
        preview: '#2e3440',
        colors: {
            bgPrimary: '#2e3440', bgSecondary: '#3b4252', bgTertiary: '#434c5e',
            bgGlass: 'rgba(46, 52, 64, 0.85)', bgGlassHover: 'rgba(59, 66, 82, 0.9)',
            bgFrosted: 'rgba(46, 52, 64, 0.95)', textPrimary: '#eceff4',
            textSecondary: '#d8dee9', textMuted: '#7b88a1', overlayRgb: '236, 239, 244',
            fxOverlayBg: 'rgba(46, 52, 64, 0.80)', shadowSm: '0 2px 8px rgba(0, 0, 0, 0.3)',
            shadowMd: '0 4px 16px rgba(0, 0, 0, 0.4)', borderGlass: '1px solid rgba(236, 239, 244, 0.08)',
            playerBgBrightness: '0.45', playerBgOpacity: '0.55'
        }
    },
    solarized: {
        name: 'Solarized',
        preview: '#002b36',
        colors: {
            bgPrimary: '#002b36', bgSecondary: '#073642', bgTertiary: '#0a4050',
            bgGlass: 'rgba(0, 43, 54, 0.85)', bgGlassHover: 'rgba(7, 54, 66, 0.9)',
            bgFrosted: 'rgba(0, 43, 54, 0.95)', textPrimary: '#fdf6e3',
            textSecondary: '#93a1a1', textMuted: '#657b83', overlayRgb: '253, 246, 227',
            fxOverlayBg: 'rgba(0, 43, 54, 0.80)', shadowSm: '0 2px 8px rgba(0, 0, 0, 0.3)',
            shadowMd: '0 4px 16px rgba(0, 0, 0, 0.4)', borderGlass: '1px solid rgba(253, 246, 227, 0.08)',
            playerBgBrightness: '0.4', playerBgOpacity: '0.6'
        }
    },
    ocean: {
        name: 'Ocean',
        preview: '#0a1628',
        colors: {
            bgPrimary: '#0a1628', bgSecondary: '#0e1e36', bgTertiary: '#142844',
            bgGlass: 'rgba(10, 22, 40, 0.85)', bgGlassHover: 'rgba(20, 40, 68, 0.9)',
            bgFrosted: 'rgba(10, 22, 40, 0.95)', textPrimary: '#e0f0ff',
            textSecondary: '#7ba3c9', textMuted: '#4a6f8f', overlayRgb: '224, 240, 255',
            fxOverlayBg: 'rgba(10, 22, 40, 0.80)', shadowSm: '0 2px 8px rgba(0, 40, 100, 0.3)',
            shadowMd: '0 4px 16px rgba(0, 40, 100, 0.4)', borderGlass: '1px solid rgba(100, 160, 220, 0.1)',
            playerBgBrightness: '0.35', playerBgOpacity: '0.65'
        }
    },
    sunset: {
        name: 'Sunset',
        preview: '#1c0f0a',
        colors: {
            bgPrimary: '#1c0f0a', bgSecondary: '#261510', bgTertiary: '#331d16',
            bgGlass: 'rgba(28, 15, 10, 0.85)', bgGlassHover: 'rgba(51, 29, 22, 0.9)',
            bgFrosted: 'rgba(28, 15, 10, 0.95)', textPrimary: '#ffe8d6',
            textSecondary: '#c4956a', textMuted: '#7a5a3c', overlayRgb: '255, 232, 214',
            fxOverlayBg: 'rgba(28, 15, 10, 0.80)', shadowSm: '0 2px 8px rgba(100, 40, 0, 0.3)',
            shadowMd: '0 4px 16px rgba(100, 40, 0, 0.4)', borderGlass: '1px solid rgba(255, 160, 80, 0.1)',
            playerBgBrightness: '0.35', playerBgOpacity: '0.65'
        }
    },
    forest: {
        name: 'Forest',
        preview: '#0a1a0f',
        colors: {
            bgPrimary: '#0a1a0f', bgSecondary: '#0e2415', bgTertiary: '#14301d',
            bgGlass: 'rgba(10, 26, 15, 0.85)', bgGlassHover: 'rgba(20, 48, 29, 0.9)',
            bgFrosted: 'rgba(10, 26, 15, 0.95)', textPrimary: '#e0f5e6',
            textSecondary: '#7db88e', textMuted: '#4a7a58', overlayRgb: '224, 245, 230',
            fxOverlayBg: 'rgba(10, 26, 15, 0.80)', shadowSm: '0 2px 8px rgba(0, 60, 20, 0.3)',
            shadowMd: '0 4px 16px rgba(0, 60, 20, 0.4)', borderGlass: '1px solid rgba(100, 200, 130, 0.1)',
            playerBgBrightness: '0.35', playerBgOpacity: '0.65'
        }
    },
    rose: {
        name: 'Rose',
        preview: '#1a0a14',
        colors: {
            bgPrimary: '#1a0a14', bgSecondary: '#24101c', bgTertiary: '#301626',
            bgGlass: 'rgba(26, 10, 20, 0.85)', bgGlassHover: 'rgba(48, 22, 38, 0.9)',
            bgFrosted: 'rgba(26, 10, 20, 0.95)', textPrimary: '#ffe6f0',
            textSecondary: '#c47a9a', textMuted: '#7a4a60', overlayRgb: '255, 230, 240',
            fxOverlayBg: 'rgba(26, 10, 20, 0.80)', shadowSm: '0 2px 8px rgba(100, 0, 50, 0.3)',
            shadowMd: '0 4px 16px rgba(100, 0, 50, 0.4)', borderGlass: '1px solid rgba(220, 100, 160, 0.1)',
            playerBgBrightness: '0.35', playerBgOpacity: '0.65'
        }
    }
}

export interface Settings {
    accentColor: string
    theme: ThemeKey
    crossfadeDuration: number
    surpriseMode: boolean
    adaptiveColors: boolean
    playerModel: 'cube' | 'vinyl' | 'cd'
    displayMode: 'default' | 'spinning'
}

interface SettingsModalProps {
    settings: Settings
    onUpdateSettings: (settings: Settings) => void
    onClose: () => void
}

function SettingsModal({ settings, onUpdateSettings, onClose }: SettingsModalProps) {
    const { user, profile, updateProfile } = useSupabase()

    const handleSignOut = async () => {
        try {
            await signOut()
        } catch (err) {
            console.error('Sign out failed:', err)
        }
    }

return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="close-btn" onClick={onClose}><X size={16} /></button>
                </div>

                <div className="modal-body">
                    {/* Account */}
                    <div className="setting-group">
                        <label>Account</label>
                        <div className="setting-color-row">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span className="color-label">{user?.email ?? 'Not signed in'}</span>
                                {user && (
                                    <div className="profile-name-edit" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder="Display Name"
                                            className="profile-name-input"
                                            style={{
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: 4,
                                                padding: '4px 8px',
                                                color: 'var(--text-primary)',
                                                fontSize: '0.9rem',
                                                width: 200
                                            }}
                                            defaultValue={profile?.full_name || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== profile?.full_name) {
                                                    updateProfile({ full_name: e.target.value })
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur()
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                            <button className="setting-toggle" onClick={handleSignOut}>
                                <LogOut size={14} /> Sign Out
                            </button>
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className="setting-group">
                        <label>Appearance</label>

                        <div className="setting-color-row">
                            <span className="color-label">Theme</span>
                        </div>
                        <div className="theme-grid">
                            {(Object.keys(THEME_PRESETS) as ThemeKey[]).map(key => (
                                <button
                                    key={key}
                                    className={`theme-preview-btn ${settings.theme === key ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ ...settings, theme: key })}
                                    title={THEME_PRESETS[key].name}
                                >
                                    <div
                                        className="theme-swatch"
                                        style={{ background: THEME_PRESETS[key].preview }}
                                    />
                                    <span className="theme-name">{THEME_PRESETS[key].name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="setting-color-row">
                            <span className="color-label">Accent Color</span>
                            <div className="color-picker-container">
                                <input
                                    type="color"
                                    className="color-input"
                                    value={settings.accentColor || DEFAULT_ACCENT_COLOR}
                                    onChange={e => onUpdateSettings({ ...settings, accentColor: e.target.value })}
                                />
                                {settings.accentColor && settings.accentColor !== DEFAULT_ACCENT_COLOR && (
                                    <button
                                        className="color-reset-btn"
                                        onClick={() => onUpdateSettings({ ...settings, accentColor: DEFAULT_ACCENT_COLOR })}
                                        title="Reset to default"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="setting-color-row">
                            <span className="color-label">Adaptive Colors</span>
                            <button
                                className={`setting-toggle ${settings.adaptiveColors ? 'active' : ''}`}
                                onClick={() => onUpdateSettings({ ...settings, adaptiveColors: !settings.adaptiveColors })}
                            >
                                {settings.adaptiveColors ? 'On' : 'Off'}
                            </button>
                        </div>
                        <p className="setting-desc">Theme and accent color adapt to the album art of the current track.</p>

                        <div className="setting-color-row">
                            <span className="color-label">3D Model</span>
                            <div className="setting-options" style={{ flex: 'unset' }}>
                                <button
                                    className={`setting-opt ${(settings.playerModel || 'cube') === 'cube' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ ...settings, playerModel: 'cube' })}
                                >
                                    Cube
                                </button>
                                <button
                                    className={`setting-opt ${settings.playerModel === 'vinyl' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ ...settings, playerModel: 'vinyl' })}
                                >
                                    Vinyl
                                </button>
                                <button
                                    className={`setting-opt ${settings.playerModel === 'cd' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ ...settings, playerModel: 'cd' })}
                                >
                                    CD
                                </button>
                            </div>
                        </div>
                        <p className="setting-desc">Choose the 3D visualization style for the player.</p>

                        <div className="setting-color-row">
                            <span className="color-label">3D Display Mode</span>
                            <div className="setting-options" style={{ flex: 'unset' }}>
                                <button
                                    className={`setting-opt ${(settings.displayMode || 'default') === 'default' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ ...settings, displayMode: 'default' })}
                                >
                                    Default
                                </button>
                                <button
                                    className={`setting-opt ${settings.displayMode === 'spinning' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ ...settings, displayMode: 'spinning' })}
                                >
                                    Spinning Record
                                </button>
                            </div>
                        </div>
                        <p className="setting-desc">Spinning Record: 3D model appears as a spinning background on mobile.</p>
                    </div>

                    {/* Playback */}
                    <div className="setting-group">
                        <label>Playback</label>
                        <div className="setting-color-row">
                            <span className="color-label">Crossfade</span>
                            <div className="slider-value-row">
                                <input
                                    type="range"
                                    min="0" max="12" step="1"
                                    value={settings.crossfadeDuration || 0}
                                    onChange={e => onUpdateSettings({ ...settings, crossfadeDuration: parseInt(e.target.value) })}
                                    className="settings-slider"
                                />
                                <span className="slider-value">{(settings.crossfadeDuration || 0) === 0 ? 'Off' : `${settings.crossfadeDuration}s`}</span>
                            </div>
                        </div>
                    </div>

                    {/* Surprise Mode */}
                    <div className="setting-group">
                        <label>Surprise Mode</label>
                        <div className="setting-color-row">
                            <span className="color-label">Random theme & color on launch</span>
                            <button
                                className={`setting-toggle ${settings.surpriseMode ? 'active' : ''}`}
                                onClick={() => onUpdateSettings({ ...settings, surpriseMode: !settings.surpriseMode })}
                            >
                                {settings.surpriseMode ? 'On' : 'Off'}
                            </button>
                        </div>
                        <p className="setting-desc">Each time you open the app, a random theme and accent color will be applied.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default SettingsModal
