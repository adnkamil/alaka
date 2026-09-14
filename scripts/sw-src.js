// Service worker Jastip (source untuk workbox-build injectManifest).
//
// Aplikasi ini memakai SSR (TanStack Start) → plugin vite-plugin-pwa nggak bisa
// generate sw.js sendiri saat `vite build` (cuma manifest + registerSW yang
// di-emit). Karena itu SW dibangun terpisah via scripts/build-sw.mjs.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

// Auto-update: langsung aktifkan SW baru begitu install selesai.
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SSR → navigasi halaman selalu ambil dari network (server). Aset statis
// (js/css/ikon/font) tetap di-precache buat dukung offline & install PWA.
registerRoute(({ request }) => request.mode === 'navigate', new NetworkOnly())
