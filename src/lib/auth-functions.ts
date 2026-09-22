import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/schema'
import {
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  revokeAllSessions,
  verifyPassword,
} from './auth'
import { getUserEntitlements } from './entitlements'

const registerSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  brandName: z.string().optional(),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

export const registerUser = createServerFn({ method: 'POST' })
  .validator(registerSchema)
  .handler(async ({ data }) => {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    })
    if (existing) {
      throw new Error('Email sudah terdaftar')
    }

    const passwordHash = await hashPassword(data.password)
    const [user] = await db
      .insert(users)
      .values({
        name: data.name,
        brandName: data.brandName || null,
        email: data.email,
        passwordHash,
      })
      .returning()

    await createSession(user.id)
    return { id: user.id, name: user.name, email: user.email }
  })

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

export const loginUser = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    })
    if (!user || !user.passwordHash) {
      throw new Error('Email atau password salah')
    }

    const valid = await verifyPassword(data.password, user.passwordHash)
    if (!valid) {
      throw new Error('Email atau password salah')
    }

    await createSession(user.id)
    return { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin }
  })

export const logoutUser = createServerFn({ method: 'POST' }).handler(
  async () => {
    await destroySession()
  },
)

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  brandName: z.string().optional(),
})

export const updateProfile = createServerFn({ method: 'POST' })
  .validator(updateProfileSchema)
  .handler(async ({ data }) => {
    const current = await getSessionUser()
    if (!current) throw new Error('Belum login')

    await db
      .update(users)
      .set({
        name: data.name,
        brandName: data.brandName?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, current.id))
  })

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi lama wajib diisi'),
  newPassword: z.string().min(8, 'Password minimal 8 karakter'),
})

export const changePassword = createServerFn({ method: 'POST' })
  .validator(changePasswordSchema)
  .handler(async ({ data }) => {
    const current = await getSessionUser()
    if (!current) throw new Error('Belum login')

    // Akun yang daftar lewat Google belum punya kata sandi — jalur gantinya
    // lewat pengaturan Google, bukan di sini.
    if (!current.passwordHash) {
      throw new Error(
        'Akun ini masuk lewat Google. Kata sandi diatur dari pengaturan akun Google kamu.',
      )
    }

    const valid = await verifyPassword(
      data.currentPassword,
      current.passwordHash,
    )
    if (!valid) throw new Error('Kata sandi lama salah')

    const passwordHash = await hashPassword(data.newPassword)
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, current.id))

    // Rotasi session: device lain yang masih login otomatis ter-logout,
    // sementara device ini dapat sesi baru supaya nggak ikut keluar.
    await revokeAllSessions(current.id)
    await createSession(current.id)
  })

export const fetchCurrentUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await getSessionUser()
    if (!user) return null

    // Status akses (TRIAL/FREE/PRO + fitur PRO yang terbuka) ikut dikirim, supaya
    // komponen punya SATU sumber dan nggak menghitung `isPro` sendiri-sendiri.
    // Pengecekan yang mengikat tetap di server (`src/lib/entitlements.ts`).
    const entitlements = await getUserEntitlements(user)

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      brandName: user.brandName,
      waMessageTemplate: user.waMessageTemplate,
      // Dipakai di halaman Profil: akun Google-only belum punya kata sandi,
      // jadi menu "Ubah Kata Sandi" ditampilkan sebagai info, bukan aksi.
      hasPassword: Boolean(user.passwordHash),
      // Cuma buat nampilin/nyembunyiin menu & nge-redirect di client (UX).
      // Proteksi yang beneran ada di server — lihat `requireAdminUser()`.
      isAdmin: user.isAdmin,
      entitlements,
    }
  },
)
