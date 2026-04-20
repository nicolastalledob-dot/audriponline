import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
    define: {
        global: 'globalThis',
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                // Take over open clients immediately and skip the "waiting"
                // step so a new SW activates on the next page load instead
                // of needing the user to fully close + reopen the PWA. iOS
                // Safari is unforgiving about updates without this.
                clientsClaim: true,
                skipWaiting: true,
                cleanupOutdatedCaches: true,
                // Always go to the network for navigations so the user
                // sees the latest HTML (which references the latest
                // hashed JS/CSS). Cached HTML pinning to old assets is
                // the #1 reason "my CSS changes didn't show up".
                navigateFallback: null,
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'audio-cache',
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            },
            manifest: {
                name: 'AudRip Online',
                short_name: 'AudRip',
                description: 'Stream your music library from the cloud',
                theme_color: '#000000',
                background_color: '#000000',
                display: 'standalone',
                orientation: 'portrait',
                icons: [
                    {
                        src: '/icons/icon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/icons/icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    server: {
        proxy: {
            '/api/auth': {
                target: 'http://100.105.130.114:9999',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api\/auth/, ''),
            },
            '/api/db': {
                target: 'http://100.105.130.114:3000',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api\/db/, ''),
            },
            '/api/audio': {
                target: 'http://100.105.130.114:4000',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api\/audio/, ''),
            },
        },
    },
})
