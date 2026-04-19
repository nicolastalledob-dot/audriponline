import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface CoverArtCube3DProps {
    src: string | null
    artist?: string
    album?: string
    color?: string
    className?: string
    isPlaying?: boolean
    flatMode?: boolean
    playbackRate?: number
}

function createBackTexture(artist: string, album?: string, bgColor: string = '#222222'): THREE.CanvasTexture {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Background matching material
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, size, size)

    ctx.textAlign = 'center'
    const maxWidth = size * 0.8

    // Artist name — larger, above center
    const artistY = album ? size * 0.44 : size * 0.5
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.7
    let artistSize = 52
    ctx.font = `600 ${artistSize}px -apple-system, "Segoe UI", sans-serif`
    while (ctx.measureText(artist).width > maxWidth && artistSize > 14) {
        artistSize -= 2
        ctx.font = `600 ${artistSize}px -apple-system, "Segoe UI", sans-serif`
    }
    ctx.textBaseline = 'middle'
    ctx.fillText(artist, size / 2, artistY)

    // Album name — smaller, below artist
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

export default function CoverArtCube3D({ src, artist, album, color, className = 'cover-art-3d', isPlaying, flatMode = false, playbackRate = 1 }: CoverArtCube3DProps) {
    const mountRef = useRef<HTMLDivElement>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const frameRef = useRef<number>(0)
    const meshRef = useRef<THREE.Mesh | null>(null)
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
    const backMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
    const sideMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
    const isPlayingRef = useRef(isPlaying)
    const playbackRateRef = useRef(playbackRate)
    const currentSpeedRef = useRef(0)

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

        // Render canvas 50% larger than container so rotated edges don't clip
        const pad = 1.5
        const containerW = mount.clientWidth
        const containerH = mount.clientHeight
        const width = Math.round(containerW * pad)
        const height = Math.round(containerH * pad)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)

        if (flatMode) {
            camera.position.set(0, 3.2, 0)
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

        const ambient = new THREE.AmbientLight(0xffffff, 2.0)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.8)
        directional.position.set(2, 3, 4)
        scene.add(directional)
        const frontLight = new THREE.DirectionalLight(0xffffff, 0.5)
        frontLight.position.set(0, 0, 5)
        scene.add(frontLight)

        const geometry = new THREE.BoxGeometry(1.68, 1.68, 0.19)
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.1,
            roughness: 0.8
        })
        const frontMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.1,
            roughness: 0.8
        })
        const backMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.1,
            roughness: 0.8
        })

        materialRef.current = frontMaterial
        backMaterialRef.current = backMaterial
        sideMaterialRef.current = sideMaterial

        // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
        const materials = [sideMaterial, sideMaterial, sideMaterial, sideMaterial, frontMaterial, backMaterial]
        const mesh = new THREE.Mesh(geometry, materials)

        // In flatMode, rotate the mesh so the front face (+Z) points upward toward the camera
        if (flatMode) {
            mesh.rotation.x = -Math.PI / 2
        }

        meshRef.current = mesh
        scene.add(mesh)

        // ResizeObserver for responsive scaling
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

        // Momentum physics with delta-time smoothing
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
                // Lerp velocity for smoother drag response
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

        const spinSpeed = 0.025

        let tabHidden = document.hidden
        const onVisibilityChange = () => { tabHidden = document.hidden }
        document.addEventListener('visibilitychange', onVisibilityChange)

        const animate = () => {
            frameRef.current = requestAnimationFrame(animate)
            if (tabHidden) return

            const now = performance.now()
            const dt = Math.min((now - lastTime) / 16.667, 3) // normalize to ~60fps, cap at 3x
            lastTime = now

            if (flatMode) {
                // Calculate target speed based on playing state and playback rate
                // Use power of 1.5 to amplify the effect of pitch changes
                const amplifiedRate = Math.pow(playbackRateRef.current, 1.5)
                const targetSpeed = isPlayingRef.current ? spinSpeed * amplifiedRate : 0

                // Smooth acceleration/deceleration
                const lerpFactor = isPlayingRef.current ? 0.08 : 0.03
                currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * lerpFactor * dt

                if (Math.abs(currentSpeedRef.current) > 0.0001) {
                    // Rotate on Z axis since the cube is tilted (rotation.x = -PI/2)
                    mesh.rotation.z += currentSpeedRef.current * dt
                }
            } else {
                if (resetting) {
                    const slerpAlpha = 1 - Math.pow(1 - 0.08, dt)
                    mesh.quaternion.slerp(identityQuat, slerpAlpha)
                    if (mesh.quaternion.angleTo(identityQuat) < 0.005) {
                        mesh.quaternion.identity()
                        resetting = false
                    }
                } else {
                    mesh.rotateOnWorldAxis(worldY, velocityY * dt)
                    mesh.rotateOnWorldAxis(worldX, velocityX * dt)
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
            geometry.dispose()
            frontMaterial.dispose()
            sideMaterial.dispose()
            backMaterial.dispose()
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement)
            }
        }
    }, [])

    // Update front texture when src changes
    useEffect(() => {
        const material = materialRef.current
        if (!material) return

        let cancelled = false

        if (material.map) {
            material.map.dispose()
            material.map = null
        }

        if (src) {
            new THREE.TextureLoader().load(src, (texture) => {
                if (cancelled) { texture.dispose(); return }
                texture.colorSpace = THREE.SRGBColorSpace
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

    // Update back face with artist + album
    useEffect(() => {
        const material = backMaterialRef.current
        if (!material) return

        if (material.map) {
            material.map.dispose()
            material.map = null
        }

        if (artist) {
            const texture = createBackTexture(artist, album, color || '#222222')
            material.map = texture
            material.color.set(0xffffff)
            material.needsUpdate = true
        } else {
            material.color.set(0x222222)
            material.needsUpdate = true
        }
        material.needsUpdate = true
    }, [artist, album, color])

    // Update side and back colors when prop changes
    useEffect(() => {
        const sideMat = sideMaterialRef.current
        const backMat = backMaterialRef.current

        if (sideMat && color) {
            sideMat.color.set(color)
        }

        if (backMat && !backMat.map && color) {
            backMat.color.set(color)
        }
    }, [color])

    return <div ref={mountRef} className={className} />
}
