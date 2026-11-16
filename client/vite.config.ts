import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildVersion = Date.now().toString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'version-stamp',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({
            version: buildVersion,
            builtAt: new Date().toISOString(),
          }),
        })
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: [
        'favicon.ico',
        'favicon-v4.png',
        'apple-touch-icon-v4.png',
        'pwa-192x192-v4.png',
        'pwa-512x512-v4.png',
        'maskable-icon-512x512-v4.png'
      ],
      manifest: {
        id: '/',
        start_url: '/',
        scope: '/',
        name: 'Mobil Plasiyer',
        short_name: 'Plasiyer',
        description: 'POLATLAR YAZILIM Entegre Mobil Saha Satış ve B2B Portalı',
        theme_color: '#071330',
        background_color: '#071330',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['business', 'productivity', 'finance'],
        icons: [
          {
            src: '/pwa-192x192-v4.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512-v4.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/maskable-icon-512x512-v4.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,webp,svg,webmanifest}'],
        globIgnores: ['**/yenile.html', '**/version.json'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'plasiyer-pages-cache',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
