import { useState, useEffect, useCallback, useRef } from 'react'
import { Headphones as HeadphonesIcon, Settings as SettingsIcon, Menu as MenuIcon, X as XIcon, FolderOpen as FolderOpenIcon } from 'lucide-react'
import MusicPlayer from './components/MusicPlayer'
import SettingsModal, { Settings, DEFAULT_ACCENT_COLOR, THEME_PRESETS, ThemeKey } from './components/SettingsModal'
import FileManager from './components/FileManager'
import AuthScreen from './components/AuthScreen'
import UploadButton from './components/UploadButton'
import { SupabaseProvider, useSupabase } from './contexts/SupabaseContext'
import { getTracks } from './lib/serverDb'
import { Track } from './types'

const SETTINGS_KEY = 'audrip_settings'

function AppContent() {
    const { user, isLoading } = useSupabase()

    const [showSettings, setShowSettings] = useState(false)
    const [settings, setSettings] = useState<Settings>({
        accentColor: DEFAULT_ACCENT_COLOR,
        theme: 'dark',
        crossfadeDuration: 0,
        surpriseMode: false,
        adaptiveColors: false,
        playerModel: 'cube',
        displayMode: 'default'
    })
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)
    const [musicLibrary, setMusicLibrary] = useState<Track[]>([])
    const [isLibraryLoaded, setIsLibraryLoaded] = useState(false)
    const [showSplash, setShowSplash] = useState(true)
    const [showMobileMenu, setShowMobileMenu] = useState(false)
    const [showFileManager, setShowFileManager] = useState(false)
    const mobileMenuRef = useRef<HTMLDivElement>(null)

    const isAppReady = isSettingsLoaded && isLibraryLoaded

    // Load settings from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                const merged = { ...settings, ...parsed }
                if (merged.surpriseMode) {
                    const themeKeys = Object.keys(THEME_PRESETS) as ThemeKey[]
                    merged.theme = themeKeys[Math.floor(Math.random() * themeKeys.length)]
                    merged.accentColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
                }
                setSettings(merged)
            }
        } catch { /* ignore */ }
        setIsSettingsLoaded(true)
    }, [])

    // Save settings to localStorage
    useEffect(() => {
        if (isSettingsLoaded) {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
        }
    }, [settings, isSettingsLoaded])

    // Load music library from local IndexedDB
    useEffect(() => {
        if (!user) {
            setIsLibraryLoaded(true)
            return
        }

        getTracks(user.id)
            .then(tracks => {
                setMusicLibrary(tracks)
                setIsLibraryLoaded(true)
            })
            .catch(err => {
                console.error('Failed to load music library:', err)
                setIsLibraryLoaded(true)
            })
    }, [user])

    // Fade out splash when ready
    useEffect(() => {
        if (isAppReady) {
            const timeout = setTimeout(() => setShowSplash(false), 500)
            return () => clearTimeout(timeout)
        }
    }, [isAppReady])

    // Refresh music library from IndexedDB
    const refreshMusicLibrary = useCallback(async () => {
        if (!user) return musicLibrary
        try {
            const tracks = await getTracks(user.id)
            setMusicLibrary(tracks)
            return tracks
        } catch (err) {
            console.error('Failed to refresh music library:', err)
            return musicLibrary
        }
    }, [user, musicLibrary])

    // Close mobile menu on outside click
    useEffect(() => {
        if (!showMobileMenu) return
        const handleClick = (e: MouseEvent) => {
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
                setShowMobileMenu(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [showMobileMenu])

    // Apply accent color & theme to CSS variables
    useEffect(() => {
        const hexToRgb = (hex: string) => {
            const r = parseInt(hex.slice(1, 3), 16)
            const g = parseInt(hex.slice(3, 5), 16)
            const b = parseInt(hex.slice(5, 7), 16)
            return { r, g, b }
        }

        const darken = (r: number, g: number, b: number, pct: number) => ({
            r: Math.round(r * (1 - pct / 100)),
            g: Math.round(g * (1 - pct / 100)),
            b: Math.round(b * (1 - pct / 100))
        })

        const rgbToHex = (r: number, g: number, b: number) =>
            '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

        const root = document.documentElement.style

        if (settings.adaptiveColors) return

        const accentHex = settings.accentColor || DEFAULT_ACCENT_COLOR
        const accent = hexToRgb(accentHex)
        const secondary = darken(accent.r, accent.g, accent.b, 20)
        const tertiary = darken(accent.r, accent.g, accent.b, 35)

        root.setProperty('--accent-rgb', `${accent.r}, ${accent.g}, ${accent.b}`)
        root.setProperty('--accent-primary', accentHex)
        root.setProperty('--accent-secondary', rgbToHex(secondary.r, secondary.g, secondary.b))
        root.setProperty('--accent-tertiary', rgbToHex(tertiary.r, tertiary.g, tertiary.b))
        root.setProperty('--accent-success', accentHex)
        root.setProperty('--shadow-glow', `0 0 20px rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.3)`)

        const preset = THEME_PRESETS[settings.theme as ThemeKey] || THEME_PRESETS.dark
        const c = preset.colors
        root.setProperty('--bg-primary', c.bgPrimary)
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.bgPrimary)
        root.setProperty('--bg-secondary', c.bgSecondary)
        root.setProperty('--bg-tertiary', c.bgTertiary)
        root.setProperty('--bg-glass', c.bgGlass)
        root.setProperty('--bg-glass-hover', c.bgGlassHover)
        root.setProperty('--bg-frosted', c.bgFrosted)
        root.setProperty('--text-primary', c.textPrimary)
        root.setProperty('--text-secondary', c.textSecondary)
        root.setProperty('--text-muted', c.textMuted)
        root.setProperty('--overlay-rgb', c.overlayRgb)
        root.setProperty('--fx-overlay-bg', c.fxOverlayBg)
        root.setProperty('--shadow-sm', c.shadowSm)
        root.setProperty('--shadow-md', c.shadowMd)
        root.setProperty('--border-glass', c.borderGlass)
        root.setProperty('--player-bg-brightness', c.playerBgBrightness)
        root.setProperty('--player-bg-opacity', c.playerBgOpacity)
    }, [settings.accentColor, settings.theme, settings.adaptiveColors])

    if (isLoading) {
        return (
            <div className="splash-screen">
                <div className="splash-content">
                    <h1 className="splash-title">AudRip</h1>
                    <div className="splash-loader"><div className="loading-spinner"></div></div>
                </div>
            </div>
        )
    }

    if (!user) return <AuthScreen />

    return (
        <>
            {showSplash && (
                <div className={`splash-screen ${isAppReady ? 'fade-out' : ''}`}>
                    <div className="splash-content">
                        <h1 className="splash-title">AudRip</h1>
                        <div className="splash-loader"><div className="loading-spinner"></div></div>
                        <p className="splash-subtitle">Loading your library...</p>
                    </div>
                </div>
            )}
            <div className="app" style={{ visibility: showSplash ? 'hidden' : 'visible' }}>
                <div className="grid-background" />

                <div className="mobile-menu-wrapper" ref={mobileMenuRef}>
                    <button
                        className="toolbar-btn mobile-menu-btn"
                        onClick={() => setShowMobileMenu(m => !m)}
                        title="Menu"
                    >
                        {showMobileMenu ? <XIcon size={20} /> : <MenuIcon size={20} />}
                    </button>
                    {showMobileMenu && (
                        <div className="mobile-menu-dropdown">
                            <button className="mobile-menu-item" onClick={() => setShowMobileMenu(false)}>
                                <HeadphonesIcon size={18} />
                                <span>Player</span>
                            </button>
                            <UploadButton userId={user.id} onUploadComplete={() => { refreshMusicLibrary(); setShowMobileMenu(false) }} onOpenFileManager={() => { setShowFileManager(true); setShowMobileMenu(false) }} variant="menu-item" />
                            <button className="mobile-menu-item" onClick={() => { setShowSettings(true); setShowMobileMenu(false) }}>
                                <SettingsIcon size={18} />
                                <span>Settings</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="top-section">
                    <header className="app-header">
                        <h1>AudRip</h1>
                    </header>

                    <div className="toolbar desktop-toolbar">
                        <button className="toolbar-btn active" title="Music Player">
                            <HeadphonesIcon size={20} />
                        </button>
                        <UploadButton userId={user.id} onUploadComplete={() => refreshMusicLibrary()} onOpenFileManager={() => setShowFileManager(true)} />
                        <button
                            className="toolbar-btn"
                            onClick={() => setShowSettings(true)}
                            title="Settings"
                        >
                            <SettingsIcon size={20} />
                        </button>
                    </div>
                </div>

                <main className="app-main">
                    <div className="view-container view-player">
                        <div className="view-pane player-pane-wrapper">
                            <MusicPlayer
                                isActive={true}
                                initialTracks={musicLibrary}
                                onRefreshTracks={refreshMusicLibrary}
                                crossfadeDuration={settings.crossfadeDuration || 0}
                                theme={settings.theme || 'dark'}
                                accentColor={settings.accentColor || DEFAULT_ACCENT_COLOR}
                                adaptiveColors={settings.adaptiveColors || false}
                                playerModel={settings.playerModel || 'cube'}
                                displayMode={settings.displayMode || 'default'}
                                userId={user.id}
                            />
                        </div>
                    </div>
                </main>

                <nav className="mobile-footer">
                    <button
                        className={`mobile-footer-tab ${!showFileManager && !showSettings ? 'active' : ''}`}
                        onClick={() => { setShowFileManager(false); setShowSettings(false) }}
                    >
                        <HeadphonesIcon size={22} />
                        <span className="tab-label">Player</span>
                    </button>
                    <button
                        className={`mobile-footer-tab ${showFileManager ? 'active' : ''}`}
                        onClick={() => { setShowSettings(false); setShowFileManager(true) }}
                    >
                        <FolderOpenIcon size={22} />
                        <span className="tab-label">Library</span>
                    </button>
                    <button
                        className={`mobile-footer-tab ${showSettings ? 'active' : ''}`}
                        onClick={() => { setShowFileManager(false); setShowSettings(true) }}
                    >
                        <SettingsIcon size={22} />
                        <span className="tab-label">Settings</span>
                    </button>
                </nav>

                {showSettings && (
                    <SettingsModal
                        settings={settings}
                        onUpdateSettings={setSettings}
                        onClose={() => setShowSettings(false)}
                    />
                )}

                {showFileManager && (
                    <FileManager
                        tracks={musicLibrary}
                        userId={user.id}
                        onClose={() => setShowFileManager(false)}
                        onRefresh={refreshMusicLibrary}
                    />
                )}
            </div>
        </>
    )
}

function App() {
    return (
        <SupabaseProvider>
            <AppContent />
        </SupabaseProvider>
    )
}

export default App
