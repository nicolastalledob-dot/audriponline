import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'

// ... existing imports ...
import { Play as PlayIcon, Pause as PauseIcon, SkipBack as SkipBackIcon, SkipForward as SkipForwardIcon, Volume2 as VolumeIcon, VolumeX as MuteIcon, Music as MusicIcon, Search as SearchIcon, Sparkles as SparklesIcon, MoreHorizontal as MoreIcon, ListMusic as PlaylistIcon, Plus as PlusIcon, X as CloseIcon, ArrowLeft as BackIcon, Trash2 as TrashIcon, Upload as UploadIcon, Edit2 as EditIcon, Shuffle as ShuffleIcon, Repeat as RepeatIcon, Repeat1 as Repeat1Icon, Minus as MinusIcon, ArrowUpDown as SortIcon, Save as SaveIcon, Clock as ClockIcon, Moon as MoonIcon, List as CompactIcon, ListOrdered as QueueIcon, Activity as WaveformIcon, Disc as DiscIcon } from 'lucide-react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Track, CloudPlaylist, FxPreset as FxPresetType } from '../types'
import { THEME_PRESETS, ThemeKey } from './SettingsModal'
import CoverArtCube3D from './CoverArtCube3D'
import * as db from '../lib/serverDb'
import { generateUuid } from '../lib/uuid'
const VinylDisc3D = lazy(() => import('./VinylDisc3D'))
const CD3D = lazy(() => import('./CD3D'))

interface MusicPlayerProps {
    isActive: boolean
    initialTracks?: Track[]
    onRefreshTracks?: () => Promise<Track[]>
    crossfadeDuration?: number
    theme?: string
    accentColor?: string
    adaptiveColors?: boolean
    playerModel?: 'cube' | 'vinyl' | 'cd'
    displayMode?: 'default' | 'spinning'
    userId: string
}

interface ArtAnalysis {
    color: string
    theme: ThemeKey
}

// Map dominant hue to the most fitting theme
function hueToTheme(hue: number, avgLightness: number): ThemeKey {
    // Very bright images → light theme
    if (avgLightness > 0.65) return 'light'
    // Very dark & desaturated → dark
    if (avgLightness < 0.2) return 'dark'

    // Map hue ranges to themed variants
    if (hue < 30 || hue >= 330) return 'rose'       // red/pink
    if (hue < 60) return 'sunset'                     // orange/warm
    if (hue < 150) return 'forest'                    // yellow-green/green
    if (hue < 210) return 'ocean'                     // cyan/teal
    if (hue < 270) return 'nord'                      // blue
    return 'synthwave'                                 // purple/magenta
}

function analyzeAlbumArt(imgSrc: string): Promise<ArtAnalysis | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas')
                const size = 40
                canvas.width = size
                canvas.height = size
                const ctx = canvas.getContext('2d')
                if (!ctx) { resolve(null); return }

                ctx.drawImage(img, 0, 0, size, size)
                const { data } = ctx.getImageData(0, 0, size, size)

                // Group pixels into 12 hue buckets (30 degrees each)
                const buckets: Array<{ totalR: number; totalG: number; totalB: number; count: number; satSum: number }> = Array.from(
                    { length: 12 }, () => ({ totalR: 0, totalG: 0, totalB: 0, count: 0, satSum: 0 })
                )

                // Track overall image brightness
                let totalLightness = 0
                const pixelCount = data.length / 4

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i + 1], b = data[i + 2]
                    const max = Math.max(r, g, b), min = Math.min(r, g, b)
                    const delta = max - min
                    const l = (max + min) / 510
                    const s = delta === 0 ? 0 : delta / (255 * (1 - Math.abs(2 * l - 1)))

                    totalLightness += l

                    // Skip desaturated, very dark, or very bright pixels for color extraction
                    if (s < 0.2 || l < 0.1 || l > 0.85) continue

                    let h = 0
                    if (delta !== 0) {
                        if (max === r) h = 60 * (((g - b) / delta) % 6)
                        else if (max === g) h = 60 * ((b - r) / delta + 2)
                        else h = 60 * ((r - g) / delta + 4)
                        if (h < 0) h += 360
                    }

                    const bucket = Math.min(11, Math.floor(h / 30))
                    buckets[bucket].totalR += r
                    buckets[bucket].totalG += g
                    buckets[bucket].totalB += b
                    buckets[bucket].count++
                    buckets[bucket].satSum += s
                }

                const avgLightness = totalLightness / pixelCount

                // Pick the bucket with the best score (count * average saturation)
                let bestBucket = -1
                let bestScore = 0
                for (let i = 0; i < 12; i++) {
                    const b = buckets[i]
                    if (b.count === 0) continue
                    const score = b.count * (b.satSum / b.count)
                    if (score > bestScore) {
                        bestScore = score
                        bestBucket = i
                    }
                }

                if (bestBucket === -1) {
                    // No vibrant colors found — pick theme from brightness alone
                    resolve({ color: '#888888', theme: avgLightness > 0.5 ? 'light' : 'dark' })
                    return
                }

                const b = buckets[bestBucket]
                const avgR = Math.round(b.totalR / b.count)
                const avgG = Math.round(b.totalG / b.count)
                const avgB = Math.round(b.totalB / b.count)

                // Boost saturation slightly for a more vivid accent
                const max = Math.max(avgR, avgG, avgB), min = Math.min(avgR, avgG, avgB)
                const mid = (max + min) / 2
                const boost = 1.3
                const finalR = Math.min(255, Math.round(mid + (avgR - mid) * boost))
                const finalG = Math.min(255, Math.round(mid + (avgG - mid) * boost))
                const finalB = Math.min(255, Math.round(mid + (avgB - mid) * boost))

                const color = '#' + [finalR, finalG, finalB].map(v => Math.max(0, v).toString(16).padStart(2, '0')).join('')
                const dominantHue = bestBucket * 30 + 15
                const theme = hueToTheme(dominantHue, avgLightness)

                resolve({ color, theme })
            } catch {
                resolve(null)
            }
        }
        img.onerror = () => resolve(null)
        img.src = imgSrc
    })
}

const EQ_BANDS = [
    { freq: 60, label: '60', type: 'lowshelf' as const },
    { freq: 170, label: '170', type: 'peaking' as const },
    { freq: 310, label: '310', type: 'peaking' as const },
    { freq: 600, label: '600', type: 'peaking' as const },
    { freq: 1000, label: '1k', type: 'peaking' as const },
    { freq: 3000, label: '3k', type: 'peaking' as const },
    { freq: 6000, label: '6k', type: 'peaking' as const },
    { freq: 12000, label: '12k', type: 'highshelf' as const },
]

function makeDistortionCurve(amount: number) {
    const k = amount * 100
    const samples = 44100
    const curve = new Float32Array(samples)
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x))
    }
    return curve as unknown as Float32Array<ArrayBuffer>
}

function formatTime(time: number) {
    if (!time || isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

const MarqueeText = ({ text }: { text: string }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const textRef = useRef<HTMLDivElement>(null)
    const [shouldAnimate, setShouldAnimate] = useState(false)

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const contentWidth = textRef.current.children[0]?.clientWidth || 0
                const containerWidth = containerRef.current.clientWidth
                setShouldAnimate(contentWidth > containerWidth)
            }
        }
        checkOverflow()
        const timeout = setTimeout(checkOverflow, 100)
        window.addEventListener('resize', checkOverflow)
        return () => {
            window.removeEventListener('resize', checkOverflow)
            clearTimeout(timeout)
        }
    }, [text])

    return (
        <div className={`header-title-wrapper ${shouldAnimate ? 'mask-enabled' : ''}`} ref={containerRef}>
            <div className={`marquee-track ${shouldAnimate ? 'animate' : ''}`} ref={textRef}>
                <h2 className="header-title">{text}</h2>
                {shouldAnimate && <h2 className="header-title" aria-hidden="true">{text}</h2>}
            </div>
        </div>
    )
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export default function MusicPlayer({ isActive, initialTracks, onRefreshTracks, crossfadeDuration = 0, adaptiveColors = false, playerModel = 'cube', displayMode = 'default', userId }: MusicPlayerProps) {
    const [tracks, setTracks] = useState<Track[]>(initialTracks || [])
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(() => {
        const savedVol = localStorage.getItem('audrip-volume')
        return savedVol ? parseFloat(savedVol) : 1
    })

    // Save volume to localStorage
    useEffect(() => {
        localStorage.setItem('audrip-volume', volume.toString())
    }, [volume])
    const [isLoading, setIsLoading] = useState(!initialTracks || initialTracks.length === 0)
    const [searchTerm, setSearchTerm] = useState('')

    // --- PLAYLIST STATE ---
    const [playlists, setPlaylists] = useState<CloudPlaylist[]>([])
    const [playlistTrackIds, setPlaylistTrackIds] = useState<Record<string, string[]>>({}) // playlistId -> trackIds

    const [showPlaylistBrowser, setShowPlaylistBrowser] = useState(false)
    const [activePlaylist, setActivePlaylist] = useState<CloudPlaylist | null>(null)
    const [showPlaylistModal, setShowPlaylistModal] = useState(false)
    const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null)
    const [trackMenuOpen, setTrackMenuOpen] = useState<string | null>(null) // track id
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null)
    const [isClosingBrowser, setIsClosingBrowser] = useState(false)
    const [newPlaylistImage, setNewPlaylistImage] = useState<string | null>(null)
    const [editingPlaylist, setEditingPlaylist] = useState<CloudPlaylist | null>(null)
    const [isDraggingImage, setIsDraggingImage] = useState(false)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [scrubTime, setScrubTime] = useState(0)
    // --- PLAYBACK CONTROL STATE ---
    const [isShuffle, setIsShuffle] = useState(false)
    const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('all')
    const shuffleHistoryRef = useRef<number[]>([])
    const [sortBy, setSortBy] = useState<'default' | 'title' | 'artist' | 'duration' | 'recent'>('default')

    // --- COMPACT MODE ---
    const [isCompact, setIsCompact] = useState(false)

    // --- MOBILE VIEW TOGGLE ---
    const [mobileView, setMobileView] = useState<'playing' | 'library'>('playing')

    // --- SLEEP TIMER ---
    const [sleepTimerMode, setSleepTimerMode] = useState<'off' | 'time' | 'endOfTrack'>('off')
    const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null)
    const [sleepTimerRemaining, setSleepTimerRemaining] = useState('')
    const [showSleepMenu, setShowSleepMenu] = useState(false)
    const sleepTimerModeRef = useRef<'off' | 'time' | 'endOfTrack'>('off')

    // --- PLAYBACK QUEUE ---
    const [playbackQueue, setPlaybackQueue] = useState<Track[]>([])
    const [showQueueView, setShowQueueView] = useState(false)

    // --- METADATA EDIT ---
    const [editingTrackMeta, setEditingTrackMeta] = useState<Track | null>(null)
    const [metaEditValues, setMetaEditValues] = useState({ title: '', artist: '', album: '' })

    // --- COVER ART ---
    const [displayedArt, setDisplayedArt] = useState<string | null>(null)
    const [artColor, setArtColor] = useState<string | null>(null)

    // --- VIRTUALIZATION ---
    const ITEM_HEIGHT = 44 // Height of each track item in pixels (compact: 36)
    const ITEM_HEIGHT_COMPACT = 36
    const OVERSCAN = 5 // Extra items to render above/below viewport
    const tracklistRef = useRef<HTMLDivElement>(null)
    const [scrollTop, setScrollTop] = useState(0)
    const [containerHeight, setContainerHeight] = useState(400)

    // Cover art: in cloud mode, art is already in the track record
    const getTrackCoverArt = useCallback((track: Track | null | undefined): string | null => {
        if (!track) return null
        return track.coverArt ?? null
    }, [])

    // --- AUDIO EFFECTS STATE ---
    const [showFx, setShowFx] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const [fxTab, setFxTab] = useState<'tone' | 'space' | 'eq' | 'presets'>('tone')
    const [bassLevel, setBassLevel] = useState(0)       // -10 to 15
    const [reverbLevel, setReverbLevel] = useState(0)   // 0 to 3
    const [pitchLevel, setPitchLevel] = useState(1)     // 0.25 to 3
    const [delayLevel, setDelayLevel] = useState(0)     // 0 to 1 (Mix)
    const [stereoWidthLevel, setStereoWidthLevel] = useState(0) // 0 to 1 (Haas Mix)
    const [panningLevel, setPanningLevel] = useState(0)    // -1 to 1 (L to R)
    // 8-band EQ
    const [eqBands, setEqBands] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0])
    const [distortLevel, setDistortLevel] = useState(0) // 0 (clean) to 1 (max distortion)

    // Phase 4: A-B Loop
    const [loopA, setLoopA] = useState<number | null>(null)
    const [loopB, setLoopB] = useState<number | null>(null)
    const [isLoopActive, setIsLoopActive] = useState(false)

    // Waveform panel
    const [showWaveform, setShowWaveform] = useState(false)

    // --- GYM TIMER ---
    const [gymTimerEnd, setGymTimerEnd] = useState<number | null>(null)
    const [gymTimerRemaining, setGymTimerRemaining] = useState('')
    const [showGymPicker, setShowGymPicker] = useState(false)
    const [gymPickerMin, setGymPickerMin] = useState(1)
    const [gymPickerSec, setGymPickerSec] = useState(30)
    const gymMinColRef = useRef<HTMLDivElement>(null)
    const gymSecColRef = useRef<HTMLDivElement>(null)

    // --- FX PRESETS STATE ---
    const [fxPresets, setFxPresets] = useState<FxPresetType[]>([])
    const [activePresetId, setActivePresetId] = useState<string | null>(null)
    const [showPresetNameModal, setShowPresetNameModal] = useState(false)
    const [presetNameInput, setPresetNameInput] = useState('')

    // --- 3D DISC TRANSITION STATE ---
    const [isVisualReady, setIsVisualReady] = useState(false)
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const currentTrackIdRef = useRef<string | null>(null)
    const [frozen3D, setFrozen3D] = useState<{ src: string | null; artist?: string; album?: string; color?: string }>({ src: null })
    const [bgLayer, setBgLayer] = useState<{ a: string | null; b: string | null; active: 'a' | 'b' }>({ a: null, b: null, active: 'a' })

    const loadFxPresets = useCallback(async () => {
        try {
            const presets = await db.getFxPresets(userId)
            setFxPresets(presets)
        } catch (error) {
            console.error('Failed to load FX presets:', error)
        }
    }, [userId])

    const applyPreset = (preset: FxPresetType) => {
        setBassLevel(preset.bass)
        setReverbLevel(preset.reverb)
        setPitchLevel(preset.pitch)
        setDelayLevel(preset.delay)
        setStereoWidthLevel(preset.stereoWidth)
        setDistortLevel(preset.distort ?? 0)
        setActivePresetId(preset.id)
    }

    const handleSavePreset = async () => {
        setPresetNameInput('')
        setShowPresetNameModal(true)
    }

    const confirmSavePreset = async () => {
        const name = presetNameInput.trim()
        if (!name) return

        try {
            const saved = await db.saveFxPreset({
                id: activePresetId || undefined,
                userId,
                name,
                bass: bassLevel,
                reverb: reverbLevel,
                pitch: pitchLevel,
                delay: delayLevel,
                stereoWidth: stereoWidthLevel,
                distort: distortLevel
            })
            setActivePresetId(saved.id)
            const presets = await db.getFxPresets(userId)
            setFxPresets(presets)
        } catch (error) {
            console.error('Failed to save FX preset:', error)
        }
        setShowPresetNameModal(false)
        setPresetNameInput('')
    }

    const handleDeletePreset = async (presetId?: string) => {
        const idToDelete = presetId || activePresetId
        if (!idToDelete) return
        try {
            await db.deleteFxPreset(idToDelete)
            const presets = await db.getFxPresets(userId)
            setFxPresets(presets)
            if (activePresetId === idToDelete) setActivePresetId(null)
        } catch (error) {
            console.error('Failed to delete FX preset:', error)
        }
    }

    // Mark preset as custom when any slider changes
    const markCustom = () => setActivePresetId(null)

    const closeFxPanel = () => {
        setIsClosing(true)
        setTimeout(() => {
            setShowFx(false)
            setIsClosing(false)
        }, 200)
    }

    // Helper to get track IDs for a playlist
    const getPlaylistTrackIds = useCallback((playlistId: string): string[] => {
        return playlistTrackIds[playlistId] || []
    }, [playlistTrackIds])

    // Get tracks for current view (all library or active playlist), sorted
    const displayTracks = useMemo(() => {
        let result = activePlaylist
            ? tracks.filter(t => getPlaylistTrackIds(activePlaylist.id).includes(t.id))
            : [...tracks]

        if (sortBy === 'title') {
            result.sort((a, b) => a.title.localeCompare(b.title))
        } else if (sortBy === 'artist') {
            result.sort((a, b) => a.artist.localeCompare(b.artist))
        } else if (sortBy === 'duration') {
            result.sort((a, b) => a.duration - b.duration)
        } else if (sortBy === 'recent') {
            result.reverse()
        }

        return result
    }, [tracks, activePlaylist, sortBy])

    // Sync tracks when initialTracks prop changes (preloaded from parent)
    useEffect(() => {
        if (!initialTracks || initialTracks.length === 0) return

        setTracks(prevTracks => {
            // Skip update if track list hasn't actually changed
            if (prevTracks.length === initialTracks.length &&
                prevTracks.every((t, i) => t.id === initialTracks[i].id)) {
                return prevTracks
            }

            // Preserve current track position
            if (prevTracks.length > 0 && currentTrackIndex >= 0) {
                const currentId = prevTracks[currentTrackIndex]?.id
                const newIndex = initialTracks.findIndex(t => t.id === currentId)
                if (newIndex !== -1 && newIndex !== currentTrackIndex) {
                    setCurrentTrackIndex(newIndex)
                }
            }
            return initialTracks
        })
        setIsLoading(false)
        // Don't auto-select first track - let user choose to avoid loading audio on startup
    }, [initialTracks])

    const filteredTracks = useMemo(() =>
        displayTracks.filter(track =>
            track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            track.artist.toLowerCase().includes(searchTerm.toLowerCase())
        ), [displayTracks, searchTerm])

    // Virtualization: calculate visible items
    const virtualizedData = useMemo(() => {
        const itemHeight = isCompact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT
        const totalHeight = filteredTracks.length * itemHeight
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN)
        const visibleCount = Math.ceil(containerHeight / itemHeight) + OVERSCAN * 2
        const endIndex = Math.min(filteredTracks.length, startIndex + visibleCount)
        const visibleTracks = filteredTracks.slice(startIndex, endIndex).map((track, i) => ({
            track,
            index: startIndex + i,
            style: {
                position: 'absolute' as const,
                top: (startIndex + i) * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight
            }
        }))
        return { totalHeight, visibleTracks, startIndex }
    }, [filteredTracks, scrollTop, containerHeight, isCompact])

    const audioRef = useRef<HTMLAudioElement | null>(null)
    const bgAudioRef = useRef<HTMLAudioElement | null>(null) // Background bypass audio (iOS)
    const bgSwapRef = useRef(false) // Flag to ignore pause/play events during bg swap
    const currentAudioPathRef = useRef<string | null>(null)
    const shouldAutoPlayRef = useRef<boolean>(false) // Track if we should auto-play next track
    const currentTimeRef = useRef(0) // Internal currentTime updated on every timeupdate
    const lastTimeUpdateRef = useRef(0) // Timestamp of last setCurrentTime call

    // Phase 4 Refs for Loop
    const loopARef = useRef<number | null>(null)
    const loopBRef = useRef<number | null>(null)
    const isLoopActiveRef = useRef<boolean>(false)

    // Web Audio API Refs
    const audioContextRef = useRef<AudioContext | null>(null)
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)

    // Nodes
    const distortNodeRef = useRef<WaveShaperNode | null>(null)
    const bassNodeRef = useRef<BiquadFilterNode | null>(null)
    const reverbNodeRef = useRef<ConvolverNode | null>(null)
    const delayNodeRef = useRef<DelayNode | null>(null)
    const delayGainNodeRef = useRef<GainNode | null>(null)

    // Gains
    const dryGainNodeRef = useRef<GainNode | null>(null)
    const wetGainNodeRef = useRef<GainNode | null>(null) // Reverb
    const stereoWidthGainNodeRef = useRef<GainNode | null>(null) // Haas
    const pannerNodeRef = useRef<StereoPannerNode | null>(null)
    // 8-band EQ
    const eqNodesRef = useRef<BiquadFilterNode[]>([])

    // Waveform refs
    const waveformContainerRef = useRef<HTMLDivElement>(null)
    const wavesurferRef = useRef<WaveSurfer | null>(null)
    const regionsPluginRef = useRef<RegionsPlugin | null>(null)
    const loopRegionRef = useRef<any>(null)
    const wavesurferLoadedPathRef = useRef<string | null>(null)
    const waveformPeaksCache = useRef<Map<string, { peaks: Float32Array[], duration: number }>>(new Map())

    // Crossfade
    const crossfadeActiveRef = useRef(false)
    const crossfadeDurationRef = useRef(crossfadeDuration)

    // Sync crossfade duration ref
    useEffect(() => { crossfadeDurationRef.current = crossfadeDuration }, [crossfadeDuration])

    // Sync loop state with refs
    useEffect(() => {
        loopARef.current = loopA
        loopBRef.current = loopB
        isLoopActiveRef.current = isLoopActive
    }, [loopA, loopB, isLoopActive])

    // Precision A-B loop via rAF (~60fps check instead of timeupdate ~4/sec)
    useEffect(() => {
        if (!isLoopActive || loopA === null || loopB === null) return
        const audio = audioRef.current
        if (!audio) return
        let rafId = 0
        const check = () => {
            if (audio.currentTime >= loopBRef.current!) {
                audio.currentTime = loopARef.current!
            }
            rafId = requestAnimationFrame(check)
        }
        rafId = requestAnimationFrame(check)
        return () => cancelAnimationFrame(rafId)
    }, [isLoopActive, loopA, loopB])

    const currentTrack = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null

    // Update displayed art when current track changes
    // Update displayed art when current track changes
    useEffect(() => {
        if (!currentTrack) { setDisplayedArt(null); return }

        if (currentTrack.coverArt) {
            setDisplayedArt(currentTrack.coverArt)
        } else {
            // Reset to prevent showing stale art while loading
            setDisplayedArt(null)

            // Fetch high-res cover art on demand
            db.getTrackCoverArt(currentTrack.id).then(art => {
                // Only update if we're still on the same track
                if (currentTrackIndex >= 0 && tracks[currentTrackIndex]?.id === currentTrack.id) {
                    setDisplayedArt(art)
                }
            })
        }
    }, [currentTrack?.id, currentTrack?.coverArt])

    // --- 3D Disc slide-out/in transition on track change ---
    useEffect(() => {
        if (currentTrack?.id === currentTrackIdRef.current) return
        currentTrackIdRef.current = currentTrack?.id || null

        setIsVisualReady(false)

        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)

        if (!currentTrack) return

        const minDelay = 600
        const artSrc = currentTrack.coverArt || ''

        const preloadOp = new Promise<void>((resolve) => {
            if (!artSrc) { resolve(); return }
            const img = new Image()
            img.src = artSrc
            img.onload = () => resolve()
            img.onerror = () => resolve()
        })

        const delayOp = new Promise<void>((resolve) => {
            transitionTimeoutRef.current = setTimeout(resolve, minDelay)
        })

        Promise.all([preloadOp, delayOp]).then(() => {
            if (currentTrackIdRef.current === currentTrack.id) {
                setIsVisualReady(true)
            }
        })

        return () => {
            if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
        }
    }, [currentTrack])

    // Sync frozen 3D props only when visual is on-screen (keeps old art during exit animation)
    useEffect(() => {
        if (isVisualReady) {
            setFrozen3D({
                src: displayedArt,
                artist: currentTrack?.artist,
                album: currentTrack?.album,
                color: artColor || undefined,
            })
        }
    }, [isVisualReady, displayedArt, currentTrack?.artist, currentTrack?.album, artColor])

    // Background blur crossfade: alternate between two layers
    const effectiveBgArt = useMemo(() => {
        if (activePlaylist?.coverArt) return activePlaylist.coverArt
        if (displayedArt) return displayedArt
        if (activePlaylist) {
            const firstTrackId = getPlaylistTrackIds(activePlaylist.id)[0]
            const firstTrack = tracks.find(t => t.id === firstTrackId)
            if (firstTrack) return getTrackCoverArt(firstTrack)
        }
        return null
    }, [activePlaylist?.coverArt, displayedArt, activePlaylist, tracks, getPlaylistTrackIds, getTrackCoverArt])

    useEffect(() => {
        setBgLayer(prev => {
            if (prev.active === 'a') {
                return { ...prev, b: effectiveBgArt, active: 'b' }
            } else {
                return { ...prev, a: effectiveBgArt, active: 'a' }
            }
        })
    }, [effectiveBgArt])

    // Analyze album art once — sets both adaptive CSS vars and artColor for 3D model
    useEffect(() => {
        if (!displayedArt) { setArtColor(null); return }

        let cancelled = false
        analyzeAlbumArt(displayedArt).then(result => {
            if (cancelled) return

            // Always set artColor (used by 3D cube/vinyl/CD)
            setArtColor(result?.color || null)

            // Apply adaptive theme colors if enabled
            if (!adaptiveColors || !result) return

            const hexToRgb = (hex: string) => ({
                r: parseInt(hex.slice(1, 3), 16),
                g: parseInt(hex.slice(3, 5), 16),
                b: parseInt(hex.slice(5, 7), 16)
            })
            const darken = (r: number, g: number, b: number, pct: number) => ({
                r: Math.round(r * (1 - pct / 100)),
                g: Math.round(g * (1 - pct / 100)),
                b: Math.round(b * (1 - pct / 100))
            })
            const rgbToHex = (r: number, g: number, b: number) =>
                '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

            const root = document.documentElement.style

            // Apply accent color
            const accent = hexToRgb(result.color)
            const secondary = darken(accent.r, accent.g, accent.b, 20)
            const tertiary = darken(accent.r, accent.g, accent.b, 35)

            root.setProperty('--accent-rgb', `${accent.r}, ${accent.g}, ${accent.b}`)
            root.setProperty('--accent-primary', result.color)
            root.setProperty('--accent-secondary', rgbToHex(secondary.r, secondary.g, secondary.b))
            root.setProperty('--accent-tertiary', rgbToHex(tertiary.r, tertiary.g, tertiary.b))
            root.setProperty('--accent-success', result.color)
            root.setProperty('--shadow-glow', `0 0 20px rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.3)`)

            // Apply matching theme
            const preset = THEME_PRESETS[result.theme]
            const c = preset.colors
            root.setProperty('--bg-primary', c.bgPrimary)
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
        })

        return () => { cancelled = true }
    }, [displayedArt, adaptiveColors])

    // No need to fetch cover art for playlist tracks - already in track record

    // Helper: Create Reverb Impulse
    const createReverbImpulse = (ctx: AudioContext) => {
        const duration = 2.5
        const decay = 2.0
        const sampleRate = ctx.sampleRate
        const length = sampleRate * duration
        const impulse = ctx.createBuffer(2, length, sampleRate)
        const left = impulse.getChannelData(0)
        const right = impulse.getChannelData(1)
        for (let i = 0; i < length; i++) {
            const n = i / length
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay)
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay)
        }
        return impulse
    }

    // Init Audio Context
    const initAudioContext = useCallback(() => {
        if (audioContextRef.current || !audioRef.current) return

        console.log("AudioFX: Initializing Context...")

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioContextClass(isIOS ? { sampleRate: 44100 } : undefined)
        audioContextRef.current = ctx

        // iOS requires AudioContext resume on user gesture
        if (ctx.state === 'suspended') {
            const resumeCtx = () => { ctx.resume(); document.removeEventListener('touchstart', resumeCtx) }
            document.addEventListener('touchstart', resumeCtx)
        }

        // --- Create Nodes ---
        const source = ctx.createMediaElementSource(audioRef.current)

        // Bass (Tone)
        const bassFilter = ctx.createBiquadFilter()
        bassFilter.type = 'lowshelf'
        bassFilter.frequency.value = 200

        // Distortion (WaveShaper)
        const distort = ctx.createWaveShaper()
        distort.curve = makeDistortionCurve(0)
        distort.oversample = '4x'

        // Panner (L/R)
        const panner = ctx.createStereoPanner()
        panner.pan.value = 0 // Center

        // Reverb (Space)
        const reverbConvolver = ctx.createConvolver()
        reverbConvolver.buffer = createReverbImpulse(ctx)

        // Delay (Echo)
        const delay = ctx.createDelay(1.0)
        delay.delayTime.value = 0.35 // 350ms echo
        const delayFeedback = ctx.createGain()
        delayFeedback.gain.value = 0.4 // 40% feedback
        const delayWetGain = ctx.createGain()
        delayWetGain.gain.value = 0

        // Stereo Width (Haas Effect)
        const widthSplitter = ctx.createChannelSplitter(2)
        const widthDelay = ctx.createDelay()
        widthDelay.delayTime.value = 0.015 // 15ms Haas
        const widthMerger = ctx.createChannelMerger(2)
        const widthGain = ctx.createGain()
        widthGain.gain.value = 0

        // Master Dry
        const dryGain = ctx.createGain()
        dryGain.gain.value = 1
        const wetGain = ctx.createGain() // Reverb level
        wetGain.gain.value = 0

        // --- Routing ---
        // Chain: Source -> Bass -> Distortion -> Panner -> HUB
        source.connect(bassFilter)
        bassFilter.connect(distort)
        distort.connect(panner)

        const hub = panner // The processed "dry signal" hub

        // Path A: Dry → dryGain → EQ → Destination
        hub.connect(dryGain)
        // 8-band EQ chain (in series)
        const eqFilters: BiquadFilterNode[] = EQ_BANDS.map((band) => {
            const filter = ctx.createBiquadFilter()
            filter.type = band.type
            filter.frequency.value = band.freq
            if (band.type === 'peaking') filter.Q.value = 1.0
            filter.gain.value = 0
            return filter
        })
        // dryGain → eq[0] → eq[1] → ... → eq[7] → destination
        dryGain.connect(eqFilters[0])
        for (let i = 0; i < eqFilters.length - 1; i++) {
            eqFilters[i].connect(eqFilters[i + 1])
        }
        eqFilters[eqFilters.length - 1].connect(ctx.destination)

        // Path B: Reverb
        hub.connect(reverbConvolver)
        reverbConvolver.connect(wetGain)
        wetGain.connect(ctx.destination)

        // Path C: Delay
        hub.connect(delay)
        delay.connect(delayFeedback)
        delayFeedback.connect(delay) // Loop
        delay.connect(delayWetGain)
        delayWetGain.connect(ctx.destination)

        // Path D: Stereo Width (Haas Side-chain)
        hub.connect(widthSplitter)
        widthSplitter.connect(widthMerger, 0, 0)
        widthSplitter.connect(widthDelay, 1)
        widthDelay.connect(widthMerger, 0, 1)
        widthMerger.connect(widthGain)
        widthGain.connect(ctx.destination)

        // Store Refs
        sourceNodeRef.current = source
        distortNodeRef.current = distort
        bassNodeRef.current = bassFilter
        pannerNodeRef.current = panner
        reverbNodeRef.current = reverbConvolver
        delayNodeRef.current = delay
        delayGainNodeRef.current = delayWetGain
        dryGainNodeRef.current = dryGain
        wetGainNodeRef.current = wetGain
        stereoWidthGainNodeRef.current = widthGain
        eqNodesRef.current = eqFilters

        // Apply Initial Values
        bassFilter.gain.value = bassLevel
        dryGain.gain.value = 1
        wetGain.gain.value = reverbLevel
        delayWetGain.gain.value = delayLevel
        widthGain.gain.value = stereoWidthLevel
        panner.pan.value = panningLevel
        distort.curve = makeDistortionCurve(distortLevel)

        console.log("AudioFX: Simplified graph connected successfully")
    }, [])

    // Initialize Audio Engine — only when an effect is actually used (not on first play)
    // This allows iOS to keep audio playing in the background via the native <audio> pipeline
    const hasActiveEffects = bassLevel !== 0 || reverbLevel !== 0 || delayLevel !== 0 ||
        stereoWidthLevel !== 0 || panningLevel !== 0 || distortLevel !== 0 ||
        eqBands.some(b => b !== 0)

    useEffect(() => {
        if (hasActiveEffects && !audioContextRef.current && audioRef.current) {
            initAudioContext()
        }
    }, [hasActiveEffects, initAudioContext])

    // iOS background audio: swap to bypass audio when AudioContext would be suspended
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                // Going to background — if AudioContext exists, swap to bypass audio
                if (audioContextRef.current && audioRef.current && !audioRef.current.paused) {
                    bgSwapRef.current = true
                    const bgAudio = new Audio()
                    bgAudio.crossOrigin = "anonymous"
                    bgAudio.src = audioRef.current.src
                    bgAudio.currentTime = audioRef.current.currentTime
                    bgAudio.volume = audioRef.current.volume
                    bgAudio.play().catch(console.error)
                    audioRef.current.pause()
                    bgAudioRef.current = bgAudio
                }
            } else {
                // Returning to foreground — swap back to AudioContext audio
                if (bgAudioRef.current && audioRef.current) {
                    const wasPlaying = !bgAudioRef.current.paused
                    const bgTime = bgAudioRef.current.currentTime
                    bgAudioRef.current.pause()
                    bgAudioRef.current.src = ''
                    bgAudioRef.current = null

                    audioRef.current.currentTime = bgTime

                    const resume = () => {
                        bgSwapRef.current = false
                        if (wasPlaying && audioRef.current) {
                            audioRef.current.play().catch(console.error)
                        }
                    }

                    if (audioContextRef.current?.state === 'suspended') {
                        audioContextRef.current.resume().then(resume).catch(resume)
                    } else {
                        resume()
                    }
                } else {
                    bgSwapRef.current = false
                    if (audioContextRef.current?.state === 'suspended') {
                        audioContextRef.current.resume()
                    }
                }
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [])


    // --- UPDATERS ---

    // Bass
    useEffect(() => {
        if (bassNodeRef.current && audioContextRef.current) {
            bassNodeRef.current.gain.setTargetAtTime(bassLevel, audioContextRef.current.currentTime, 0.1)
        }
    }, [bassLevel])

    // Distortion
    useEffect(() => {
        if (distortNodeRef.current) {
            distortNodeRef.current.curve = makeDistortionCurve(distortLevel)
        }
    }, [distortLevel])

    // Delay
    useEffect(() => {
        if (delayGainNodeRef.current && audioContextRef.current) {
            delayGainNodeRef.current.gain.setTargetAtTime(delayLevel, audioContextRef.current.currentTime, 0.1)
        }
    }, [delayLevel])

    // Stereo Width
    useEffect(() => {
        if (stereoWidthGainNodeRef.current && audioContextRef.current) {
            stereoWidthGainNodeRef.current.gain.setTargetAtTime(stereoWidthLevel, audioContextRef.current.currentTime, 0.1)
        }
    }, [stereoWidthLevel])

    // Reverb
    useEffect(() => {
        if (wetGainNodeRef.current && audioContextRef.current) {
            wetGainNodeRef.current.gain.setTargetAtTime(reverbLevel, audioContextRef.current.currentTime, 0.1)
        }
    }, [reverbLevel])

    // Pitch
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = pitchLevel
            // @ts-ignore
            if (audioRef.current.mozPreservesPitch !== undefined) audioRef.current.mozPreservesPitch = false;
            // @ts-ignore
            if (audioRef.current.webkitPreservesPitch !== undefined) audioRef.current.webkitPreservesPitch = false;
            // @ts-ignore
            audioRef.current.preservesPitch = false;
        }
    }, [pitchLevel])

    // Panning (L/R)
    useEffect(() => {
        if (pannerNodeRef.current && audioContextRef.current) {
            pannerNodeRef.current.pan.setTargetAtTime(panningLevel, audioContextRef.current.currentTime, 0.05)
        }
    }, [panningLevel])

    // 8-band EQ
    useEffect(() => {
        if (eqNodesRef.current.length > 0 && audioContextRef.current) {
            eqBands.forEach((gain, i) => {
                if (eqNodesRef.current[i]) {
                    eqNodesRef.current[i].gain.setTargetAtTime(gain, audioContextRef.current!.currentTime, 0.05)
                }
            })
        }
    }, [eqBands])

    // --- WAVESURFER INIT (once, persists across show/hide) ---
    const wavesurferInitialized = useRef(false)
    useEffect(() => {
        if (!waveformContainerRef.current || !audioRef.current) return
        if (wavesurferInitialized.current) return // Already created
        wavesurferInitialized.current = true

        // Compute waveColor from CSS var (wavesurfer can't resolve rgba(var(...)))
        const cs = getComputedStyle(document.documentElement)
        const overlayRgb = cs.getPropertyValue('--overlay-rgb').trim() || '255,255,255'
        const accentPrimary = cs.getPropertyValue('--accent-primary').trim() || '#00ff88'

        const regions = RegionsPlugin.create()
        regionsPluginRef.current = regions

        const ws = WaveSurfer.create({
            container: waveformContainerRef.current,
            height: 60,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            waveColor: `rgba(${overlayRgb}, 0.3)`,
            progressColor: accentPrimary,
            cursorColor: accentPrimary,
            cursorWidth: 1,
            interact: false,
            minPxPerSec: 1,
            autoScroll: false,
            autoCenter: false,
            plugins: [regions],
        })

        wavesurferRef.current = ws
        // Mute wavesurfer's internal audio element (we only use it for visualization)
        const wsMedia = ws.getMediaElement()
        if (wsMedia) wsMedia.volume = 0
        const container = waveformContainerRef.current

        // The scrollable wrapper wavesurfer creates inside our container
        const getWrapper = () => container.querySelector('div') as HTMLElement | null

        // --- Ctrl+Scroll / Pinch = zoom centered on mouse ---
        // --- Normal scroll = horizontal pan (native overflow-x on wrapper) ---
        const applyScrollAfterZoom = (time: number, offsetPx: number) => {
            // Double rAF ensures the DOM has updated after ws.zoom()
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const wrapper = getWrapper()
                    if (!wrapper) return
                    const dur = ws.getDuration() || 1
                    const newPx = (time / dur) * wrapper.scrollWidth
                    wrapper.scrollLeft = newPx - offsetPx
                })
            })
        }

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return // normal scroll → let it pan natively

            e.preventDefault()
            const wrapper = getWrapper()
            if (!wrapper) return

            const currentZoom = ws.options.minPxPerSec || 1
            // Gentle zoom: ~5% per step
            const factor = e.deltaY > 0 ? 0.95 : 1.05
            const newZoom = Math.max(1, Math.min(500, currentZoom * factor))
            if (newZoom === currentZoom) return

            // Time under the mouse before zoom
            const rect = container.getBoundingClientRect()
            const mouseOffsetPx = e.clientX - rect.left
            const pxFromLeft = mouseOffsetPx + wrapper.scrollLeft
            const dur = ws.getDuration() || 1
            const timeAtMouse = (pxFromLeft / (wrapper.scrollWidth || 1)) * dur

            ws.zoom(newZoom)
            applyScrollAfterZoom(timeAtMouse, mouseOffsetPx)
        }
        container.addEventListener('wheel', onWheel, { passive: false })

        // --- Click + drag on waveform = draw loop region ---
        const accentRgb = cs.getPropertyValue('--accent-rgb').trim() || '0,255,136'
        const regionColor = `rgba(${accentRgb}, 0.15)`

        regions.enableDragSelection({ color: regionColor })

        regions.on('region-created', (region) => {
            // Replace previous region
            if (loopRegionRef.current && loopRegionRef.current.id !== region.id) {
                loopRegionRef.current.remove()
            }
            loopRegionRef.current = region
            setLoopA(region.start)
            setLoopB(region.end)
            setIsLoopActive(true)
        })

        regions.on('region-updated', (region) => {
            if (loopRegionRef.current?.id === region.id) {
                setLoopA(region.start)
                setLoopB(region.end)
            }
        })

        // --- Click on waveform = seek audio to that position ---
        let pointerDownX = 0
        const onPointerDown = (e: PointerEvent) => { pointerDownX = e.clientX }
        const onClick = (e: MouseEvent) => {
            // Ignore if it was a drag (region creation)
            if (Math.abs(e.clientX - pointerDownX) > 5) return
            const wrapper = getWrapper()
            if (!wrapper) return
            const dur = ws.getDuration()
            if (dur <= 0) return
            const rect = wrapper.getBoundingClientRect()
            const clickPx = e.clientX - rect.left + wrapper.scrollLeft
            const time = (clickPx / wrapper.scrollWidth) * dur
            if (audioRef.current) {
                let seekTime = Math.max(0, Math.min(time, audioRef.current.duration || dur))
                // Clamp near loop end so the loop logic doesn't immediately snap to loopA
                if (isLoopActiveRef.current && loopBRef.current !== null && seekTime >= loopBRef.current - 0.05) {
                    seekTime = loopBRef.current - 0.05
                }
                audioRef.current.currentTime = seekTime
            }
        }
        container.addEventListener('pointerdown', onPointerDown)
        container.addEventListener('click', onClick)

        // Sync cursor position at ~60fps via rAF (timeupdate is too slow ~4/sec)
        const audio = audioRef.current
        let rafId = 0
        const syncCursor = () => {
            if (ws && audio) {
                const dur = ws.getDuration()
                if (dur > 0) {
                    ws.setTime(audio.currentTime)
                }
            }
            rafId = requestAnimationFrame(syncCursor)
        }
        rafId = requestAnimationFrame(syncCursor)

        // Cache peaks after decode
        ws.on('ready', () => {
            const decoded = ws.getDecodedData()
            const loadedTrack = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null
            if (decoded && loadedTrack) {
                const peaks = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i))
                waveformPeaksCache.current.set(loadedTrack.id, { peaks, duration: decoded.duration })
            }
        })

        // Load current track
        const track = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null
        if (track) {
            ws.load(track.fileUrl).catch(() => { })
            wavesurferLoadedPathRef.current = track.id
        }

        return () => {
            cancelAnimationFrame(rafId)
            container.removeEventListener('pointerdown', onPointerDown)
            container.removeEventListener('click', onClick)
            container.removeEventListener('wheel', onWheel)
            ws.destroy()
            wavesurferRef.current = null
            regionsPluginRef.current = null
            loopRegionRef.current = null
            wavesurferLoadedPathRef.current = null
            wavesurferInitialized.current = false
        }
    }, [showWaveform])

    // --- WAVESURFER REDRAW on show (container was display:none, canvas needs refresh) ---
    useEffect(() => {
        if (!showWaveform || !wavesurferRef.current) return
        const ws = wavesurferRef.current
        // Wait one frame for display:none → visible, then re-render waveform + regions
        const id = requestAnimationFrame(() => {
            const decoded = ws.getDecodedData()
            if (decoded) {
                ws.zoom(ws.options.minPxPerSec || 1)
            }
        })
        return () => cancelAnimationFrame(id)
    }, [showWaveform])

    // --- WAVESURFER TRACK SYNC ---
    useEffect(() => {
        if (!wavesurferRef.current || !audioRef.current) return
        const track = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null
        if (!track || wavesurferLoadedPathRef.current === track.id) return

        // Re-load new track — use cached peaks if available
        const cached = waveformPeaksCache.current.get(track.id)
        if (cached) {
            wavesurferRef.current.load('', cached.peaks, cached.duration).catch(() => { })
        } else {
            wavesurferRef.current.load(track.fileUrl).catch(() => { })
        }
        wavesurferLoadedPathRef.current = track.id

        // Clear old visual region (loop state reset is handled by the main track-load effect)
        if (loopRegionRef.current) {
            loopRegionRef.current.remove()
            loopRegionRef.current = null
        }
    }, [currentTrackIndex, tracks])

    // --- WAVESURFER LOOP SYNC (A-B → region) ---
    useEffect(() => {
        if (!regionsPluginRef.current) return

        // Compute region color from CSS vars
        const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '0,255,136'
        const regionColor = `rgba(${accentRgb}, 0.15)`

        if (loopA !== null && loopB !== null && isLoopActive) {
            if (loopRegionRef.current) {
                loopRegionRef.current.setOptions({ start: loopA, end: loopB })
            } else {
                const region = regionsPluginRef.current.addRegion({
                    start: loopA,
                    end: loopB,
                    color: regionColor,
                    drag: true,
                    resize: true,
                })
                loopRegionRef.current = region
            }
        } else if (loopA !== null && loopB === null) {
            // A set but no B yet — show a thin marker
            if (loopRegionRef.current) {
                loopRegionRef.current.remove()
                loopRegionRef.current = null
            }
        } else if (!isLoopActive && loopRegionRef.current) {
            loopRegionRef.current.remove()
            loopRegionRef.current = null
        }
    }, [loopA, loopB, isLoopActive])

    // Load tracks
    const loadTracks = useCallback(async () => {
        setIsLoading(true)
        try {
            let loadedTracks: Track[]
            if (onRefreshTracks) {
                loadedTracks = await onRefreshTracks()
            } else {
                loadedTracks = await db.getTracks(userId)
            }
            setTracks(prevTracks => {
                if (prevTracks.length > 0 && currentTrackIndex >= 0) {
                    const currentId = prevTracks[currentTrackIndex].id
                    const newIndex = loadedTracks.findIndex((t: Track) => t.id === currentId)
                    if (newIndex !== -1 && newIndex !== currentTrackIndex) {
                        setCurrentTrackIndex(newIndex)
                    }
                }
                return loadedTracks
            })
            shuffleHistoryRef.current = []
        } catch (error) {
            console.error('Failed to load tracks:', error)
        } finally {
            setIsLoading(false)
        }
    }, [currentTrackIndex, onRefreshTracks, userId])

    // Load playlists
    const loadPlaylists = useCallback(async () => {
        try {
            const loadedPlaylists = await db.getPlaylists(userId)
            setPlaylists(loadedPlaylists)
            // Load track IDs for each playlist
            const trackIdsMap: Record<string, string[]> = {}
            for (const pl of loadedPlaylists) {
                trackIdsMap[pl.id] = await db.getPlaylistTracks(pl.id)
            }
            setPlaylistTrackIds(trackIdsMap)
        } catch (error) {
            console.error('Failed to load playlists:', error)
        }
    }, [userId])

    // Add track to playlist
    const handleAddToPlaylist = async (trackId: string, playlistId: string) => {
        try {
            await db.addTrackToPlaylist(playlistId, trackId)
            await loadPlaylists()
        } catch (error) {
            console.error('Failed to add track to playlist:', error)
        }
        setTrackMenuOpen(null)
    }

    // Remove track from playlist
    const handleRemoveFromPlaylist = async (trackId: string) => {
        if (!activePlaylist) return

        if (!window.confirm('Remove this track from the playlist?')) {
            setTrackMenuOpen(null)
            return
        }

        try {
            await db.removeTrackFromPlaylist(activePlaylist.id, trackId)
            await loadPlaylists()
        } catch (error) {
            console.error('Failed to remove track from playlist:', error)
        }
        setTrackMenuOpen(null)
    }

    // Save playlist (create or update)
    const handleSavePlaylist = async (name: string, description: string, coverArt: string | null) => {
        try {
            if (editingPlaylist) {
                const saved = await db.savePlaylist({
                    id: editingPlaylist.id,
                    userId,
                    name,
                    description,
                    coverArt,
                })
                await loadPlaylists()
                if (activePlaylist?.id === saved.id) {
                    setActivePlaylist(saved)
                }
            } else {
                const saved = await db.savePlaylist({
                    id: generateUuid(),
                    userId,
                    name,
                    description,
                    coverArt,
                })
                if (trackToAddToPlaylist) {
                    await db.addTrackToPlaylist(saved.id, trackToAddToPlaylist.id)
                    setTrackToAddToPlaylist(null)
                    setShowPlaylistBrowser(false)
                }
                await loadPlaylists()
            }
        } catch (error) {
            console.error('Failed to save playlist:', error)
        }
        setShowPlaylistModal(false)
        setEditingPlaylist(null)
        setNewPlaylistImage(null)
        setIsDraggingImage(false)
    }

    // Delete playlist
    const handleDeletePlaylist = async (playlistId: string) => {
        if (!window.confirm('Delete this playlist? This cannot be undone.')) return

        try {
            await db.deletePlaylist(playlistId)
            await loadPlaylists()
            if (activePlaylist?.id === playlistId) {
                setActivePlaylist(null)
            }
        } catch (error) {
            console.error('Failed to delete playlist:', error)
        }
    }

    // Helper to close browser with animation
    const closePlaylistBrowser = () => {
        setIsClosingBrowser(true)
        setTimeout(() => {
            setShowPlaylistBrowser(false)
            setIsClosingBrowser(false)
            setTrackToAddToPlaylist(null)
        }, 200)
    }

    // --- SLEEP TIMER LOGIC ---
    useEffect(() => { sleepTimerModeRef.current = sleepTimerMode }, [sleepTimerMode])

    const startSleepTimer = useCallback((minutes: number) => {
        setSleepTimerMode('time')
        setSleepTimerEnd(Date.now() + minutes * 60 * 1000)
        setShowSleepMenu(false)
    }, [])

    const startEndOfTrackSleep = useCallback(() => {
        setSleepTimerMode('endOfTrack')
        setSleepTimerEnd(null)
        setShowSleepMenu(false)
    }, [])

    const cancelSleepTimer = useCallback(() => {
        setSleepTimerMode('off')
        setSleepTimerEnd(null)
        setSleepTimerRemaining('')
        setShowSleepMenu(false)
    }, [])

    // Sleep timer countdown
    useEffect(() => {
        if (sleepTimerMode !== 'time' || !sleepTimerEnd) return
        const interval = setInterval(() => {
            const remaining = sleepTimerEnd - Date.now()
            if (remaining <= 0) {
                // Fade out and pause
                if (audioRef.current) {
                    const fadeSteps = 30
                    const fadeInterval = 100 // 3 second fade
                    const originalVolume = audioRef.current.volume
                    let step = 0
                    const fade = setInterval(() => {
                        step++
                        if (audioRef.current) {
                            audioRef.current.volume = Math.max(0, originalVolume * (1 - step / fadeSteps))
                        }
                        if (step >= fadeSteps) {
                            clearInterval(fade)
                            if (audioRef.current) {
                                audioRef.current.pause()
                                audioRef.current.volume = originalVolume
                            }
                        }
                    }, fadeInterval)
                }
                cancelSleepTimer()
            } else {
                const mins = Math.floor(remaining / 60000)
                const secs = Math.floor((remaining % 60000) / 1000)
                setSleepTimerRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [sleepTimerMode, sleepTimerEnd, cancelSleepTimer])

    // --- GYM TIMER LOGIC ---
    const playGymBlip = useCallback(() => {
        const ctx = new AudioContext()
        const playBeep = (time: number) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.frequency.value = 800
            gain.gain.value = 0.15
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start(time)
            osc.stop(time + 0.12)
        }
        const t = ctx.currentTime
        // beep beep
        playBeep(t)
        playBeep(t + 0.2)
        // ... 1s pause ... beep beep
        playBeep(t + 1.2)
        playBeep(t + 1.4)
        setTimeout(() => ctx.close(), 2500)
    }, [])

    const startGymTimer = useCallback((min: number, sec: number) => {
        const totalMs = (min * 60 + sec) * 1000
        if (totalMs <= 0) return
        setGymTimerEnd(Date.now() + totalMs)
        setShowGymPicker(false)
    }, [])

    const cancelGymTimer = useCallback(() => {
        setGymTimerEnd(null)
        setGymTimerRemaining('')
        setShowGymPicker(false)
    }, [])

    // Gym timer countdown
    useEffect(() => {
        if (!gymTimerEnd) return
        const interval = setInterval(() => {
            const remaining = gymTimerEnd - Date.now()
            if (remaining <= 0) {
                playGymBlip()
                setGymTimerEnd(null)
                setGymTimerRemaining('')
            } else {
                const mins = Math.floor(remaining / 60000)
                const secs = Math.floor((remaining % 60000) / 1000)
                setGymTimerRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [gymTimerEnd, playGymBlip])

    // Scroll gym picker to initial values when opened
    useEffect(() => {
        if (!showGymPicker || gymTimerEnd) return
        const itemH = 36
        requestAnimationFrame(() => {
            gymMinColRef.current?.scrollTo({ top: gymPickerMin * itemH, behavior: 'instant' })
            gymSecColRef.current?.scrollTo({ top: gymPickerSec * itemH, behavior: 'instant' })
        })
    }, [showGymPicker]) // eslint-disable-line react-hooks/exhaustive-deps

    // --- QUEUE LOGIC ---
    const playNext = useCallback((track: Track) => {
        setPlaybackQueue(q => [track, ...q])
        setTrackMenuOpen(null)
    }, [])

    const addToQueue = useCallback((track: Track) => {
        setPlaybackQueue(q => [...q, track])
        setTrackMenuOpen(null)
    }, [])

    // --- METADATA EDIT LOGIC ---
    const openMetadataEdit = useCallback((track: Track) => {
        setEditingTrackMeta(track)
        setMetaEditValues({ title: track.title, artist: track.artist, album: track.album })
        setTrackMenuOpen(null)
    }, [])

    const saveMetadataEdit = useCallback(async () => {
        if (!editingTrackMeta) return
        try {
            await db.updateTrackMetadata(editingTrackMeta.id, metaEditValues)
            if (onRefreshTracks) {
                await onRefreshTracks()
            }
        } catch (e) {
            console.error('Failed to edit metadata:', e)
        }
        setEditingTrackMeta(null)
    }, [editingTrackMeta, metaEditValues, onRefreshTracks])

    useEffect(() => {
        if (isActive) {
            // If tracks were preloaded from parent, don't reload
            // Check initialTracks (prop) not tracks (state) to avoid race condition
            if (!initialTracks || initialTracks.length === 0) {
                loadTracks()
            }
            // Defer secondary loads to not block initial render
            const timer = setTimeout(() => {
                loadPlaylists()
                loadFxPresets()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [isActive])

    // Virtualization: measure container height
    useEffect(() => {
        const container = tracklistRef.current
        if (!container) return

        const measure = () => setContainerHeight(container.clientHeight)
        measure()

        const resizeObserver = new ResizeObserver(measure)
        resizeObserver.observe(container)
        return () => resizeObserver.disconnect()
    }, [])


    // Close menu when clicking outside
    useEffect(() => {
        if (!trackMenuOpen) return
        const handleClickOutside = () => {
            setTrackMenuOpen(null)

        }
        // Delay to avoid immediate closing
        const timeout = setTimeout(() => {
            document.addEventListener('click', handleClickOutside)
        }, 0)
        return () => {
            clearTimeout(timeout)
            document.removeEventListener('click', handleClickOutside)
        }
    }, [trackMenuOpen])

    // Audio Elements Events
    useEffect(() => {
        const audio = new Audio()
        audio.crossOrigin = "anonymous"
        audioRef.current = audio

        audio.addEventListener('timeupdate', () => {
            currentTimeRef.current = audio.currentTime
            // Throttle state updates to ~4/sec (every 250ms)
            const now = performance.now()
            if (now - lastTimeUpdateRef.current >= 250) {
                lastTimeUpdateRef.current = now
                setCurrentTime(audio.currentTime)
            }
            // A-B Loop Logic moved to dedicated rAF for precision
            // Crossfade trigger
            if (crossfadeDurationRef.current > 0 && audio.duration && !crossfadeActiveRef.current) {
                const timeLeft = audio.duration - audio.currentTime
                if (timeLeft <= crossfadeDurationRef.current && timeLeft > 0) {
                    crossfadeActiveRef.current = true
                    // Fade out current track
                    const fadeDuration = crossfadeDurationRef.current
                    const startVolume = audio.volume
                    const fadeOutInterval = setInterval(() => {
                        const remaining = audio.duration - audio.currentTime
                        if (remaining <= 0 || !audio.duration) {
                            clearInterval(fadeOutInterval)
                            return
                        }
                        audio.volume = Math.max(0, startVolume * (remaining / fadeDuration))
                    }, 50)
                    // Trigger next track with auto-play
                    shouldAutoPlayRef.current = true
                    // The onended handler will fire naturally - reset crossfade flag
                    setTimeout(() => {
                        crossfadeActiveRef.current = false
                        audio.volume = startVolume
                    }, fadeDuration * 1000 + 500)
                }
            }
        })
        audio.addEventListener('loadedmetadata', () => {
            console.log('[Audio] Metadata loaded, duration:', audio.duration)
            setDuration(audio.duration)
        })
        audio.addEventListener('play', () => { if (!bgSwapRef.current) setIsPlaying(true) })
        audio.addEventListener('pause', () => { if (!bgSwapRef.current) setIsPlaying(false) })
        audio.addEventListener('error', () => {
            console.error('[Audio] Error loading audio:', audio.error?.message, audio.error?.code, audio.src)
        })
        audio.addEventListener('canplay', () => {
            console.log('[Audio] Can play:', audio.src)
        })

        return () => {
            audio.pause()
            audio.src = ''
        }
    }, [])



    // Load Source when track changes
    useEffect(() => {
        const track = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null
        if (!track || !audioRef.current) return
        // Guard: don't reload if same track is already loaded
        if (currentAudioPathRef.current === track.id) return

        const audio = audioRef.current

        // Reset loop state so stale loop points don't cause seeks on the new track
        setLoopA(null)
        setLoopB(null)
        setIsLoopActive(false)

        console.log('[Audio] Loading:', track.fileUrl)
        audio.src = track.fileUrl
        currentAudioPathRef.current = track.id
        audio.load()

        // Re-apply pitch on every track load as it resets
        audio.playbackRate = pitchLevel

        // Sync loop attribute for new track
        audio.loop = (repeatMode === 'one')

        // Auto-play if triggered by track ending or if already playing
        if (isPlaying || shouldAutoPlayRef.current) {
            shouldAutoPlayRef.current = false

            const doPlay = async () => {
                if (audioContextRef.current?.state === 'suspended') {
                    try { await audioContextRef.current.resume() } catch {}
                }
                try {
                    await audio.play()
                } catch (err) {
                    console.error('[Audio] Play failed:', err)
                    setIsPlaying(false)
                }
            }

            // Use canplay (fires earlier than canplaythrough, more reliable with custom protocols)
            // with a timeout fallback in case the event never fires
            let played = false
            const onCanPlay = () => {
                if (played) return
                played = true
                doPlay()
            }
            audio.addEventListener('canplay', onCanPlay, { once: true })
            // Fallback: if canplay doesn't fire within 500ms, try to play anyway
            setTimeout(() => {
                if (!played) {
                    played = true
                    audio.removeEventListener('canplay', onCanPlay)
                    doPlay()
                }
            }, 500)
        }
    }, [currentTrackIndex])

    // Volume
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume
    }, [volume])

    // Sync Loop Attribute
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.loop = (repeatMode === 'one')
        }
    }, [repeatMode])

    const handlePlayPause = useCallback(async () => {
        const audio = bgAudioRef.current || audioRef.current
        if (!audio) return

        // If no track selected, select first track and play
        if (!currentTrack) {
            if (displayTracks.length > 0) {
                const firstTrack = displayTracks[0]
                const index = tracks.findIndex(t => t.id === firstTrack.id)
                if (index !== -1) {
                    shouldAutoPlayRef.current = true
                    setCurrentTrackIndex(index)
                }
            }
            return
        }

        if (isPlaying) {
            audio.pause()
        } else {
            // Only resume AudioContext when using main audio (bgAudio bypasses it)
            if (!bgAudioRef.current && audioContextRef.current?.state === 'suspended') {
                try { await audioContextRef.current.resume() } catch {}
            }
            try {
                await audio.play()
            } catch (err) {
                console.error('[Audio] Play failed, retrying with reload:', err)
                audio.load()
                audio.play().catch(console.error)
            }
        }
    }, [currentTrack, isPlaying, displayTracks, tracks])

    // Global Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                const activeTag = document.activeElement?.tagName.toLowerCase()
                if (activeTag === 'input' || activeTag === 'textarea') return

                e.preventDefault()
                handlePlayPause()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handlePlayPause])

    const handleNext = useCallback(() => {
        // Check queue first
        if (playbackQueue.length > 0) {
            const nextTrack = playbackQueue[0]
            setPlaybackQueue(q => q.slice(1))
            const globalIdx = tracks.findIndex(t => t.id === nextTrack.id)
            if (globalIdx !== -1) {
                shouldAutoPlayRef.current = true
                setCurrentTrackIndex(globalIdx)
            }
            return
        }

        if (displayTracks.length === 0) return

        const currentTrack = tracks[currentTrackIndex]
        if (!currentTrack) {
            if (displayTracks.length > 0) {
                const idx = tracks.findIndex(t => t.id === displayTracks[0].id)
                if (idx !== -1) setCurrentTrackIndex(idx)
            }
            return
        }

        // Shuffle Logic
        if (isShuffle) {
            if (displayTracks.length <= 1) return

            // Push current track to history before changing
            shuffleHistoryRef.current.push(currentTrackIndex)
            if (shuffleHistoryRef.current.length > 200) {
                shuffleHistoryRef.current = shuffleHistoryRef.current.slice(-200)
            }

            let randomIdx
            do {
                randomIdx = Math.floor(Math.random() * displayTracks.length)
            } while (displayTracks.length > 1 && displayTracks[randomIdx].id === currentTrack.id)

            const nextTrack = displayTracks[randomIdx]
            const globalIdx = tracks.findIndex(t => t.id === nextTrack.id)
            if (globalIdx !== -1) setCurrentTrackIndex(globalIdx)
            return
        }

        const currentIdxInDisplay = displayTracks.findIndex(t => t.id === currentTrack.id)

        let nextTrack: Track | null = null
        if (currentIdxInDisplay === -1) {
            nextTrack = displayTracks[0]
        } else {
            // Logic for next button click:
            // If Repeat One, Next button should still go to next track.
            // If Repeat Off, Next button at end -> wrap to start (standard behavior) or stop? Let's wrap.
            // If Repeat All, Next button -> wrap.
            nextTrack = displayTracks[(currentIdxInDisplay + 1) % displayTracks.length]
        }

        if (nextTrack) {
            const newGlobalIndex = tracks.findIndex(t => t.id === nextTrack.id)
            if (newGlobalIndex !== -1) setCurrentTrackIndex(newGlobalIndex)
        }
    }, [displayTracks, tracks, currentTrackIndex, isShuffle])

    const handlePrevious = useCallback(() => {
        if (displayTracks.length === 0) return

        // 3-second restart: if past 3s, restart current track
        if (audioRef.current && audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0
            return
        }

        // Shuffle mode: pop from history stack
        if (isShuffle && shuffleHistoryRef.current.length > 0) {
            const previousIndex = shuffleHistoryRef.current.pop()!
            if (previousIndex >= 0 && previousIndex < tracks.length) {
                shouldAutoPlayRef.current = true
                setCurrentTrackIndex(previousIndex)
                return
            }
            // If invalid, fall through to normal behavior
        }

        // Normal (non-shuffle) previous behavior
        const currentTrack = tracks[currentTrackIndex]
        if (!currentTrack) {
            const first = displayTracks[0]
            const firstGlobalIdx = tracks.findIndex(t => t.id === first.id)
            if (firstGlobalIdx !== -1) setCurrentTrackIndex(firstGlobalIdx)
            return
        }

        const currentIdxInDisplay = displayTracks.findIndex(t => t.id === currentTrack.id)

        let prevTrack: Track
        if (currentIdxInDisplay === -1) {
            prevTrack = displayTracks[0]
        } else {
            const newIdx = currentIdxInDisplay === 0 ? displayTracks.length - 1 : currentIdxInDisplay - 1
            prevTrack = displayTracks[newIdx]
        }

        const newGlobalIndex = tracks.findIndex(t => t.id === prevTrack.id)
        if (newGlobalIndex !== -1) setCurrentTrackIndex(newGlobalIndex)
    }, [displayTracks, tracks, currentTrackIndex, isShuffle])

    // Media Session API Support — use displayedArt (resolves async DB art)
    useEffect(() => {
        if ('mediaSession' in navigator && currentTrack) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrack.title,
                artist: currentTrack.artist,
                album: currentTrack.album,
                artwork: displayedArt ? [
                    { src: displayedArt, sizes: '96x96', type: 'image/jpeg' },
                    { src: displayedArt, sizes: '256x256', type: 'image/jpeg' },
                    { src: displayedArt, sizes: '512x512', type: 'image/jpeg' },
                ] : []
            })
        }
    }, [currentTrack, displayedArt])

    // Update playback state for lock screen / Dynamic Island display
    useEffect(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
        }
    }, [isPlaying])

    // Register MediaSession action handlers ONCE (all use refs, so they never go stale)
    useEffect(() => {
        if (!('mediaSession' in navigator)) return

        navigator.mediaSession.setActionHandler('play', async () => {
            const audio = bgAudioRef.current || audioRef.current
            if (!audio) return
            // Only resume AudioContext when using main audio (bgAudio bypasses it)
            if (!bgAudioRef.current && audioContextRef.current?.state === 'suspended') {
                try { await audioContextRef.current.resume() } catch {}
            }
            try {
                await audio.play()
                if (bgAudioRef.current) setIsPlaying(true)
            } catch (err) {
                console.error('[MediaSession] Play failed, retrying:', err)
                audio.load()
                audio.play().then(() => { if (bgAudioRef.current) setIsPlaying(true) }).catch(console.error)
            }
        })
        navigator.mediaSession.setActionHandler('pause', () => {
            const audio = bgAudioRef.current || audioRef.current
            if (audio) {
                audio.pause()
                if (bgAudioRef.current) setIsPlaying(false)
            }
        })
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined && audioRef.current) {
                audioRef.current.currentTime = details.seekTime
            }
        })
    }, [])

    // Update prev/next handlers when they change (these depend on playlist state)
    useEffect(() => {
        if (!('mediaSession' in navigator)) return
        navigator.mediaSession.setActionHandler('previoustrack', handlePrevious)
        navigator.mediaSession.setActionHandler('nexttrack', handleNext)
    }, [handlePrevious, handleNext])

    // No mini player in web version

    // Updated onEnded
    const onTrackEnded = useCallback(() => {
        // Sleep timer: end of track mode
        if (sleepTimerModeRef.current === 'endOfTrack') {
            if (audioRef.current) {
                // Fade out
                const originalVolume = audioRef.current.volume
                const fadeSteps = 30
                let step = 0
                const fade = setInterval(() => {
                    step++
                    if (audioRef.current) {
                        audioRef.current.volume = Math.max(0, originalVolume * (1 - step / fadeSteps))
                    }
                    if (step >= fadeSteps) {
                        clearInterval(fade)
                        if (audioRef.current) {
                            audioRef.current.pause()
                            audioRef.current.volume = originalVolume
                        }
                    }
                }, 100)
            }
            setSleepTimerMode('off')
            setSleepTimerRemaining('')
            return
        }

        // Repeat One: Replay the same song
        if (repeatMode === 'one') {
            if (audioRef.current) {
                audioRef.current.currentTime = 0
                audioRef.current.play().catch(console.error)
            }
            return
        }

        const currentTrack = tracks[currentTrackIndex]
        const currentIdx = displayTracks.findIndex(t => t.id === currentTrack?.id)

        // Repeat Off: Play next until end of list, then stop
        if (repeatMode === 'off') {
            if (currentIdx >= displayTracks.length - 1 && !isShuffle && playbackQueue.length === 0) {
                setIsPlaying(false)
                return
            }
            shouldAutoPlayRef.current = true
            handleNext()
            return
        }

        // Repeat All: Always play next (handleNext wraps around at end)
        shouldAutoPlayRef.current = true
        handleNext()
    }, [repeatMode, handleNext, displayTracks, tracks, currentTrackIndex, isShuffle, playbackQueue.length])

    // Handle Auto Next (Playlist aware)
    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        // We use a specific handler that uses the latest state
        // But since we use useCallback for onTrackEnded with dependencies, 
        // we need to make sure the event listener is updated or we use a ref.
        // A common pattern is to just call a function that refs the latest logic?
        // Let's rely on React cleaning up and re-adding listener when `onTrackEnded` changes.

        audio.addEventListener('ended', onTrackEnded)
        return () => audio.removeEventListener('ended', onTrackEnded)
    }, [onTrackEnded])

    // Timeline Scrubbing Logic
    const handleScrubStart = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsScrubbing(true)
        if (duration > 0) {
            const rect = e.currentTarget.getBoundingClientRect()
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            setScrubTime(percent * duration)
        }
    }

    const handleScrubMove = useCallback((e: MouseEvent) => {
        if (!isScrubbing || !duration) return
        const progressBar = document.querySelector('.progress-area')
        if (progressBar) {
            const rect = progressBar.getBoundingClientRect()
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            setScrubTime(percent * duration)
        }
    }, [isScrubbing, duration])

    const handleScrubEnd = useCallback((e: MouseEvent) => {
        if (!isScrubbing) return
        setIsScrubbing(false)
        if (audioRef.current && duration) {
            const progressBar = document.querySelector('.progress-area')
            if (progressBar) {
                const rect = progressBar.getBoundingClientRect()
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                audioRef.current.currentTime = percent * duration
            }
        }
    }, [isScrubbing, duration])

    // Attach global listeners for scrubbing
    useEffect(() => {
        if (isScrubbing) {
            document.body.style.userSelect = 'none'
            document.body.style.webkitUserSelect = 'none' // For Safari/Chrome
            window.addEventListener('mousemove', handleScrubMove)
            window.addEventListener('mouseup', handleScrubEnd)
        } else {
            document.body.style.userSelect = ''
            document.body.style.webkitUserSelect = ''
            window.removeEventListener('mousemove', handleScrubMove)
            window.removeEventListener('mouseup', handleScrubEnd)
        }
        return () => {
            document.body.style.userSelect = ''
            document.body.style.webkitUserSelect = ''
            window.removeEventListener('mousemove', handleScrubMove)
            window.removeEventListener('mouseup', handleScrubEnd)
        }
    }, [isScrubbing, handleScrubMove, handleScrubEnd])


    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        // Only seek on click if not dragging (handled by scrub end)
        if (isScrubbing) return
        if (!audioRef.current || duration === 0) return
        const rect = e.currentTarget.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        audioRef.current.currentTime = percent * duration
    }

    const handleTrackSelect = (track: Track) => {
        const index = tracks.findIndex(t => t.id === track.id)
        if (index !== -1) {
            if (isShuffle && currentTrackIndex >= 0) {
                shuffleHistoryRef.current.push(currentTrackIndex)
                if (shuffleHistoryRef.current.length > 200) {
                    shuffleHistoryRef.current = shuffleHistoryRef.current.slice(-200)
                }
            }
            setCurrentTrackIndex(index)
            setIsPlaying(true)
        }
    }



    // Helper to process image file
    const processImageFile = useCallback((file: File) => {
        const reader = new FileReader()
        reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = 1000
                canvas.height = 1000
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    // Draw image covering the 1000x1000 square (object-fit: cover equivalent)
                    const scale = Math.max(1000 / img.width, 1000 / img.height)
                    const x = (1000 - img.width * scale) / 2
                    const y = (1000 - img.height * scale) / 2
                    ctx.drawImage(img, x, y, img.width * scale, img.height * scale)
                    setNewPlaylistImage(canvas.toDataURL('image/jpeg', 0.8))
                }
            }
            img.src = event.target?.result as string
        }
        reader.readAsDataURL(file)
    }, [])

    // Helper to process image selection
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            processImageFile(file)
        }
    }

    const handleImageDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingImage(true)
    }

    const handleImageDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingImage(false)
    }

    const handleImageDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingImage(false)

        const file = e.dataTransfer.files?.[0]
        if (file && file.type.startsWith('image/')) {
            processImageFile(file)
        }
    }

    if (isLoading) {
        return (
            <div className="music-player">
                <div className="player-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading music library...</p>
                </div>
            </div>
        )
    }

    if (tracks.length === 0) {
        return (
            <div className="music-player">
                <div className="player-empty">
                    <div className="empty-icon-wrapper">
                        <MusicIcon size={64} className="empty-icon-main" strokeWidth={1} style={{ opacity: 0.5 }} />
                    </div>
                    <h3>No Music Yet</h3>
                    <p>Upload some music to start listening.</p>
                </div>
            </div>
        )
    }

    return (
        <div className={`music-player ${mobileView === 'library' ? 'mobile-library' : ''} ${displayMode === 'spinning' ? 'spinning-mode' : ''}`}>
            <div className="player-background">
                <div className={`player-bg-layer${bgLayer.active === 'a' ? ' active' : ''}`} style={{ backgroundImage: bgLayer.a ? `url(${bgLayer.a})` : 'none' }} />
                <div className={`player-bg-layer${bgLayer.active === 'b' ? ' active' : ''}`} style={{ backgroundImage: bgLayer.b ? `url(${bgLayer.b})` : 'none' }} />
            </div>

            {/* Spinning background 3D for spinning-mode */}
            {displayMode === 'spinning' && currentTrack && (
                <div className={`spinning-bg-3d ${isPlaying ? 'playing' : 'paused'}${!isVisualReady ? ' slide-out-left' : ''}`}>
                    <Suspense fallback={null}>
                        {playerModel === 'vinyl'
                            ? <VinylDisc3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} isPlaying={isPlaying} flatMode={true} playbackRate={pitchLevel} />
                            : playerModel === 'cd'
                                ? <CD3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} isPlaying={isPlaying} flatMode={true} playbackRate={pitchLevel} />
                                : <CoverArtCube3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} isPlaying={isPlaying} flatMode={true} playbackRate={pitchLevel} />
                        }
                    </Suspense>
                </div>
            )}

            <div className="player-main-content">
                <div className="player-left-side">
                    <div className="now-playing-art-large">
                        {activePlaylist ? (
                            activePlaylist.coverArt ? (
                                <img src={activePlaylist.coverArt} alt={activePlaylist.name} />
                            ) : (
                                <div className="auto-cover-large">
                                    {tracks.filter(t => getPlaylistTrackIds(activePlaylist.id).includes(t.id)).slice(0, 4).map((t, i) => {
                                        const art = getTrackCoverArt(t)
                                        return art ? (
                                            <img key={i} src={art} alt="" />
                                        ) : (
                                            <div key={i} className="no-cover-cell-large">
                                                <MusicIcon size={32} strokeWidth={1} style={{ opacity: 0.2 }} />
                                            </div>
                                        )
                                    })}
                                    {/* Fill empty cells if playlist has < 4 tracks */}
                                    {Array.from({ length: Math.max(0, 4 - tracks.filter(t => getPlaylistTrackIds(activePlaylist.id).includes(t.id)).length) }).map((_, i) => (
                                        <div key={`empty-${i}`} className="no-cover-cell-large">
                                            <MusicIcon size={32} strokeWidth={1} style={{ opacity: 0.1 }} />
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : currentTrack ? (
                            <div className={`visual-3d-container${!isVisualReady && displayMode === 'spinning' ? ' slide-out-left' : ''}`}>
                                <Suspense fallback={<CoverArtCube3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} />}>
                                    {playerModel === 'vinyl'
                                        ? <VinylDisc3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} isPlaying={isPlaying} />
                                        : playerModel === 'cd'
                                            ? <CD3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} isPlaying={isPlaying} />
                                            : <CoverArtCube3D src={frozen3D.src} artist={frozen3D.artist} album={frozen3D.album} color={frozen3D.color} />
                                    }
                                </Suspense>
                            </div>
                        ) : (
                            <div className="no-art">
                                <MusicIcon size={80} strokeWidth={1} style={{ opacity: 0.3 }} />
                            </div>
                        )}
                    </div>
                </div>

                <div className="player-right-side">
                    {activePlaylist && (
                        <button
                            className="back-to-library-btn-floating"
                            onClick={() => setActivePlaylist(null)}
                        >
                            <BackIcon size={18} />
                        </button>
                    )}
                    <div className="current-track-header">
                        <MarqueeText text={currentTrack?.title || 'AudRip Player'} />
                        <p className="header-artist">{currentTrack?.artist || 'Select a track to play'}</p>
                        <p className="header-album">{currentTrack?.album || 'Local Library'}</p>
                    </div>

                    <div className="library-controls-header">
                        {activePlaylist ? (
                            <div className="playlist-active-header">
                                <div className="playlist-title-group">
                                    <div className="title-row">
                                        <h3>{activePlaylist.name}</h3>
                                        <button
                                            className="edit-active-playlist-btn"
                                            onClick={() => {
                                                setEditingPlaylist(activePlaylist)
                                                setNewPlaylistImage(activePlaylist.coverArt)
                                                setShowPlaylistModal(true)
                                            }}
                                            title="Edit Playlist"
                                        >
                                            <EditIcon size={14} />
                                        </button>
                                    </div>
                                    <span>{getPlaylistTrackIds(activePlaylist.id).length} tracks</span>
                                </div>
                            </div>
                        ) : (
                            <div className="library-header-spacer" />
                        )}

                        <div className="library-search-sort-row">
                            <div className="library-search-container">
                                <SearchIcon size={16} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search library..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input-minimal"
                                />
                            </div>
                            <div className="sort-select-container">
                                <SortIcon size={14} />
                                <select
                                    className="sort-select"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                >
                                    <option value="default">Default</option>
                                    <option value="title">Title</option>
                                    <option value="artist">Artist</option>
                                    <option value="duration">Duration</option>
                                    <option value="recent">Recent</option>
                                </select>
                            </div>
                            <button
                                className={`compact-toggle-btn ${isCompact ? 'active' : ''}`}
                                onClick={() => setIsCompact(!isCompact)}
                                title={isCompact ? 'Normal view' : 'Compact view'}
                            >
                                <CompactIcon size={14} />
                            </button>
                        </div>
                    </div>

                    <div className={`player-tracklist ${isCompact ? 'compact-list' : ''}`}>
                        <div
                            ref={tracklistRef}
                            className="tracklist-scroll animate-enter"
                            key={activePlaylist ? activePlaylist.id : 'library'}
                            onScroll={(e) => {
                                setScrollTop(e.currentTarget.scrollTop)
                                if (trackMenuOpen) {
                                    setTrackMenuOpen(null)
                                }
                            }}
                        >
                            {/* Virtualized container with total height */}
                            <div style={{ height: virtualizedData.totalHeight, position: 'relative' }}>
                                {virtualizedData.visibleTracks.map(({ track, index, style }) => {
                                    const isActive = currentTrack && track.id === currentTrack.id
                                    return (
                                        <div
                                            key={track.id}
                                            className={`track-item ${isActive ? 'active' : ''}`}
                                            style={style}
                                        >
                                            <div className="track-main" onClick={() => handleTrackSelect(track)}>
                                                <div className="track-index">
                                                    {isActive && isPlaying ? (
                                                        <div className="mini-equalizer">
                                                            <span></span><span></span><span></span>
                                                        </div>
                                                    ) : (
                                                        <span className="index-number">{index + 1}</span>
                                                    )}
                                                </div>
                                                <div className="track-info">
                                                    <span className="track-title">{track.title}</span>
                                                </div>
                                                <span className="track-duration">{formatTime(track.duration)}</span>
                                            </div>

                                            {/* Track Menu Button */}
                                            <button
                                                className="track-menu-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (trackMenuOpen === track.id) {
                                                        setTrackMenuOpen(null)
                                                    } else {
                                                        const rect = e.currentTarget.getBoundingClientRect()
                                                        setMenuPosition({ x: rect.right, y: rect.bottom })
                                                        setTrackMenuOpen(track.id)
                                                    }
                                                }}
                                            >
                                                <MoreIcon size={16} />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {showFx && (
                <div
                    className={`fx-panel-overlay ${isClosing ? 'fade-out' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        closeFxPanel();
                    }}
                >
                    <div className="fx-controls-container" onClick={(e) => e.stopPropagation()}>
                        <div className="fx-tab-bar">
                            {(['tone', 'space', 'eq', 'presets'] as const).map(tab => (
                                <button
                                    key={tab}
                                    className={`fx-tab-btn ${fxTab === tab ? 'active' : ''}`}
                                    onClick={() => setFxTab(tab)}
                                >{tab === 'eq' ? 'EQ' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
                            ))}
                        </div>

                        <div className="fx-tab-content">
                            {fxTab === 'tone' && (
                                <div className="fx-tab-pane">
                                    <div className="fx-control-group">
                                        <div className="fx-control-header">
                                            <label>Bass Boost</label>
                                            <span className="fx-value">{bassLevel > 0 ? '+' : ''}{bassLevel.toFixed(1)} dB</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="-10" max="15" step="0.5" value={bassLevel}
                                            style={{ '--slider-pct': `${((bassLevel + 10) / 25) * 100}%` } as React.CSSProperties}
                                            onChange={(e) => { setBassLevel(parseFloat(e.target.value)); markCustom() }} />
                                    </div>
                                    <div className="fx-control-group">
                                        <div className="fx-control-header">
                                            <label>Distortion</label>
                                            <span className="fx-value">{Math.round(distortLevel * 100)}%</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="0" max="1" step="0.01" value={distortLevel}
                                            style={{ '--slider-pct': `${distortLevel * 100}%` } as React.CSSProperties}
                                            onChange={(e) => { setDistortLevel(parseFloat(e.target.value)); markCustom() }} />
                                    </div>
                                    <div className={`fx-control-group${isIOS ? ' fx-disabled' : ''}`}>
                                        <div className="fx-control-header">
                                            <label>Speed / Pitch</label>
                                            <span className="fx-value">{isIOS ? 'N/A' : `${pitchLevel.toFixed(2)}x`}</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="0.25" max="3.0" step="0.01" value={isIOS ? 1 : pitchLevel}
                                            style={{ '--slider-pct': `${((pitchLevel - 0.25) / 2.75) * 100}%` } as React.CSSProperties}
                                            disabled={isIOS}
                                            onChange={(e) => { setPitchLevel(parseFloat(e.target.value)); markCustom() }} />
                                        {isIOS && <span className="fx-disabled-hint">Not supported on iOS</span>}
                                    </div>
                                </div>
                            )}

                            {fxTab === 'space' && (
                                <div className="fx-tab-pane">
                                    <div className="fx-control-group">
                                        <div className="fx-control-header">
                                            <label>Reverb</label>
                                            <span className="fx-value">{(reverbLevel / 3 * 100).toFixed(0)}%</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="0" max="3" step="0.05" value={reverbLevel}
                                            style={{ '--slider-pct': `${(reverbLevel / 3) * 100}%` } as React.CSSProperties}
                                            onChange={(e) => { setReverbLevel(parseFloat(e.target.value)); markCustom() }} />
                                    </div>
                                    <div className="fx-control-group">
                                        <div className="fx-control-header">
                                            <label>Echo</label>
                                            <span className="fx-value">{(delayLevel * 100).toFixed(0)}%</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="0" max="1" step="0.01" value={delayLevel}
                                            style={{ '--slider-pct': `${delayLevel * 100}%` } as React.CSSProperties}
                                            onChange={(e) => { setDelayLevel(parseFloat(e.target.value)); markCustom() }} />
                                    </div>
                                    <div className="fx-control-group">
                                        <div className="fx-control-header">
                                            <label>Stereo Width</label>
                                            <span className="fx-value">{(stereoWidthLevel * 100).toFixed(0)}%</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="0" max="1" step="0.01" value={stereoWidthLevel}
                                            style={{ '--slider-pct': `${stereoWidthLevel * 100}%` } as React.CSSProperties}
                                            onChange={(e) => { setStereoWidthLevel(parseFloat(e.target.value)); markCustom() }} />
                                    </div>
                                    <div className="fx-control-group">
                                        <div className="fx-control-header">
                                            <label>Pan L/R</label>
                                            <span className="fx-value">{panningLevel < -0.01 ? `L ${Math.abs(Math.round(panningLevel * 100))}%` : panningLevel > 0.01 ? `R ${Math.round(panningLevel * 100)}%` : 'Center'}</span>
                                        </div>
                                        <input type="range" className="fx-slider" min="-1" max="1" step="0.01" value={panningLevel}
                                            style={{ '--slider-pct': `${((panningLevel + 1) / 2) * 100}%` } as React.CSSProperties}
                                            onChange={(e) => { setPanningLevel(parseFloat(e.target.value)); markCustom() }} />
                                    </div>
                                </div>
                            )}

                            {fxTab === 'eq' && (
                                <div className="fx-tab-pane">
                                    <div className="eq-band-row">
                                        {EQ_BANDS.map((band, i) => (
                                            <div className="eq-band" key={band.freq}>
                                                <span className="eq-band-value">{eqBands[i] > 0 ? '+' : ''}{eqBands[i].toFixed(0)}</span>
                                                <input
                                                    type="range" min="-15" max="15" step="0.5"
                                                    value={eqBands[i]}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value)
                                                        setEqBands(prev => { const next = [...prev]; next[i] = val; return next })
                                                        markCustom()
                                                    }}
                                                />
                                                <span className="eq-band-label">{band.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {fxTab === 'presets' && (
                                <div className="fx-tab-pane">
                                    <div className="fx-preset-list">
                                        {fxPresets.length === 0 && (
                                            <div className="fx-preset-empty">No saved presets</div>
                                        )}
                                        {fxPresets.map(p => (
                                            <div
                                                key={p.id}
                                                className={`fx-preset-item ${activePresetId === p.id ? 'active' : ''}`}
                                                onClick={() => applyPreset(p)}
                                            >
                                                <span className="fx-preset-item-name">{p.name}</span>
                                                <button
                                                    className="fx-preset-item-delete"
                                                    onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id) }}
                                                    title="Delete preset"
                                                >
                                                    <TrashIcon size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="fx-preset-save-btn" onClick={handleSavePreset}>
                                        <SaveIcon size={14} />
                                        Save Current
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="fx-tab-footer">
                            <button className="fx-reset-btn" onClick={() => {
                                setBassLevel(0); setReverbLevel(0); setPitchLevel(1);
                                setDelayLevel(0); setStereoWidthLevel(0); setPanningLevel(0);
                                setDistortLevel(0); setEqBands([0, 0, 0, 0, 0, 0, 0, 0]);
                                setActivePresetId(null);
                            }}>Reset All</button>
                        </div>
                    </div>
                </div>
            )}

            {showPresetNameModal && (
                <div className="fx-panel-overlay" onClick={() => setShowPresetNameModal(false)}>
                    <div className="fx-controls-container" onClick={(e) => e.stopPropagation()} style={{ minWidth: 280 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Save Preset</h3>
                        <input
                            type="text"
                            placeholder="Preset name..."
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmSavePreset() }}
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(var(--overlay-rgb), 0.08)',
                                border: '1px solid rgba(var(--overlay-rgb), 0.15)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: 14,
                                outline: 'none',
                                marginBottom: 12
                            }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowPresetNameModal(false)}
                                style={{
                                    padding: '8px 16px',
                                    background: 'rgba(var(--overlay-rgb), 0.1)',
                                    border: 'none',
                                    borderRadius: 6,
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer'
                                }}
                            >Cancel</button>
                            <button
                                onClick={confirmSavePreset}
                                disabled={!presetNameInput.trim()}
                                style={{
                                    padding: '8px 16px',
                                    background: presetNameInput.trim() ? 'var(--accent-primary)' : 'rgba(var(--overlay-rgb), 0.1)',
                                    border: 'none',
                                    borderRadius: 6,
                                    color: presetNameInput.trim() ? 'white' : 'var(--text-primary)',
                                    cursor: presetNameInput.trim() ? 'pointer' : 'default',
                                    opacity: presetNameInput.trim() ? 1 : 0.5
                                }}
                            >Save</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="player-bottom-bar">
                <div className="waveform-panel" style={{ display: showWaveform ? undefined : 'none' }}>
                    <div className="waveform-container" ref={waveformContainerRef} />
                    {isLoopActive && loopA !== null && loopB !== null && (
                        <div className="waveform-actions-wrap">
                            <div className="waveform-actions">
                                <button className="waveform-nudge-btn" title="A − 10ms" onClick={() => setLoopA(Math.max(0, (loopA ?? 0) - 0.01))}>A−</button>
                                <button className="waveform-nudge-btn" title="A + 10ms" onClick={() => setLoopA(Math.min((loopA ?? 0) + 0.01, (loopB ?? 0) - 0.005))}>A+</button>
                                <button
                                    className="waveform-action-btn"
                                    onClick={() => {
                                        if (audioRef.current && loopA !== null) {
                                            audioRef.current.currentTime = loopA
                                            if (!isPlaying) handlePlayPause()
                                        }
                                    }}
                                    title="Play from loop start"
                                >
                                    <PlayIcon size={12} fill="currentColor" />
                                    Loop
                                </button>
                                <button className="waveform-nudge-btn" title="B − 10ms" onClick={() => setLoopB(Math.max((loopA ?? 0) + 0.005, (loopB ?? 0) - 0.01))}>B−</button>
                                <button className="waveform-nudge-btn" title="B + 10ms" onClick={() => setLoopB((loopB ?? 0) + 0.01)}>B+</button>
                            </div>
                            <button
                                className="waveform-action-btn waveform-action-btn-clear"
                                onClick={() => {
                                    setLoopA(null)
                                    setLoopB(null)
                                    setIsLoopActive(false)
                                    if (loopRegionRef.current) {
                                        loopRegionRef.current.remove()
                                        loopRegionRef.current = null
                                    }
                                }}
                                title="Clear loop"
                            >
                                <CloseIcon size={12} />
                            </button>
                        </div>
                    )}
                </div>
                {/* Row 1: Progress */}
                <div className="progress-row">
                    <span className="time-display">{formatTime(isScrubbing ? scrubTime : currentTime)}</span>
                    <div
                        className="progress-area"
                        onMouseDown={handleScrubStart}
                        onClick={handleSeek}
                    >
                        <div
                            className="progress-fill"
                            style={{ width: duration ? `${((isScrubbing ? scrubTime : currentTime) / duration) * 100}%` : '0%' }}
                        />

                        {/* A-B Loop Markers */}
                        {loopA !== null && duration > 0 && (
                            <div
                                className="loop-marker marker-a"
                                style={{ left: `${(loopA / duration) * 100}%` }}
                            />
                        )}
                        {loopB !== null && duration > 0 && (
                            <div
                                className="loop-marker marker-b"
                                style={{ left: `${(loopB / duration) * 100}%` }}
                            />
                        )}
                        {isLoopActive && loopA !== null && loopB !== null && duration > 0 && (
                            <div
                                className="loop-range-highlight"
                                style={{
                                    left: `${(loopA / duration) * 100}%`,
                                    width: `${((loopB - loopA) / duration) * 100}%`
                                }}
                            />
                        )}
                    </div>
                    <span className="time-display">{formatTime(duration)}</span>
                </div>

                {/* Row 2: Controls */}
                <div className="controls-row">
                    <div className="controls-left">
                        <button
                            className="control-btn-sm mobile-view-toggle"
                            onClick={() => setMobileView(mobileView === 'playing' ? 'library' : 'playing')}
                            title={mobileView === 'playing' ? 'Show Library' : 'Now Playing'}
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {mobileView === 'playing' ? <CompactIcon size={16} /> : <DiscIcon size={16} />}
                        </button>
                        <button
                            className={`control-btn-sm ${showFx ? 'active-fx-btn' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (showFx) closeFxPanel();
                                else setShowFx(true);
                            }}
                            title="Audio Effects"
                            style={{ color: showFx ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                        >
                            <SparklesIcon size={16} />
                        </button>
                        <button
                            className={`control-btn-sm ${showPlaylistBrowser ? 'active-fx-btn' : ''}`}
                            onClick={() => {
                                if (showPlaylistBrowser) closePlaylistBrowser()
                                else setShowPlaylistBrowser(true)
                            }}
                            title="Playlists"
                            style={{ color: showPlaylistBrowser ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                        >
                            <PlaylistIcon size={16} />
                        </button>
                        {playbackQueue.length > 0 && (
                            <button
                                className={`control-btn-sm ${showQueueView ? 'active-fx-btn' : ''}`}
                                onClick={() => setShowQueueView(!showQueueView)}
                                title={`Queue (${playbackQueue.length})`}
                                style={{ color: showQueueView ? 'var(--accent-primary)' : 'var(--text-secondary)', position: 'relative' }}
                            >
                                <QueueIcon size={16} />
                                <span className="queue-badge">{playbackQueue.length}</span>
                            </button>
                        )}
                        <div style={{ position: 'relative' }}>
                            <button
                                className={`control-btn-sm ${sleepTimerMode !== 'off' ? 'active-fx-btn' : ''}`}
                                onClick={() => setShowSleepMenu(!showSleepMenu)}
                                title={sleepTimerMode !== 'off' ? `Sleep: ${sleepTimerRemaining || 'End of track'}` : 'Sleep Timer'}
                                style={{ color: sleepTimerMode !== 'off' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                            >
                                <MoonIcon size={16} />
                            </button>
                            {sleepTimerMode !== 'off' && sleepTimerRemaining && (
                                <span className="sleep-timer-indicator">{sleepTimerRemaining}</span>
                            )}
                            {showSleepMenu && (
                                <div className="sleep-timer-menu">
                                    {sleepTimerMode !== 'off' ? (
                                        <div className="menu-item" onClick={cancelSleepTimer}>
                                            <CloseIcon size={14} />
                                            <span>Cancel Timer</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="menu-item" onClick={() => startSleepTimer(15)}>15 min</div>
                                            <div className="menu-item" onClick={() => startSleepTimer(30)}>30 min</div>
                                            <div className="menu-item" onClick={() => startSleepTimer(45)}>45 min</div>
                                            <div className="menu-item" onClick={() => startSleepTimer(60)}>60 min</div>
                                            <div className="menu-item" onClick={startEndOfTrackSleep}>End of Track</div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            className={`control-btn-sm ${showWaveform ? 'active-fx-btn' : ''}`}
                            onClick={() => setShowWaveform(w => !w)}
                            title="Waveform"
                            style={{ color: showWaveform ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                        >
                            <WaveformIcon size={16} />
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button
                                className={`control-btn-sm ${gymTimerEnd ? 'active-fx-btn' : ''}`}
                                onClick={() => setShowGymPicker(p => !p)}
                                title={gymTimerEnd ? `Gym: ${gymTimerRemaining}` : 'Gym Timer'}
                                style={{ color: gymTimerEnd ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                            >
                                <ClockIcon size={16} />
                            </button>
                            {gymTimerEnd && gymTimerRemaining && (
                                <span className="gym-timer-indicator">{gymTimerRemaining}</span>
                            )}
                            {showGymPicker && (
                                <div className="gym-timer-picker">
                                    {gymTimerEnd ? (
                                        <div className="menu-item" onClick={cancelGymTimer}>
                                            <CloseIcon size={14} />
                                            <span>Cancel Timer</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="gym-picker-columns">
                                                <div className="gym-picker-highlight" />
                                                <div className="gym-picker-col-wrapper">
                                                    <div
                                                        className="gym-picker-col"
                                                        ref={gymMinColRef}
                                                        onScroll={() => {
                                                            const el = gymMinColRef.current
                                                            if (!el) return
                                                            const itemH = 36
                                                            const idx = Math.round(el.scrollTop / itemH)
                                                            setGymPickerMin(Math.max(0, Math.min(59, idx)))
                                                        }}
                                                    >
                                                        {Array.from({ length: 60 }, (_, i) => (
                                                            <div key={i} className="gym-picker-item">{i.toString().padStart(2, '0')}</div>
                                                        ))}
                                                    </div>
                                                    <div className="gym-picker-label">min</div>
                                                </div>
                                                <div className="gym-picker-separator">:</div>
                                                <div className="gym-picker-col-wrapper">
                                                    <div
                                                        className="gym-picker-col"
                                                        ref={gymSecColRef}
                                                        onScroll={() => {
                                                            const el = gymSecColRef.current
                                                            if (!el) return
                                                            const itemH = 36
                                                            const idx = Math.round(el.scrollTop / itemH)
                                                            setGymPickerSec(Math.max(0, Math.min(59, idx)))
                                                        }}
                                                    >
                                                        {Array.from({ length: 60 }, (_, i) => (
                                                            <div key={i} className="gym-picker-item">{i.toString().padStart(2, '0')}</div>
                                                        ))}
                                                    </div>
                                                    <div className="gym-picker-label">sec</div>
                                                </div>
                                            </div>
                                            <button
                                                className="gym-picker-start"
                                                onClick={() => startGymTimer(gymPickerMin, gymPickerSec)}
                                            >
                                                Start
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="controls-center">
                        <button
                            className="control-btn"
                            onClick={() => {
                                const newShuffle = !isShuffle
                                if (!newShuffle) shuffleHistoryRef.current = []
                                setIsShuffle(newShuffle)
                            }}
                            title="Shuffle"
                            style={{ color: isShuffle ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                        >
                            <ShuffleIcon size={18} />
                        </button>
                        <button className="control-btn" onClick={handlePrevious} title="Previous">
                            <SkipBackIcon size={20} fill="currentColor" />
                        </button>
                        <button className="control-btn play-btn" onClick={handlePlayPause}>
                            {isPlaying ? <PauseIcon size={28} fill="currentColor" /> : <PlayIcon size={28} fill="currentColor" className="ml-1" />}
                        </button>
                        <button className="control-btn" onClick={handleNext} title="Next">
                            <SkipForwardIcon size={20} fill="currentColor" />
                        </button>
                        <button
                            className="control-btn"
                            onClick={() => {
                                if (repeatMode === 'off') setRepeatMode('all')
                                else if (repeatMode === 'all') setRepeatMode('one')
                                else setRepeatMode('off')
                            }}
                            title="Repeat"
                            style={{ color: repeatMode !== 'off' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                        >
                            {repeatMode === 'one' ? <Repeat1Icon size={18} /> : <RepeatIcon size={18} />}
                        </button>
                    </div>

                    <div className="controls-right">
                        <div className="volume-control">
                            <button className="volume-btn-icon" onClick={() => setVolume(v => v === 0 ? 1 : 0)}>
                                {volume === 0 ? <MuteIcon size={16} /> : <VolumeIcon size={16} />}
                            </button>
                            <input
                                type="range"
                                min="0" max="1" step="0.01"
                                value={volume}
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                className="volume-slider"
                                style={{
                                    background: `linear-gradient(to right, var(--accent-primary) ${volume * 100}%, rgba(var(--overlay-rgb), 0.1) ${volume * 100}%)`
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Playlist Browser Overlay */}
            {/* Playlist Browser Overlay - Portal to Body for full width */}
            {
                showPlaylistBrowser && createPortal(
                    <div
                        className={`playlist-browser-overlay ${isClosingBrowser ? 'closing' : ''}`}
                        onClick={closePlaylistBrowser}
                    >
                        <div
                            className={`playlist-browser ${isClosingBrowser ? 'closing' : ''}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="playlist-browser-header">
                                <h3>{trackToAddToPlaylist ? 'Add to Playlist' : 'Your Playlists'}</h3>
                                <button className="close-btn" onClick={closePlaylistBrowser}>
                                    <CloseIcon size={20} />
                                </button>
                            </div>

                            <div className="playlist-grid">
                                {playlists.map(pl => (
                                    <div
                                        key={pl.id}
                                        className="playlist-card"
                                        onClick={() => {
                                            if (trackToAddToPlaylist) {
                                                handleAddToPlaylist(trackToAddToPlaylist.id, pl.id)
                                                closePlaylistBrowser()
                                            } else {
                                                setActivePlaylist(pl)
                                                closePlaylistBrowser()
                                            }
                                        }}
                                    >
                                        <div className="playlist-cover">
                                            {pl.coverArt ? (
                                                <img src={pl.coverArt} alt={pl.name} />
                                            ) : (
                                                <div className="auto-cover">
                                                    {tracks.filter(t => getPlaylistTrackIds(pl.id).includes(t.id)).slice(0, 4).map((t, i) => {
                                                        const art = getTrackCoverArt(t)
                                                        return art ? (
                                                            <img key={i} src={art} alt="" />
                                                        ) : (
                                                            <div key={i} className="no-cover-cell">
                                                                <MusicIcon size={20} />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                            {/* Overlay Checkmark if track is already in playlist */}
                                            {trackToAddToPlaylist && getPlaylistTrackIds(pl.id).includes(trackToAddToPlaylist.id) && (
                                                <div className="playlist-contains-overlay">
                                                    <div className="check-badge">✓</div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="playlist-info">
                                            <span className="playlist-name">{pl.name}</span>
                                            <span className="playlist-count">{getPlaylistTrackIds(pl.id).length} tracks</span>
                                        </div>
                                        <div className="playlist-card-actions">
                                            <button
                                                className="edit-playlist-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditingPlaylist(pl)
                                                    setNewPlaylistImage(pl.coverArt)
                                                    setShowPlaylistModal(true)
                                                }}
                                            >
                                                <EditIcon size={14} />
                                            </button>
                                            <button
                                                className="delete-playlist-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeletePlaylist(pl.id)
                                                }}
                                            >
                                                <TrashIcon size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div
                                    className="playlist-card create-playlist-card"
                                    onClick={() => {
                                        setShowPlaylistModal(true)
                                        closePlaylistBrowser()
                                        // Keep trackToAddToPlaylist set so it can be used by the modal
                                    }}
                                >
                                    <div className="create-icon">
                                        <PlusIcon size={32} />
                                    </div>
                                    <span>Create Playlist</span>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Create Playlist Modal */}
            {/* Fixed Track Menu - Portal to Body */}
            {
                trackMenuOpen && menuPosition && createPortal(
                    <div
                        className="track-menu-dropdown fixed-menu"
                        style={{
                            position: 'fixed',
                            top: menuPosition?.y,
                            left: menuPosition?.x,
                            // transform handles alignment and animation via CSS class 'fixed-menu'
                            zIndex: 9999,
                            width: 'auto',
                            minWidth: '180px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="menu-item"
                            onClick={(e) => {
                                e.stopPropagation()
                                const track = tracks.find(t => t.id === trackMenuOpen)
                                if (track) playNext(track)
                            }}
                        >
                            <SkipForwardIcon size={14} />
                            <span>Play Next</span>
                        </div>
                        <div
                            className="menu-item"
                            onClick={(e) => {
                                e.stopPropagation()
                                const track = tracks.find(t => t.id === trackMenuOpen)
                                if (track) addToQueue(track)
                            }}
                        >
                            <QueueIcon size={14} />
                            <span>Add to Queue</span>
                        </div>
                        <div
                            className="menu-item"
                            onClick={(e) => {
                                e.stopPropagation()
                                const track = tracks.find(t => t.id === trackMenuOpen)
                                if (track) {
                                    setTrackToAddToPlaylist(track)
                                    setShowPlaylistBrowser(true)
                                }
                                setTrackMenuOpen(null)
                            }}
                        >
                            <PlusIcon size={14} />
                            <span>Add to Playlist...</span>
                        </div>
                        <div
                            className="menu-item"
                            onClick={(e) => {
                                e.stopPropagation()
                                const track = tracks.find(t => t.id === trackMenuOpen)
                                if (track) openMetadataEdit(track)
                            }}
                        >
                            <EditIcon size={14} />
                            <span>Edit Metadata</span>
                        </div>
                        {activePlaylist && (
                            <div
                                className="menu-item menu-item-danger"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (trackMenuOpen) handleRemoveFromPlaylist(trackMenuOpen)
                                }}
                            >
                                <MinusIcon size={14} />
                                <span>Remove from Playlist</span>
                            </div>
                        )}
                    </div>,
                    document.body
                )
            }

            {/* Create Playlist Modal */}
            {/* Create Playlist Modal - Portal to Body */}
            {
                showPlaylistModal && createPortal(
                    <div className="playlist-modal-overlay" onClick={() => setShowPlaylistModal(false)}>
                        <div className="playlist-modal" onClick={(e) => e.stopPropagation()}>
                            <h3>{editingPlaylist ? 'Edit Playlist' : 'Create New Playlist'}</h3>
                            <form onSubmit={(e) => {
                                e.preventDefault()
                                const form = e.target as HTMLFormElement
                                const nameInput = form.elements.namedItem('name') as HTMLInputElement
                                const name = nameInput.value
                                if (name && name.trim()) {
                                    handleSavePlaylist(name.trim(), '', newPlaylistImage)
                                }
                            }}>
                                <div className="playlist-modal-content" style={{ flexDirection: 'column', alignItems: 'center', width: '100%', gap: '20px' }}>

                                    <div className="form-group" style={{ width: '100%' }}>
                                        <label>Playlist Name</label>
                                        <input
                                            type="text"
                                            name="name"
                                            defaultValue={editingPlaylist?.name || ''}
                                            placeholder="My Awesome Playlist"
                                            required
                                            autoFocus
                                            style={{ fontSize: '0.95rem', padding: '10px 12px', width: '100%' }}
                                        />
                                    </div>

                                    <div className="form-group image-upload-group" style={{ width: '100%', alignItems: 'center' }}>
                                        <label style={{ marginBottom: '8px', width: '100%', textAlign: 'center' }}>Cover Image</label>
                                        <div
                                            className={`image-preview-container ${isDraggingImage ? 'dragging' : ''}`}
                                            onClick={() => document.getElementById('playlist-image-input')?.click()}
                                            onDragOver={handleImageDragOver}
                                            onDragEnter={handleImageDragOver}
                                            onDragLeave={handleImageDragLeave}
                                            onDrop={handleImageDrop}
                                            style={{ width: '140px', height: '140px' }}
                                        >
                                            {newPlaylistImage ? (
                                                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                                    <img src={newPlaylistImage} alt="Preview" className="playlist-image-preview" />
                                                    <button
                                                        className="remove-image-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setNewPlaylistImage(null)
                                                        }}
                                                        title="Remove Image"
                                                    >
                                                        <TrashIcon size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="upload-placeholder">
                                                    <UploadIcon size={40} className="upload-icon-animated" />
                                                </div>
                                            )}
                                            <input
                                                id="playlist-image-input"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageSelect}
                                                style={{ display: 'none' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-actions">
                                    <button type="button" className="cancel-btn" onClick={() => {
                                        setShowPlaylistModal(false)
                                        setEditingPlaylist(null)
                                        setNewPlaylistImage(null)
                                        setIsDraggingImage(false)
                                    }}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="create-btn">
                                        {editingPlaylist ? 'Save Changes' : 'Create Playlist'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )
            }
            {/* Queue View Overlay */}
            {showQueueView && playbackQueue.length > 0 && createPortal(
                <div className="queue-overlay" onClick={() => setShowQueueView(false)}>
                    <div className="queue-panel" onClick={e => e.stopPropagation()}>
                        <div className="queue-header">
                            <h3>Up Next ({playbackQueue.length})</h3>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="queue-clear-btn" onClick={() => { setPlaybackQueue([]); setShowQueueView(false) }}>
                                    Clear
                                </button>
                                <button className="close-btn" onClick={() => setShowQueueView(false)}>
                                    <CloseIcon size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="queue-list">
                            {playbackQueue.map((track, i) => (
                                <div key={`${track.id}-${i}`} className="queue-item">
                                    <span className="queue-item-index">{i + 1}</span>
                                    <div className="queue-item-info">
                                        <span className="queue-item-title">{track.title}</span>
                                        <span className="queue-item-artist">{track.artist}</span>
                                    </div>
                                    <button
                                        className="queue-remove-btn"
                                        onClick={() => setPlaybackQueue(q => q.filter((_, idx) => idx !== i))}
                                    >
                                        <CloseIcon size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Metadata Edit Modal */}
            {editingTrackMeta && createPortal(
                <div className="playlist-modal-overlay" onClick={() => setEditingTrackMeta(null)}>
                    <div className="playlist-modal" onClick={e => e.stopPropagation()}>
                        <h3>Edit Metadata</h3>
                        <form onSubmit={(e) => { e.preventDefault(); saveMetadataEdit() }}>
                            <div className="playlist-modal-content" style={{ flexDirection: 'column', width: '100%', gap: '12px' }}>
                                <div className="form-group" style={{ width: '100%' }}>
                                    <label>Title</label>
                                    <input
                                        type="text"
                                        value={metaEditValues.title}
                                        onChange={e => setMetaEditValues(v => ({ ...v, title: e.target.value }))}
                                        style={{ fontSize: '0.95rem', padding: '10px 12px', width: '100%' }}
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group" style={{ width: '100%' }}>
                                    <label>Artist</label>
                                    <input
                                        type="text"
                                        value={metaEditValues.artist}
                                        onChange={e => setMetaEditValues(v => ({ ...v, artist: e.target.value }))}
                                        style={{ fontSize: '0.95rem', padding: '10px 12px', width: '100%' }}
                                    />
                                </div>
                                <div className="form-group" style={{ width: '100%' }}>
                                    <label>Album</label>
                                    <input
                                        type="text"
                                        value={metaEditValues.album}
                                        onChange={e => setMetaEditValues(v => ({ ...v, album: e.target.value }))}
                                        style={{ fontSize: '0.95rem', padding: '10px 12px', width: '100%' }}
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="cancel-btn" onClick={() => setEditingTrackMeta(null)}>Cancel</button>
                                <button type="submit" className="create-btn">Save</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div >
    )
}
