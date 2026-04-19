import { useRef, useState } from 'react'
import { Loader2, FolderOpen, FolderPlus } from 'lucide-react'
import { upsertTrack } from '../lib/serverDb'
import { generateUuid } from '../lib/uuid'
import type { Track } from '../types'

interface UploadButtonProps {
    userId: string
    onUploadComplete?: (tracks: Track[]) => void
    onOpenFileManager?: () => void
    variant?: 'toolbar' | 'menu-item'
}

async function extractMetadata(file: File): Promise<{
    title: string
    artist: string
    album: string
    duration: number
    coverArt: string | null
}> {
    let title = file.name.replace(/\.[^/.]+$/, '')
    let artist = 'Unknown Artist'
    let album = 'Unknown Album'
    let duration = 0
    let coverArt: string | null = null

    try {
        const mmb = await import('music-metadata-browser')
        const metadata = await mmb.parseBlob(file)
        if (metadata.common.title) title = metadata.common.title
        if (metadata.common.artist) artist = metadata.common.artist
        if (metadata.common.album) album = metadata.common.album
        if (metadata.format.duration) duration = metadata.format.duration

        const pic = metadata.common.picture?.[0]
        if (pic) {
            const base64 = btoa(
                Array.from(new Uint8Array(pic.data))
                    .map(b => String.fromCharCode(b))
                    .join('')
            )
            coverArt = `data:${pic.format};base64,${base64}`
        }
    } catch {
        // Metadata extraction failed, use defaults
    }

    return { title, artist, album, duration, coverArt }
}

async function importFiles(files: File[], userId: string, onProgress: (current: number, total: number) => void): Promise<Track[]> {
    const imported: Track[] = []
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        onProgress(i + 1, files.length)
        try {
            const meta = await extractMetadata(file)
            const track = await upsertTrack({
                id: generateUuid(),
                userId,
                ...meta,
                fileName: file.name,
                fileBlob: file,
            })
            imported.push(track)
        } catch (err) {
            console.error(`Failed to import ${file.name}:`, err)
        }
    }
    return imported
}

export default function UploadButton({ userId, onUploadComplete, onOpenFileManager, variant = 'toolbar' }: UploadButtonProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const [importing, setImporting] = useState(false)
    const [progress, setProgress] = useState({ current: 0, total: 0 })

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac|opus|wma|aiff?)$/i.test(f.name))
        if (audioFiles.length === 0) return

        setImporting(true)
        try {
            const imported = await importFiles(audioFiles, userId, (current, total) => {
                setProgress({ current, total })
            })
            if (imported.length > 0) onUploadComplete?.(imported)
        } finally {
            setImporting(false)
            setProgress({ current: 0, total: 0 })
            if (fileInputRef.current) fileInputRef.current.value = ''
            if (folderInputRef.current) folderInputRef.current.value = ''
        }
    }

    const progressLabel = importing ? `${progress.current}/${progress.total}` : ''

    if (variant === 'menu-item') {
        return (
            <>
                <input ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
                <input ref={folderInputRef} type="file" accept="audio/*" multiple style={{ display: 'none' }}
                    // @ts-expect-error webkitdirectory is non-standard
                    webkitdirectory=""
                    onChange={e => handleFiles(e.target.files)}
                />
                <button className="mobile-menu-item" onClick={() => onOpenFileManager?.()} disabled={importing}>
                    <FolderOpen size={18} />
                    <span>{importing ? `Importing ${progressLabel}...` : 'Files'}</span>
                </button>
            </>
        )
    }

    return (
        <>
            <input ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            <input ref={folderInputRef} type="file" accept="audio/*" multiple style={{ display: 'none' }}
                // @ts-expect-error webkitdirectory is non-standard
                webkitdirectory=""
                onChange={e => handleFiles(e.target.files)}
            />
            <button
                className="toolbar-btn upload-btn"
                onClick={() => onOpenFileManager?.()}
                disabled={importing}
                title={importing ? `Importing ${progressLabel}...` : 'File Manager'}
            >
                {importing
                    ? <><Loader2 size={20} className="spin" /><span className="upload-progress-text">{progressLabel}</span></>
                    : <FolderPlus size={20} />
                }
            </button>
        </>
    )
}
