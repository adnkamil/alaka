import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'
import { DEFAULT_THEME_MODE, buildThemeInitScript } from '../lib/theme'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

// Default tema = terang (auto gelap mati) — lihat src/lib/theme.ts.
const THEME_INIT_SCRIPT = buildThemeInitScript(DEFAULT_THEME_MODE)

// SW harus didaftarkan manual karena app ini SSR. Di dev, vite-plugin-pwa
// menyediakan SW dev di /dev-sw.js?dev-sw; di produksi sw.js dibangun oleh
// scripts/build-sw.mjs.
const PWA_SW_URL = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js'
const PWA_REGISTER_SCRIPT = `(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${PWA_SW_URL}',{scope:'/'}).catch(function(){})})}})();`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Alaka',
      },
      {
        name: 'description',
        content: 'Alaka — aplikasi manajemen jastip (titip beli)',
      },
      {
        name: 'theme-color',
        content: '#b6584b',
      },
      {
        name: 'mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'black-translucent',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'Alaka',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'manifest',
        href: '/manifest.webmanifest',
      },
      {
        rel: 'icon',
        type: 'image/png',
        href: '/pwa-192x192.png',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[var(--brand-accent-soft)]">
        {children}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <script dangerouslySetInnerHTML={{ __html: PWA_REGISTER_SCRIPT }} />
        <Scripts />
      </body>
    </html>
  )
}
