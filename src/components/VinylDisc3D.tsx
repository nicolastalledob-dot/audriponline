import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface VinylDisc3DProps {
    src: string | null
    artist?: string
    album?: string
    color?: string
    className?: string
    isPlaying?: boolean
    flatMode?: boolean  // For spinning record mode: flat disc, no tilt, no interaction
    playbackRate?: number  // Speed multiplier based on pitch (default 1)
}

function createGrooveTexture(tintColor?: string): THREE.CanvasTexture {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Base color — dark with optional color tint
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, size, size)

    // Apply subtle color tint from album art
    if (tintColor) {
        ctx.globalAlpha = 0.12
        ctx.fillStyle = tintColor
        ctx.fillRect(0, 0, size, size)
        ctx.globalAlpha = 1.0
    }

    const cx = size / 2
    const cy = size / 2
    const labelRadius = size * 0.2
    const outerRadius = size * 0.48

    // Fine grooves — alternating light/dark for relief effect
    for (let r = labelRadius; r <= outerRadius; r += 2.5) {
        const phase = (r - labelRadius) % 5
        if (phase < 2.5) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 0.6
        } else {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
            ctx.lineWidth = 0.8
        }
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
    }

    // Wider shimmer bands for depth
    ctx.lineWidth = 1.2
    for (let r = labelRadius; r <= outerRadius; r += 14) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
        // Dark band right next to it
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
        ctx.beginPath()
        ctx.arc(cx, cy, r + 1.2, 0, Math.PI * 2)
        ctx.stroke()
    }

    // Outer edge highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2)
    ctx.stroke()

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

function createLabelTexture(imgSrc: string): Promise<THREE.CanvasTexture> {
    return new Promise((resolve) => {
        const size = 512
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            // Draw circular clipped album art
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.clip()

            // Draw image covering the circle
            const aspect = img.width / img.height
            let drawW = size, drawH = size
            if (aspect > 1) { drawW = size * aspect } else { drawH = size / aspect }
            const dx = (size - drawW) / 2
            const dy = (size - drawH) / 2
            ctx.drawImage(img, dx, dy, drawW, drawH)

            const texture = new THREE.CanvasTexture(canvas)
            texture.colorSpace = THREE.SRGBColorSpace
            resolve(texture)
        }
        img.onerror = () => {
            // Fallback: dark label
            ctx.fillStyle = '#222222'
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
            ctx.fill()
            const texture = new THREE.CanvasTexture(canvas)
            texture.colorSpace = THREE.SRGBColorSpace
            resolve(texture)
        }
        img.src = imgSrc
    })
}

function createBackLabelTexture(artist: string, album?: string, bgColor: string = '#222222'): THREE.CanvasTexture {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Circular clip
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, size, size)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxWidth = size * 0.7

    // Artist name
    const artistY = album ? size * 0.44 : size * 0.5
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.7
    let artistSize = 44
    ctx.font = `600 ${artistSize}px -apple-system, "Segoe UI", sans-serif`
    while (ctx.measureText(artist).width > maxWidth && artistSize > 14) {
        artistSize -= 2
        ctx.font = `600 ${artistSize}px -apple-system, "Segoe UI", sans-serif`
    }
    ctx.fillText(artist, size / 2, artistY)

    // Album name
    if (album) {
        ctx.globalAlpha = 0.4
        let albumSize = Math.round(artistSize * 0.6)
        ctx.font = `400 ${albumSize}px -apple-system, "Segoe UI", sans-serif`
        while (ctx.measureText(album).width > maxWidth && albumSize > 10) {
            albumSize -= 2
            ctx.font = `400 ${albumSize}px -apple-system, "Segoe UI", sans-serif`
        }
        ctx.fillText(album, size / 2, artistY + artistSize * 0.9)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

export default function VinylDisc3D({ src, artist, album, color, className = 'cover-art-3d', isPlaying, flatMode = false, playbackRate = 1 }: VinylDisc3DProps) {
    const mountRef = useRef<HTMLDivElement>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const frameRef = useRef<number>(0)
    const groupRef = useRef<THREE.Group | null>(null)
    const frontLabelMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
    const backLabelMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
    const discMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
    const grooveTextureRef = useRef<THREE.CanvasTexture | null>(null)
    const isPlayingRef = useRef(isPlaying)
    const playbackRateRef = useRef(playbackRate)
    const currentSpeedRef = useRef(0)  // For smooth acceleration/deceleration

    useEffect(() => {
        isPlayingRef.current = isPlaying
    }, [isPlaying])

    useEffect(() => {
        playbackRateRef.current = playbackRate
    }, [playbackRate])

    // Setup scene once
    useEffect(() => {
        const mount = mountRef.current
        if (!mount) return

        const pad = 1.5
        const containerW = mount.clientWidth
        const containerH = mount.clientHeight
        const width = Math.round(containerW * pad)
        const height = Math.round(containerH * pad)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)

        // For flatMode: camera looks down from above at the disc
        if (flatMode) {
            camera.position.set(0, 2.5, 0)
            camera.lookAt(0, 0, 0)
        } else {
            camera.position.set(0, 0, 3.2)
        }

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: window.devicePixelRatio < 2 })
        renderer.setSize(width, height)
        renderer.domElement.style.position = 'absolute'
        renderer.domElement.style.left = '50%'
        renderer.domElement.style.top = '50%'
        renderer.domElement.style.transform = 'translate(-50%, -50%)'
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setClearColor(0x000000, 0)
        mount.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Lighting — same setup as CoverArtCube3D
        const ambient = new THREE.AmbientLight(0xffffff, 2.0)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.8)
        directional.position.set(2, 3, 4)
        scene.add(directional)
        const frontLight = new THREE.DirectionalLight(0xffffff, 0.5)
        frontLight.position.set(0, 0, 5)
        scene.add(frontLight)

        const group = new THREE.Group()
        // Tilt ~15° toward camera for normal mode, no rotation for flatMode
        if (!flatMode) {
            group.rotation.x = 1.25
        }

        // Disc body
        const discGeometry = new THREE.CylinderGeometry(0.85, 0.85, 0.03, 32)
        const grooveTexture = createGrooveTexture(color)
        grooveTextureRef.current = grooveTexture

        const discMaterial = new THREE.MeshStandardMaterial({
            map: grooveTexture,
            color: 0xffffff,
            metalness: 0.35,
            roughness: 0.35
        })
        discMaterialRef.current = discMaterial
        const disc = new THREE.Mesh(discGeometry, discMaterial)
        group.add(disc)

        // Front label (top face — circle with album art)
        const labelRadius = 0.35
        const labelGeometry = new THREE.CircleGeometry(labelRadius, 32)
        const frontLabelMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.1,
            roughness: 0.8
        })
        frontLabelMaterialRef.current = frontLabelMaterial

        const frontLabel = new THREE.Mesh(labelGeometry, frontLabelMaterial)
        frontLabel.position.y = 0.016 // just above disc top face
        frontLabel.rotation.x = -Math.PI / 2
        group.add(frontLabel)

        // Back label (bottom face — artist/album text)
        const backLabelGeometry = new THREE.CircleGeometry(labelRadius, 32)
        const backLabelMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.1,
            roughness: 0.8
        })
        backLabelMaterialRef.current = backLabelMaterial

        const backLabel = new THREE.Mesh(backLabelGeometry, backLabelMaterial)
        backLabel.position.y = -0.016 // just below disc bottom face
        backLabel.rotation.x = Math.PI / 2
        group.add(backLabel)

        // Center hole (spindle)
        const holeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16)
        const holeMaterial = new THREE.MeshStandardMaterial({
            color: 0x050505,
            metalness: 0.8,
            roughness: 0.2
        })
        const hole = new THREE.Mesh(holeGeometry, holeMaterial)
        hole.position.y = 0.001
        group.add(hole)

        groupRef.current = group
        scene.add(group)

        // ResizeObserver
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const cw = entry.contentRect.width
                const ch = entry.contentRect.height
                if (cw === 0 || ch === 0) continue
                const w = Math.round(cw * pad)
                const h = Math.round(ch * pad)
                renderer.setSize(w, h)
                camera.aspect = w / h
                camera.updateProjectionMatrix()
            }
        })
        resizeObserver.observe(mount)

        // Momentum physics (same as CoverArtCube3D)
        const worldY = new THREE.Vector3(0, 1, 0)
        const worldX = new THREE.Vector3(1, 0, 0)
        let velocityY = 0
        let velocityX = 0
        let isDragging = false
        let lastMouseX = 0
        let lastMouseY = 0
        let dragDist = 0
        const friction = 0.97
        const dragThreshold = 12
        const idleSpeed = 0.1
        let discovered = false
        let resetting = false
        const identityQuat = new THREE.Quaternion()
        // Store the tilt so reset returns to it
        identityQuat.setFromEuler(new THREE.Euler(1.25, 0, 0))
        let isHovered = false
        let lastTime = performance.now()

        const onMouseDown = (e: MouseEvent) => {
            if (e.target !== renderer.domElement) return
            resetting = false
            isDragging = true
            dragDist = 0
            lastMouseX = e.clientX
            lastMouseY = e.clientY
            mount.style.cursor = 'grabbing'
        }

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return
            const dx = e.clientX - lastMouseX
            const dy = e.clientY - lastMouseY
            dragDist += Math.abs(dx) + Math.abs(dy)
            if (dragDist >= dragThreshold) {
                const targetVY = dx * 0.008
                const targetVX = dy * 0.008
                velocityY += (targetVY - velocityY) * 0.5
                velocityX += (targetVX - velocityX) * 0.5
            }
            lastMouseX = e.clientX
            lastMouseY = e.clientY
        }

        const onMouseUp = () => {
            if (!isDragging) return
            discovered = true
            if (dragDist < dragThreshold) {
                velocityY += 0.06
                velocityX += 0.03
            }
            isDragging = false
            mount.style.cursor = 'grab'
        }

        const onDblClick = (e: MouseEvent) => {
            if (e.target !== renderer.domElement) return
            discovered = true
            velocityY += 0.3
            velocityX += 0.15
        }

        const onMouseEnter = () => { isHovered = true }
        const onMouseLeave = () => { isHovered = false }

        const onKeyDown = (e: KeyboardEvent) => {
            if (!isHovered) return
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
            if (e.key === 'r' || e.key === 'R') {
                velocityY = 0
                velocityX = 0
                discovered = false
                resetting = true
            }
        }

        // Only enable interaction if not in flatMode
        if (!flatMode) {
            mount.style.cursor = 'grab'
            mount.addEventListener('mousedown', onMouseDown)
            mount.addEventListener('dblclick', onDblClick)
            mount.addEventListener('mouseenter', onMouseEnter)
            mount.addEventListener('mouseleave', onMouseLeave)
            window.addEventListener('mousemove', onMouseMove)
            window.addEventListener('mouseup', onMouseUp)
            window.addEventListener('keydown', onKeyDown)
        }

        const baseSpeed = flatMode ? 0.025 : 0.012

        let tabHidden = document.hidden
        const onVisibilityChange = () => { tabHidden = document.hidden }
        document.addEventListener('visibilitychange', onVisibilityChange)

        const animate = () => {
            frameRef.current = requestAnimationFrame(animate)
            if (tabHidden) return

            const now = performance.now()
            const dt = Math.min((now - lastTime) / 16.667, 3)
            lastTime = now

            if (flatMode) {
                // Calculate target speed based on playing state and playback rate
                // Use power of 1.5 to amplify the effect of pitch changes
                const amplifiedRate = Math.pow(playbackRateRef.current, 1.5)
                const targetSpeed = isPlayingRef.current ? baseSpeed * amplifiedRate : 0

                // Smooth acceleration/deceleration (lerp towards target)
                const lerpFactor = isPlayingRef.current ? 0.08 : 0.03  // Faster acceleration, slower deceleration
                currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * lerpFactor * dt

                // Apply rotation if there's any speed
                if (Math.abs(currentSpeedRef.current) > 0.0001) {
                    group.rotation.y += currentSpeedRef.current * dt
                }
            } else {
                if (resetting) {
                    const slerpAlpha = 1 - Math.pow(1 - 0.08, dt)
                    group.quaternion.slerp(identityQuat, slerpAlpha)
                    if (group.quaternion.angleTo(identityQuat) < 0.005) {
                        group.quaternion.copy(identityQuat)
                        resetting = false
                    }
                } else {
                    // Playing animation: continuous turntable spin on Y
                    if (isPlayingRef.current) {
                        group.rotateOnWorldAxis(worldY, baseSpeed * dt)
                    }

                    // User momentum on top
                    group.rotateOnWorldAxis(worldY, velocityY * dt)
                    group.rotateOnWorldAxis(worldX, velocityX * dt)

                    if (!isDragging) {
                        const frictionDt = Math.pow(friction, dt)
                        velocityX *= frictionDt
                        velocityY *= frictionDt
                        if (discovered) {
                            if (Math.abs(velocityY) < 0.001 && Math.abs(velocityX) < 0.001) {
                                velocityY += (idleSpeed - velocityY) * 0.02 * dt
                                velocityX *= Math.pow(0.9, dt)
                            }
                        } else {
                            if (Math.abs(velocityY) < 0.0005) velocityY = 0
                            if (Math.abs(velocityX) < 0.0005) velocityX = 0
                        }
                    }
                }
            }
            renderer.render(scene, camera)
        }
        animate()

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            resizeObserver.disconnect()
            cancelAnimationFrame(frameRef.current)
            mount.removeEventListener('mousedown', onMouseDown)
            mount.removeEventListener('dblclick', onDblClick)
            mount.removeEventListener('mouseenter', onMouseEnter)
            mount.removeEventListener('mouseleave', onMouseLeave)
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.removeEventListener('keydown', onKeyDown)
            renderer.dispose()
            discGeometry.dispose()
            discMaterial.dispose()
            grooveTexture.dispose()
            labelGeometry.dispose()
            frontLabelMaterial.dispose()
            backLabelGeometry.dispose()
            backLabelMaterial.dispose()
            holeGeometry.dispose()
            holeMaterial.dispose()
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement)
            }
        }
    }, [])

    // Update front label texture when src changes
    useEffect(() => {
        const material = frontLabelMaterialRef.current
        if (!material) return

        let cancelled = false

        if (material.map) {
            material.map.dispose()
            material.map = null
        }

        if (src) {
            createLabelTexture(src).then((texture) => {
                if (cancelled) { texture.dispose(); return }
                material.map = texture
                material.color.set(0xffffff)
                material.needsUpdate = true
            })
        } else {
            material.color.set(0x444444)
            material.needsUpdate = true
        }

        return () => { cancelled = true }
    }, [src])

    // Update back label with artist + album
    useEffect(() => {
        const material = backLabelMaterialRef.current
        if (!material) return

        if (material.map) {
            material.map.dispose()
            material.map = null
        }

        if (artist) {
            const texture = createBackLabelTexture(artist, album, color || '#222222')
            material.map = texture
            material.color.set(0xffffff)
            material.needsUpdate = true
        } else {
            material.color.set(0x222222)
            material.needsUpdate = true
        }
    }, [artist, album, color])

    // Color tint removed - texture regeneration was too expensive
    // The groove texture is created once on mount

    return <div ref={mountRef} className={className} />
}
