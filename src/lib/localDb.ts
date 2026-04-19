import { openDB, type IDBPDatabase } from 'idb'
import type { Track, CloudPlaylist, FxPreset } from '../types'

// ── Schema ──────────────────────────────────────────────

interface StoredTrack {
    id: string
    userId: string
    title: string
    artist: string
    album: string
    coverArt: string | null
    duration: number
    fileName: string
    createdAt: string
    fileBlob: Blob
}

interface StoredPlaylist {
    id: string
    userId: string
    name: string
    description: string
    coverArt: string | null
    createdAt: string
    updatedAt: string
}

interface StoredPlaylistTrack {
    playlistId: string
    trackId: string
    position: number
}

interface StoredFxPreset {
    id: string
    userId: string
    name: string
    bass: number
    reverb: number
    pitch: number
    delay: number
    stereoWidth: number
    distort: number
}

// ── DB init ─────────────────────────────────────────────

const DB_NAME = 'audrip_local'
const DB_VERSION = 1

let _db: IDBPDatabase | null = null

async function getDb(): Promise<IDBPDatabase> {
    if (_db) return _db
    _db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            const tracks = db.createObjectStore('tracks', { keyPath: 'id' })
            tracks.createIndex('userId', 'userId')

            const playlists = db.createObjectStore('playlists', { keyPath: 'id' })
            playlists.createIndex('userId', 'userId')

            const playlistTracks = db.createObjectStore('playlist_tracks', {
                keyPath: ['playlistId', 'trackId']
            })
            playlistTracks.createIndex('playlistId', 'playlistId')

            const fxPresets = db.createObjectStore('fx_presets', { keyPath: 'id' })
            fxPresets.createIndex('userId', 'userId')
        }
    })
    return _db
}

// ── Object URL cache ─────────────────────────────────────

const urlCache = new Map<string, string>()

export function revokeTrackUrls(trackIds?: string[]): void {
    if (trackIds) {
        for (const id of trackIds) {
            const url = urlCache.get(id)
            if (url) { URL.revokeObjectURL(url); urlCache.delete(id) }
        }
    } else {
        for (const url of urlCache.values()) URL.revokeObjectURL(url)
        urlCache.clear()
    }
}

function blobToUrl(trackId: string, blob: Blob): string {
    const existing = urlCache.get(trackId)
    if (existing) return existing
    const url = URL.createObjectURL(blob)
    urlCache.set(trackId, url)
    return url
}

function storedToTrack(row: StoredTrack): Track {
    return {
        id: row.id,
        userId: row.userId,
        title: row.title,
        artist: row.artist,
        album: row.album,
        coverArt: row.coverArt,
        duration: row.duration,
        fileName: row.fileName,
        createdAt: row.createdAt,
        fileUrl: blobToUrl(row.id, row.fileBlob),
    }
}

// ── Tracks ──────────────────────────────────────────────

export async function getTracks(userId: string): Promise<Track[]> {
    const db = await getDb()
    const rows: StoredTrack[] = await db.getAllFromIndex('tracks', 'userId', userId)
    return rows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(storedToTrack)
}

export async function getTrackCoverArt(trackId: string): Promise<string | null> {
    const db = await getDb()
    const row: StoredTrack | undefined = await db.get('tracks', trackId)
    return row?.coverArt ?? null
}

export async function upsertTrack(
    track: Omit<Track, 'fileUrl' | 'createdAt'> & { fileBlob: Blob; createdAt?: string }
): Promise<Track> {
    const db = await getDb()
    const now = track.createdAt ?? new Date().toISOString()
    const stored: StoredTrack = {
        id: track.id,
        userId: track.userId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverArt: track.coverArt,
        duration: track.duration,
        fileName: track.fileName,
        createdAt: now,
        fileBlob: track.fileBlob,
    }
    // Invalidate URL cache so the new blob is used
    revokeTrackUrls([track.id])
    await db.put('tracks', stored)
    return storedToTrack(stored)
}

export async function deleteTrack(trackId: string): Promise<void> {
    const db = await getDb()
    revokeTrackUrls([trackId])
    await db.delete('tracks', trackId)
}

export async function updateTrackMetadata(
    trackId: string,
    metadata: { title?: string; artist?: string; album?: string; coverArt?: string | null }
): Promise<Track> {
    const db = await getDb()
    const row: StoredTrack | undefined = await db.get('tracks', trackId)
    if (!row) throw new Error(`Track ${trackId} not found`)

    const updated: StoredTrack = {
        ...row,
        ...(metadata.title !== undefined && { title: metadata.title }),
        ...(metadata.artist !== undefined && { artist: metadata.artist }),
        ...(metadata.album !== undefined && { album: metadata.album }),
        ...(metadata.coverArt !== undefined && { coverArt: metadata.coverArt }),
    }
    await db.put('tracks', updated)
    return storedToTrack(updated)
}

// ── Playlists ────────────────────────────────────────────

export async function getPlaylists(userId: string): Promise<CloudPlaylist[]> {
    const db = await getDb()
    const rows: StoredPlaylist[] = await db.getAllFromIndex('playlists', 'userId', userId)
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function savePlaylist(
    playlist: Omit<CloudPlaylist, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }
): Promise<CloudPlaylist> {
    const db = await getDb()
    const now = new Date().toISOString()
    const stored: StoredPlaylist = {
        id: playlist.id,
        userId: playlist.userId,
        name: playlist.name,
        description: playlist.description,
        coverArt: playlist.coverArt,
        createdAt: playlist.createdAt ?? now,
        updatedAt: now,
    }
    await db.put('playlists', stored)
    return stored
}

export async function deletePlaylist(playlistId: string): Promise<void> {
    const db = await getDb()
    const tx = db.transaction(['playlists', 'playlist_tracks'], 'readwrite')
    await tx.objectStore('playlists').delete(playlistId)
    // Delete all junction rows for this playlist
    const index = tx.objectStore('playlist_tracks').index('playlistId')
    let cursor = await index.openCursor(playlistId)
    while (cursor) {
        await cursor.delete()
        cursor = await cursor.continue()
    }
    await tx.done
}

export async function getPlaylistTracks(playlistId: string): Promise<string[]> {
    const db = await getDb()
    const rows: StoredPlaylistTrack[] = await db.getAllFromIndex('playlist_tracks', 'playlistId', playlistId)
    return rows
        .sort((a, b) => a.position - b.position)
        .map(r => r.trackId)
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const db = await getDb()
    const existing: StoredPlaylistTrack[] = await db.getAllFromIndex('playlist_tracks', 'playlistId', playlistId)
    const nextPos = existing.length > 0 ? Math.max(...existing.map(r => r.position)) + 1 : 0
    await db.put('playlist_tracks', { playlistId, trackId, position: nextPos })
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const db = await getDb()
    await db.delete('playlist_tracks', [playlistId, trackId])
}

// ── FX Presets ───────────────────────────────────────────

export async function getFxPresets(userId: string): Promise<FxPreset[]> {
    const db = await getDb()
    const rows: StoredFxPreset[] = await db.getAllFromIndex('fx_presets', 'userId', userId)
    return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveFxPreset(
    preset: Omit<FxPreset, 'id'> & { id?: string }
): Promise<FxPreset> {
    const db = await getDb()
    const stored: StoredFxPreset = {
        id: preset.id ?? crypto.randomUUID(),
        userId: preset.userId,
        name: preset.name,
        bass: preset.bass,
        reverb: preset.reverb,
        pitch: preset.pitch,
        delay: preset.delay,
        stereoWidth: preset.stereoWidth,
        distort: preset.distort,
    }
    await db.put('fx_presets', stored)
    return stored
}

export async function deleteFxPreset(presetId: string): Promise<void> {
    const db = await getDb()
    await db.delete('fx_presets', presetId)
}
