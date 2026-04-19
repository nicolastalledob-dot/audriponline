import { api, AUDIO_URL, streamUrlFor } from './apiClient'
import { getSession } from './auth'
import type { Track, CloudPlaylist, FxPreset } from '../types'

// ── Tracks ──────────────────────────────────────────────

async function rowToTrack(row: any): Promise<Track> {
    return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        artist: row.artist,
        album: row.album,
        coverArt: row.cover_art,
        duration: row.duration,
        fileName: row.file_name,
        createdAt: row.created_at,
        fileUrl: await streamUrlFor(row.id),
    }
}

// cover_art is excluded — base64 art per row blows up the response (40 MB+
// at ~500 tracks). MusicPlayer lazy-loads it via getTrackCoverArt for the
// active track. FileManager shows a placeholder until edited.
const TRACK_LIST_COLUMNS = 'id,user_id,title,artist,album,duration,file_name,created_at'

export async function getTracks(_userId: string): Promise<Track[]> {
    const { data, error } = await api
        .from('tracks')
        .select(TRACK_LIST_COLUMNS)
        .order('created_at', { ascending: false })
    if (error) throw error
    return Promise.all((data ?? []).map(rowToTrack))
}

export async function getTrackCoverArt(trackId: string): Promise<string | null> {
    const { data, error } = await api
        .from('tracks')
        .select('cover_art')
        .eq('id', trackId)
        .maybeSingle()
    if (error) throw error
    return (data as any)?.cover_art ?? null
}

export async function upsertTrack(
    track: Omit<Track, 'fileUrl' | 'createdAt'> & { fileBlob: Blob; createdAt?: string }
): Promise<Track> {
    const session = await getSession()
    if (!session) throw new Error('not authenticated')

    const form = new FormData()
    form.append('file', track.fileBlob, track.fileName)
    const uploadRes = await fetch(`${AUDIO_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
    })
    if (!uploadRes.ok) {
        const t = await uploadRes.text().catch(() => '')
        throw new Error(`upload failed: ${uploadRes.status} ${t}`)
    }
    const uploaded = await uploadRes.json()

    const row = {
        id: track.id,
        user_id: track.userId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        cover_art: track.coverArt,
        duration: track.duration,
        file_path: uploaded.file_path,
        file_name: track.fileName,
        mime_type: uploaded.mime_type || track.fileBlob.type || null,
        size_bytes: uploaded.size_bytes ?? track.fileBlob.size,
    }
    const { data, error } = await api
        .from('tracks')
        .upsert(row, { onConflict: 'id' })
        .select()
        .single()
    if (error) throw error
    return rowToTrack(data)
}

export async function deleteTrack(trackId: string): Promise<void> {
    const { error } = await api.from('tracks').delete().eq('id', trackId)
    if (error) throw error
    const session = await getSession()
    if (session) {
        fetch(`${AUDIO_URL}/delete/${trackId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {})
    }
}

export async function updateTrackMetadata(
    trackId: string,
    metadata: { title?: string; artist?: string; album?: string; coverArt?: string | null }
): Promise<Track> {
    const patch: Record<string, any> = {}
    if (metadata.title !== undefined) patch.title = metadata.title
    if (metadata.artist !== undefined) patch.artist = metadata.artist
    if (metadata.album !== undefined) patch.album = metadata.album
    if (metadata.coverArt !== undefined) patch.cover_art = metadata.coverArt

    const { data, error } = await api
        .from('tracks')
        .update(patch)
        .eq('id', trackId)
        .select()
        .single()
    if (error) throw error
    return rowToTrack(data)
}

// ── Playlists ────────────────────────────────────────────

function rowToPlaylist(row: any): CloudPlaylist {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        description: row.description,
        coverArt: row.cover_art,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export async function getPlaylists(_userId: string): Promise<CloudPlaylist[]> {
    const { data, error } = await api
        .from('playlists')
        .select('*')
        .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToPlaylist)
}

export async function savePlaylist(
    playlist: Omit<CloudPlaylist, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }
): Promise<CloudPlaylist> {
    const row = {
        id: playlist.id,
        user_id: playlist.userId,
        name: playlist.name,
        description: playlist.description,
        cover_art: playlist.coverArt,
        updated_at: new Date().toISOString(),
        ...(playlist.createdAt ? { created_at: playlist.createdAt } : {}),
    }
    const { data, error } = await api
        .from('playlists')
        .upsert(row, { onConflict: 'id' })
        .select()
        .single()
    if (error) throw error
    return rowToPlaylist(data)
}

export async function deletePlaylist(playlistId: string): Promise<void> {
    const { error } = await api.from('playlists').delete().eq('id', playlistId)
    if (error) throw error
}

export async function getPlaylistTracks(playlistId: string): Promise<string[]> {
    const { data, error } = await api
        .from('playlist_tracks')
        .select('track_id, position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r: any) => r.track_id)
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const { data: existing } = await api
        .from('playlist_tracks')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
    const nextPos = existing && existing.length > 0 ? (existing[0] as any).position + 1 : 0

    const { error } = await api
        .from('playlist_tracks')
        .insert({ playlist_id: playlistId, track_id: trackId, position: nextPos })
    if (error) throw error
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const { error } = await api
        .from('playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId)
    if (error) throw error
}

// ── FX Presets ───────────────────────────────────────────

function rowToFx(row: any): FxPreset {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        bass: row.bass,
        reverb: row.reverb,
        pitch: row.pitch,
        delay: row.delay,
        stereoWidth: row.stereo_width,
        distort: row.distort,
    }
}

export async function getFxPresets(_userId: string): Promise<FxPreset[]> {
    const { data, error } = await api
        .from('fx_presets')
        .select('*')
        .order('name', { ascending: true })
    if (error) throw error
    return (data ?? []).map(rowToFx)
}

export async function saveFxPreset(
    preset: Omit<FxPreset, 'id'> & { id?: string }
): Promise<FxPreset> {
    const row = {
        ...(preset.id ? { id: preset.id } : {}),
        user_id: preset.userId,
        name: preset.name,
        bass: preset.bass,
        reverb: preset.reverb,
        pitch: preset.pitch,
        delay: preset.delay,
        stereo_width: preset.stereoWidth,
        distort: preset.distort,
    }
    const { data, error } = await api
        .from('fx_presets')
        .upsert(row, { onConflict: 'id' })
        .select()
        .single()
    if (error) throw error
    return rowToFx(data)
}

export async function deleteFxPreset(presetId: string): Promise<void> {
    const { error } = await api.from('fx_presets').delete().eq('id', presetId)
    if (error) throw error
}

// Stub kept for parity with localDb — no blob URLs in server mode.
export function revokeTrackUrls(_trackIds?: string[]): void {}
