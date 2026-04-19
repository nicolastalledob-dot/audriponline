import { useState, useRef, useEffect } from 'react'
import {
    X, Search, Trash2, Edit3, Music, Image, Save, Upload, MoreVertical,
    HardDrive, Loader2, FolderOpen
} from 'lucide-react'
import type { Track } from '../types'
import { deleteTrack, updateTrackMetadata, upsertTrack } from '../lib/serverDb'
import { generateUuid } from '../lib/uuid'

interface FileManagerProps {
    tracks: Track[]
    userId: string
    onClose: () => void
    onRefresh: () => void
}

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

async function extractMetadata(file: File) {
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
            const base64 = btoa(Array.from(new Uint8Array(pic.data)).map(b => String.fromCharCode(b)).join(''))
            coverArt = `data:${pic.format};base64,${base64}`
        }
    } catch { /* use defaults */ }
    return { title, artist, album, duration, coverArt }
}

export default function FileManager({ tracks, userId, onClose, onRefresh }: FileManagerProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [editingTrack, setEditingTrack] = useState<Track | null>(null)
    const [editForm, setEditForm] = useState({ title: '', artist: '', album: '' })
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const [newCoverArt, setNewCoverArt] = useState<string | null>(null)
    const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
    // Batch edit state
    const [showBatchEdit, setShowBatchEdit] = useState(false)
    const [batchForm, setBatchForm] = useState({ artist: '', album: '' })
    const [batchCoverArt, setBatchCoverArt] = useState<string | null>(null)
    const [isBatchSaving, setIsBatchSaving] = useState(false)

    const coverInputRef = useRef<HTMLInputElement>(null)
    const batchCoverInputRef = useRef<HTMLInputElement>(null)
    const uploadInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const handleClick = () => { if (openMenu) setOpenMenu(null) }
        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [openMenu])

    const filteredTracks = tracks.filter(t => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q)
    })

    const handleImport = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac|opus|wma|aiff?)$/i.test(f.name))
        if (audioFiles.length === 0) return

        setUploading(true)
        setUploadProgress({ current: 0, total: audioFiles.length })
        try {
            for (let i = 0; i < audioFiles.length; i++) {
                const file = audioFiles[i]
                setUploadProgress({ current: i + 1, total: audioFiles.length })
                try {
                    const meta = await extractMetadata(file)
                    await upsertTrack({ id: generateUuid(), userId, ...meta, fileName: file.name, fileBlob: file })
                } catch (err) {
                    console.error(`Failed to import ${file.name}:`, err)
                }
            }
            onRefresh()
        } finally {
            setUploading(false)
            if (uploadInputRef.current) uploadInputRef.current.value = ''
            if (folderInputRef.current) folderInputRef.current.value = ''
        }
    }

    const handleDelete = async (track: Track) => {
        setIsDeleting(true)
        try {
            await deleteTrack(track.id)
            setConfirmDelete(null)
            onRefresh()
        } catch (err) {
            console.error('Failed to delete track:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleDeleteSelected = async () => {
        if (selectedTracks.size === 0) return
        setIsDeleting(true)
        try {
            for (const trackId of selectedTracks) {
                await deleteTrack(trackId)
            }
            setSelectedTracks(new Set())
            setConfirmDelete(null)
            onRefresh()
        } catch (err) {
            console.error('Failed to delete tracks:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleEdit = (track: Track) => {
        setEditingTrack(track)
        setEditForm({ title: track.title, artist: track.artist, album: track.album })
        setNewCoverArt(null)
    }

    const handleSaveEdit = async () => {
        if (!editingTrack) return
        setIsSaving(true)
        try {
            await updateTrackMetadata(editingTrack.id, {
                title: editForm.title,
                artist: editForm.artist,
                album: editForm.album,
                coverArt: newCoverArt !== null ? newCoverArt : editingTrack.coverArt
            })
            setEditingTrack(null)
            onRefresh()
        } catch (err) {
            console.error('Failed to update track:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleBatchSave = async () => {
        if (selectedTracks.size === 0) return
        setIsBatchSaving(true)
        try {
            const updates: { artist?: string; album?: string; coverArt?: string | null } = {}
            if (batchForm.artist.trim()) updates.artist = batchForm.artist.trim()
            if (batchForm.album.trim()) updates.album = batchForm.album.trim()
            if (batchCoverArt !== null) updates.coverArt = batchCoverArt

            for (const trackId of selectedTracks) {
                if (Object.keys(updates).length > 0) {
                    await updateTrackMetadata(trackId, updates)
                }
            }
            setShowBatchEdit(false)
            setSelectedTracks(new Set())
            setBatchForm({ artist: '', album: '' })
            setBatchCoverArt(null)
            onRefresh()
        } catch (err) {
            console.error('Failed to batch update:', err)
        } finally {
            setIsBatchSaving(false)
        }
    }

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => setNewCoverArt(reader.result as string)
        reader.readAsDataURL(file)
    }

    const handleBatchCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => setBatchCoverArt(reader.result as string)
        reader.readAsDataURL(file)
    }

    const toggleTrackSelection = (trackId: string) => {
        const next = new Set(selectedTracks)
        if (next.has(trackId)) next.delete(trackId)
        else next.add(trackId)
        setSelectedTracks(next)
    }

    const totalTracks = tracks.length

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="modal-content file-manager-content">
                {/* Hidden inputs */}
                <input ref={uploadInputRef} type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={e => handleImport(e.target.files)} />
                <input ref={folderInputRef} type="file" accept="audio/*" multiple style={{ display: 'none' }}
                    // @ts-expect-error webkitdirectory is non-standard
                    webkitdirectory=""
                    onChange={e => handleImport(e.target.files)}
                />

                {/* Header */}
                <div className="modal-header">
                    <h2>Files</h2>
                    <div className="fm-header-actions">
                        {selectedTracks.size > 0 ? (
                            <>
                                <span className="fm-selected-count">{selectedTracks.size} selected</span>
                                <button className="fm-edit-btn" onClick={() => { setBatchForm({ artist: '', album: '' }); setBatchCoverArt(null); setShowBatchEdit(true) }}>
                                    <Edit3 size={16} />
                                </button>
                                <button className="fm-delete-btn" onClick={() => setConfirmDelete('bulk')}>
                                    <Trash2 size={16} />
                                </button>
                                <button className="fm-text-btn" onClick={() => setSelectedTracks(new Set())}>
                                    Clear
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="fm-upload-btn" onClick={() => folderInputRef.current?.click()} disabled={uploading} title="Import folder">
                                    {uploading ? <><Loader2 size={16} className="spin" /><span>{uploadProgress.current}/{uploadProgress.total}</span></> : <><FolderOpen size={16} /><span>Folder</span></>}
                                </button>
                                <button className="fm-upload-btn" onClick={() => uploadInputRef.current?.click()} disabled={uploading} title="Import files">
                                    <Upload size={16} />
                                    <span>Files</span>
                                </button>
                                <button className="close-btn" onClick={onClose}><X size={16} /></button>
                            </>
                        )}
                    </div>
                </div>

                <div className="modal-body">
                    <div className="fm-storage">
                        <HardDrive size={14} />
                        <span>{totalTracks} tracks in local library</span>
                    </div>

                    <div className="fm-toolbar">
                        <div className="fm-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    <div className="fm-list">
                        {filteredTracks.length === 0 ? (
                            <div className="fm-empty">
                                <Music size={48} />
                                <p>{searchQuery ? 'No matches found' : 'No music yet — import a folder or files'}</p>
                            </div>
                        ) : (
                            filteredTracks.map(track => (
                                <div
                                    key={track.id}
                                    className={`fm-file-row ${selectedTracks.has(track.id) ? 'selected' : ''}`}
                                    onClick={() => toggleTrackSelection(track.id)}
                                >
                                    <div className="fm-file-art">
                                        {track.coverArt ? <img src={track.coverArt} alt="" /> : <Music size={18} />}
                                    </div>
                                    <div className="fm-file-info">
                                        <span className="fm-file-title">{track.title}</span>
                                        <span className="fm-file-meta">{track.artist}</span>
                                    </div>
                                    <span className="fm-file-duration">{formatDuration(track.duration)}</span>
                                    <div className="fm-file-actions" onClick={e => e.stopPropagation()}>
                                        <button
                                            className="fm-action-btn"
                                            onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === track.id ? null : track.id) }}
                                        >
                                            <MoreVertical size={18} />
                                        </button>
                                        {openMenu === track.id && (
                                            <div className="fm-menu">
                                                <button onClick={() => { handleEdit(track); setOpenMenu(null) }}>
                                                    <Edit3 size={14} /><span>Edit</span>
                                                </button>
                                                <button className="danger" onClick={() => { setConfirmDelete(track.id); setOpenMenu(null) }}>
                                                    <Trash2 size={14} /><span>Delete</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Single track edit modal */}
                {editingTrack && (
                    <div className="fm-edit-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingTrack(null) }}>
                        <div className="fm-edit-modal" onClick={e => e.stopPropagation()}>
                            <h3>Edit Track</h3>
                            <div className="fm-edit-cover">
                                <div className="fm-edit-cover-preview" onClick={() => coverInputRef.current?.click()}>
                                    {(newCoverArt || editingTrack.coverArt) ? (
                                        <img src={newCoverArt || editingTrack.coverArt || ''} alt="" />
                                    ) : <Music size={32} />}
                                    <div className="fm-edit-cover-overlay"><Image size={20} /><span>Change</span></div>
                                </div>
                                <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverChange} />
                            </div>
                            <div className="fm-edit-form">
                                <label>
                                    <span>Title</span>
                                    <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} onClick={e => e.stopPropagation()} />
                                </label>
                                <label>
                                    <span>Artist</span>
                                    <input type="text" value={editForm.artist} onChange={e => setEditForm({ ...editForm, artist: e.target.value })} onClick={e => e.stopPropagation()} />
                                </label>
                                <label>
                                    <span>Album</span>
                                    <input type="text" value={editForm.album} onChange={e => setEditForm({ ...editForm, album: e.target.value })} onClick={e => e.stopPropagation()} />
                                </label>
                            </div>
                            <div className="fm-edit-actions">
                                <button className="fm-btn-secondary" onClick={() => setEditingTrack(null)}>Cancel</button>
                                <button className="fm-btn-primary" onClick={handleSaveEdit} disabled={isSaving}>
                                    <Save size={16} /><span>{isSaving ? 'Saving...' : 'Save'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Batch edit modal */}
                {showBatchEdit && (
                    <div className="fm-edit-overlay" onClick={e => { if (e.target === e.currentTarget) setShowBatchEdit(false) }}>
                        <div className="fm-edit-modal" onClick={e => e.stopPropagation()}>
                            <h3>Edit {selectedTracks.size} tracks</h3>
                            <p className="fm-batch-hint">Leave blank to keep each track's existing value.</p>
                            <div className="fm-edit-cover">
                                <div className="fm-edit-cover-preview" onClick={() => batchCoverInputRef.current?.click()}>
                                    {batchCoverArt ? <img src={batchCoverArt} alt="" /> : <Music size={32} />}
                                    <div className="fm-edit-cover-overlay"><Image size={20} /><span>{batchCoverArt ? 'Change' : 'Set cover'}</span></div>
                                </div>
                                <input ref={batchCoverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBatchCoverChange} />
                            </div>
                            <div className="fm-edit-form">
                                <label>
                                    <span>Artist</span>
                                    <input type="text" placeholder="Set for all selected..." value={batchForm.artist} onChange={e => setBatchForm({ ...batchForm, artist: e.target.value })} onClick={e => e.stopPropagation()} />
                                </label>
                                <label>
                                    <span>Album</span>
                                    <input type="text" placeholder="Set for all selected..." value={batchForm.album} onChange={e => setBatchForm({ ...batchForm, album: e.target.value })} onClick={e => e.stopPropagation()} />
                                </label>
                            </div>
                            <div className="fm-edit-actions">
                                <button className="fm-btn-secondary" onClick={() => setShowBatchEdit(false)}>Cancel</button>
                                <button className="fm-btn-primary" onClick={handleBatchSave} disabled={isBatchSaving}>
                                    <Save size={16} /><span>{isBatchSaving ? 'Saving...' : 'Apply to all'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete confirmation */}
                {confirmDelete && (
                    <div className="fm-confirm-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
                        <div className="fm-confirm-modal" onClick={e => e.stopPropagation()}>
                            <Trash2 size={32} className="fm-confirm-icon" />
                            <h3>Delete {confirmDelete === 'bulk' ? `${selectedTracks.size} tracks` : 'track'}?</h3>
                            <p>This removes {confirmDelete === 'bulk' ? 'them' : 'it'} from your local library.</p>
                            <div className="fm-confirm-actions">
                                <button className="fm-btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                <button
                                    className="fm-btn-danger"
                                    onClick={() => confirmDelete === 'bulk' ? handleDeleteSelected() : handleDelete(tracks.find(t => t.id === confirmDelete)!)}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
