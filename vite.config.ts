import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.app',
      '.ngrok.io',
    ],
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Jastip',
        short_name: 'Jastip',
        description: 'Aplikasi manajemen jastip (titip beli)',
        lang: 'id',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // CATATAN: app ini pakai SSR (TanStack Start), jadi sw.js TIDAK bisa
      // digenerate oleh plugin saat `vite build`. sw.js dibangun terpisah
      // setelah build via `scripts/build-sw.mjs` (lihat script "build").
      //
      // devOptions.enabled => di mode `pnpm dev`, plugin serve
      // `/manifest.webmanifest` + SW dev (`dev-sw.js?dev-sw`) supaya fitur
      // install bisa dicoba langsung dari localhost tanpa deploy.
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})

export default config
