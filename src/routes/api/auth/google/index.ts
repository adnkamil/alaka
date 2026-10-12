import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { buildGoogleAuthUrl } from '../../../../lib/google-auth'

const STATE_COOKIE = 'google_oauth_state'
const INVITE_COOKIE = 'team_invite_token'
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const Route = createFileRoute('/api/auth/google/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin
        const redirectUri = `${origin}/api/auth/google/callback`
        const state = randomUUID()

        const isProd = process.env.NODE_ENV === 'production'
        const stateCookie = `${STATE_COOKIE}=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`

        // Masuk lewat tautan undangan admin brand: token dibawa ke callback
        // lewat cookie HttpOnly (bukan lewat URL Google). Format dicek dulu.
        const invite = new URL(request.url).searchParams.get('invite')
        const inviteCookie =
          invite && INVITE_TOKEN_PATTERN.test(invite)
            ? `${INVITE_COOKIE}=${invite}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`
            : `${INVITE_COOKIE}=; Path=/; Max-Age=0`

        try {
          const authUrl = buildGoogleAuthUrl({ redirectUri, state })
          const headers = new Headers({ Location: authUrl })
          headers.append('Set-Cookie', stateCookie)
          headers.append('Set-Cookie', inviteCookie)
          return new Response(null, { status: 302, headers })
        } catch (err) {
          console.error('Gagal bikin URL Google OAuth:', err)
          return new Response(null, {
            status: 302,
            headers: { Location: `${origin}/login?error=google_config` },
          })
        }
      },
    },
  },
})
