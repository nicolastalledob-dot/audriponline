export interface Track {
    id: string
    userId: string
    title: string
    artist: string
    album: string
    coverArt: string | null  // base64
    duration: number
    fileUrl: string          // Object URL created from local blob
    fileName: string
    createdAt: string
}

export interface CloudPlaylist {
    id: string
    userId: string
    name: string
    description: string
    coverArt: string | null
    createdAt: string
    updatedAt: string
}

export interface FxPreset {
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
