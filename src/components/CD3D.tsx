import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface CD3DProps {
    src: string | null
    artist?: string
    album?: string
    color?: string
    className?: string
    isPlaying?: boolean
    flatMode?: boolean
    playbackRate?: number
}

function createEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
    const size = 256
    const rt = new THREE.WebGLCubeRenderTarget(size)
    const cubeCamera = new THREE.CubeCamera(0.1, 10, rt)

    const envScene = new THREE.Scene()

    const gradCanvas = document.createElement('canvas')
    gradCanvas.width = 512
    gradCanvas.height = 256
    const gctx = gradCanvas.getContext('2d')!

    // Dark base with color variation
    const grad = gctx.createLinearGradient(0, 0, 512, 256)
    grad.addColorStop(0, '#0e0e1a')
    grad.addColorStop(0.15, '#1a1030')
    grad.addColorStop(0.3, '#102030')
    grad.addColorStop(0.5, '#0e0e1a')
    grad.addColorStop(0.7, '#301020')
    grad.addColorStop(0.85, '#103020')
    grad.addColorStop(1, '#0e0e1a')
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, 512, 256)

    // Bright key light reflection (main)
    gctx.globalAlpha = 1.0
    const radGrad1 = gctx.createRadialGradient(360, 70, 0, 360, 70, 100)
    radGrad1.addColorStop(0, '#ffffff')
    radGrad1.addColorStop(0.15, '#eef4ff')
    radGrad1.addColorStop(0.4, '#8899cc')
    radGrad1.addColorStop(1, 'transparent')
    gctx.fillStyle = radGrad1
    gctx.fillRect(0, 0, 512, 256)

    // Secondary warm fill
    const radGrad2 = gctx.createRadialGradient(130, 170, 0, 130, 170, 80)
    radGrad2.addColorStop(0, '#fffaf0')
    radGrad2.addColorStop(0.2, '#ffddaa')
    radGrad2.addColorStop(0.5, '#886644')
    radGrad2.addColorStop(1, 'transparent')
    gctx.fillStyle = radGrad2
    gctx.fillRect(0, 0, 512, 256)

    // Top highlight
    const radGrad3 = gctx.createRadialGradient(256, 20, 0, 256, 20, 120)
    radGrad3.addColorStop(0, '#ddeeff')
    radGrad3.addColorStop(0.3, '#556688')
    radGrad3.addColorStop(1, 'transparent')
    gctx.fillStyle = radGrad3
    gctx.fillRect(0, 0, 512, 256)

    gctx.globalAlpha = 1

    const envTexture = new THREE.CanvasTexture(gradCanvas)
    envTexture.mapping = THREE.EquirectangularReflectionMapping
    envTexture.colorSpace = THREE.SRGBColorSpace

    const envSphere = new THREE.Mesh(
        new THREE.SphereGeometry(5, 32, 16),
        new THREE.MeshBasicMaterial({ map: envTexture, side: THREE.BackSide })
    )
    envScene.add(envSphere)

    cubeCamera.update(renderer, envScene)

    envSphere.geometry.dispose()
        ; (envSphere.material as THREE.MeshBasicMaterial).dispose()
    envTexture.dispose()

    return rt.texture
}

function createDataSideTexture(): THREE.CanvasTexture {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Bright silver base
    ctx.fillStyle = '#e8e8ec'
    ctx.fillRect(0, 0, size, size)

    const cx = size / 2
    const cy = size / 2
    const holeRadius = size * 0.065
    const innerDataRadius = size * 0.08
    const outerDataRadius = size * 0.48

    // Fine concentric data tracks
    for (let r = innerDataRadius; r <= outerDataRadius; r += 1.5) {
        const phase = Math.sin(r * 0.3)
        ctx.strokeStyle = phase > 0
            ? 'rgba(255, 255, 255, 0.05)'
            : 'rgba(0, 0, 0, 0.04)'
        ctx.lineWidth = 0.4
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
    }

    // Very subtle radial streaks
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 150) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'
        ctx.lineWidth = 0.3
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * innerDataRadius, cy + Math.sin(angle) * innerDataRadius)
        ctx.lineTo(cx + Math.cos(angle) * outerDataRadius, cy + Math.sin(angle) * outerDataRadius)
        ctx.stroke()
    }

    // Transparent center hole
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    // Silver ring around the hole edge
    ctx.strokeStyle = 'rgba(180, 180, 190, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, holeRadius + 1, 0, Math.PI * 2)
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
        const holeRadius = size * 0.065

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            // Clip to disc circle
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.clip()

            const aspect = img.width / img.height
            let drawW = size, drawH = size
            if (aspect > 1) { drawW = size * aspect } else { drawH = size / aspect }
            const dx = (size - drawW) / 2
            const dy = (size - drawH) / 2
            ctx.drawImage(img, dx, dy, drawW, drawH)

            // Silver outer edge ring
            ctx.globalCompositeOperation = 'source-over'
            ctx.strokeStyle = 'rgba(200, 200, 210, 0.3)'
            ctx.lineWidth = 5
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2)
            ctx.stroke()

            // Transparent center hole
            ctx.globalCompositeOperation = 'destination-out'
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, holeRadius, 0, Math.PI * 2)
            ctx.fill()
            ctx.globalCompositeOperation = 'source-over'

            // Silver ring around hole
            ctx.strokeStyle = 'rgba(200, 200, 210, 0.5)'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, holeRadius + 1, 0, Math.PI * 2)
            ctx.stroke()

            const texture = new THREE.CanvasTexture(canvas)
            texture.colorSpace = THREE.SRGBColorSpace
            resolve(texture)
        }
        img.onerror = () => {
            ctx.fillStyle = '#cccccc'
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
            ctx.fill()
            // Still punch the hole
            ctx.globalCompositeOperation = 'destination-out'
            ctx.beginPath()
            ctx.arc(size / 2, size / 2, holeRadius, 0, Math.PI * 2)
            ctx.fill()
            const texture = new THREE.CanvasTexture(canvas)
            texture.colorSpace = THREE.SRGBColorSpace
            resolve(texture)
        }
        img.src = imgSrc
    })
}

export default function CD3D({ src, className = 'cover-art-3d', isPlaying, flatMode = false, playbackRate = 1 }: CD3DProps) {
    const mountRef = useRef<HTMLDivElement>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const frameRef = useRef<number>(0)
    const groupRef = useRef<THREE.Group | null>(null)
    const labelMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null)
    const isPlayingRef = useRef(isPlaying)
    const playbackRateRef = useRef(playbackRate)
    const currentSpeedRef = useRef(0)

    useEffect(() => {
        isPlayingRef.current = isPlaying
    }, [isPlaying])

    useEffect(() => {
        playbackRateRef.current = playbackRate
    }, [playbackRate])

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
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.3
        mount.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Lighting — multiple angles for dynamic reflections
        const ambient = new THREE.AmbientLight(0xffffff, 1.0)
        scene.add(ambient)

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
        keyLight.position.set(2, 3, 4)
        scene.add(keyLight)

        const fillLight = new THREE.DirectionalLight(0xccddff, 0.8)
        fillLight.position.set(-3, 1, 3)
        scene.add(fillLight)

        const rimLight = new THREE.DirectionalLight(0xffeedd, 0.6)
        rimLight.position.set(1, -2, 3)
        scene.add(rimLight)

        const topLight = new THREE.PointLight(0xffffff, 1.0, 10)
        topLight.position.set(0, 4, 2)
        scene.add(topLight)

        const backLight = new THREE.DirectionalLight(0xddeeff, 0.3)
        backLight.position.set(0, 0, -3)
        scene.add(backLight)

        const disposables: THREE.BufferGeometry[] = []
        const matDisposables: THREE.Material[] = []
        const texDisposables: THREE.Texture[] = []

        // Environment map for reflections
        const envMap = createEnvMap(renderer)
        texDisposables.push(envMap)

        const group = new THREE.Group()
        if (!flatMode) {
            group.rotation.x = 1.25
        }

        // --- Build CD from separate pieces for hollow center ---

        const discThickness = 0.012
        const outerRadius = 0.85
        const holeRadius = 0.055

        // Front face (label side) — CircleGeometry
        const frontGeometry = new THREE.CircleGeometry(outerRadius, 32)
        disposables.push(frontGeometry)
        const labelMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xcccccc,
            metalness: 0.15,
            roughness: 0.45,
            clearcoat: 0.7,
            clearcoatRoughness: 0.12,
            transparent: true,
            alphaTest: 0.5
        })
        labelMaterialRef.current = labelMaterial
        matDisposables.push(labelMaterial)
        const frontFace = new THREE.Mesh(frontGeometry, labelMaterial)
        frontFace.position.y = discThickness / 2
        frontFace.rotation.x = -Math.PI / 2
        group.add(frontFace)

        // Back face (data/reflective side) — CircleGeometry
        const backGeometry = new THREE.CircleGeometry(outerRadius, 32)
        disposables.push(backGeometry)
        const dataTexture = createDataSideTexture()
        texDisposables.push(dataTexture)
        const dataMaterial = new THREE.MeshPhysicalMaterial({
            map: dataTexture,
            color: 0xffffff,
            metalness: 1.0,
            roughness: 0.05,
            envMap,
            envMapIntensity: 2.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02,
            iridescence: 1.0,
            iridescenceIOR: 2.3,
            iridescenceThicknessRange: [100, 900],
            reflectivity: 1.0,
            transparent: true,
            alphaTest: 0.5
        })
        matDisposables.push(dataMaterial)
        const backFace = new THREE.Mesh(backGeometry, dataMaterial)
        backFace.position.y = -discThickness / 2
        backFace.rotation.x = Math.PI / 2
        group.add(backFace)

        // Outer edge wall (open cylinder)
        const outerEdgeGeometry = new THREE.CylinderGeometry(outerRadius, outerRadius, discThickness, 32, 1, true)
        disposables.push(outerEdgeGeometry)
        const edgeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xe8e8ec,
            metalness: 1.0,
            roughness: 0.05,
            envMap,
            envMapIntensity: 1.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        })
        matDisposables.push(edgeMaterial)
        const outerEdge = new THREE.Mesh(outerEdgeGeometry, edgeMaterial)
        group.add(outerEdge)

        // Inner hole wall (open cylinder, normals face inward)
        const innerEdgeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, discThickness, 16, 1, true)
        disposables.push(innerEdgeGeometry)
        const innerEdgeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xd0d0d4,
            metalness: 0.9,
            roughness: 0.1,
            envMap,
            envMapIntensity: 0.6,
            side: THREE.BackSide
        })
        matDisposables.push(innerEdgeMaterial)
        const innerEdge = new THREE.Mesh(innerEdgeGeometry, innerEdgeMaterial)
        group.add(innerEdge)

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

        // Momentum physics
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

        const baseSpeed = flatMode ? 0.025 : 0.015

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

                // Smooth acceleration/deceleration
                const lerpFactor = isPlayingRef.current ? 0.08 : 0.03
                currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * lerpFactor * dt

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
                    if (isPlayingRef.current) {
                        group.rotateOnWorldAxis(worldY, baseSpeed * dt)
                    }

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
            disposables.forEach(g => g.dispose())
            matDisposables.forEach(m => m.dispose())
            texDisposables.forEach(t => t.dispose())
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement)
            }
        }
    }, [])

    // Update label texture when src changes
    useEffect(() => {
        const material = labelMaterialRef.current
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
            material.color.set(0xcccccc)
            material.needsUpdate = true
        }

        return () => { cancelled = true }
    }, [src])

    return <div ref={mountRef} className={className} />
}
