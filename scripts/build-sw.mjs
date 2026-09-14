// Generate service worker (dist/client/sw.js) untuk app SSR (TanStack Start).
// Plugin vite-plugin-pwa hanya mengemit manifest + registerSW saat vite build;
// sw.js-nya dibangun sini dengan workbox-build.injectManifest.

import { injectManifest } from 'workbox-build'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const result = await injectManifest({
  swSrc: resolve(root, 'scripts/sw-src.js'),
  swDest: resolve(root, 'dist/client/sw.js'),
  globDirectory: resolve(root, 'dist/client'),
  globPatterns: ['**/*.{js,css,woff2,png,svg,ico,webmanifest}'],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  // Navigasi ditangani NetworkOnly di dalam sw-src.js — tidak pakai fallback SPA.
  // skipWaiting/clientsClaim sudah ditulis langsung di sw-src.js.
}).catch((err) => {
  console.error('Gagal membangun service worker:', err)
  process.exit(1)
})

console.log(
  `service worker selesai: ${result.count} assets di-precache (${(
    result.size / 1024
  ).toFixed(1)} kB)`,
)
