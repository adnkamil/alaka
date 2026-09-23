/**
 * Aturan langganan Jastip: TRIAL 30 hari sejak user dibuat, lalu FREE (fitur
 * dasar), dan PRO (semua fitur) yang diaktifkan lewat verifikasi pembayaran
 * manual oleh admin.
 *
 * Modul ini SENGAJA murni — tidak meng-import `db`, `pg`, atau apa pun dari
 * server — supaya bisa dipakai bareng server function & komponen client, dan
 * jadi SATU-SATUNYA sumber kebenaran soal durasi & cara menghitung status.
 *
 * Status TIDAK diambil dari kolom tunggal seperti `users.is_pro` (kolom itu
 * memang tidak ada), tapi dihitung dari:
 *   1. `users.trial_started_at` + `users.trial_ends_at` -> masa trial.
 *   2. tabel `subscriptions` (histori) -> baris `active` yang `ends_at`-nya
 *      belum lewat = PRO.
 * Dengan begitu histori pembayaran dan status yang ditampilkan selalu sinkron.
 */

/** Lama trial (hari) sejak user dibuat. WAJIB sama dengan DEFAULT kolom di DB. */
export const TRIAL_DAYS = 30

/** Kode paket PRO, disimpan di `subscriptions.plan_code`. */
export const PRO_PLAN_CODE = 'pro'

/** Durasi PRO per pembelian (hari) — dipakai sebagai nilai awal/normal. */
export const PRO_DURATION_DAYS = 30

/**
 * Daftar fitur yang cuma terbuka waktu TRIAL atau PRO. Dipakai bareng oleh
 * server (buat nutup endpoint) dan client (buat nampilin status terkunci),
 * jadi string-nya harus sama persis di dua sisi.
 */
export type ProFeature =
  | 'billing'
  | 'payment_methods'
  | 'order_suggestions'
  | 'fee_suggestions'
  | 'customer_suggestions'

export const PRO_FEATURES: Array<ProFeature> = [
  'billing',
  'payment_methods',
  'order_suggestions',
  'fee_suggestions',
  'customer_suggestions',
]

/** Label & keterangan tiap fitur PRO — dipakai di pesan error dan UI terkunci. */
export const PRO_FEATURE_INFO: Record<
  ProFeature,
  { label: string; description: string }
> = {
  billing: {
    label: 'Tagih',
    description:
      'Halaman tagih + kirim invoice ke WhatsApp pelanggan, termasuk link tagihan publik.',
  },
  payment_methods: {
    label: 'Metode Pembayaran',
    description:
      'Tambah, ubah, aktif/nonaktifkan metode pembayaran (bank, e-wallet, QRIS).',
  },
  order_suggestions: {
    label: 'Saran Pesanan',
    description:
      'Saran nama barang & harga asli saat menambah pesanan, diambil dari riwayat event.',
  },
  fee_suggestions: {
    label: 'Saran Fee',
    description:
      'Saran tier aturan fee yang dihitung dari harga & fee barang yang pernah kamu catat.',
  },
  customer_suggestions: {
    label: 'Saran Pelanggan',
    description:
      'Saran nama & no. HP pelanggan dari data customer tersimpan, saat menambah pesanan.',
  },
}

export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'rejected'

export type PlanKey = 'trial' | 'free' | 'pro'

/**
 * Label & keterangan tiap plan buat ditampilkan di UI (Profil, halaman paket,
 * dialog terkunci). Cuma teks — penentuan plan tetap di `resolveEntitlement()`.
 */
export const PLAN_INFO: Record<
  PlanKey,
  { label: string; description: string }
> = {
  trial: {
    label: 'Trial',
    description: 'Semua fitur terbuka selama masa trial.',
  },
  free: {
    label: 'FREE',
    description: 'Hanya fitur dasar yang aktif, fitur PRO terkunci.',
  },
  pro: {
    label: 'PRO',
    description: 'Semua fitur terbuka.',
  },
}

/** Label plan buat UI, mis. `Trial`, `FREE`, `PRO`. */
export function planLabel(plan: PlanKey) {
  return PLAN_INFO[plan].label
}

/** Bagian baris `subscriptions` yang dibutuhkan buat hitung akses. */
export interface SubscriptionWindow {
  status: SubscriptionStatus
  startedAt: Date | null
  endsAt: Date | null
}

/** Peta fitur PRO: true = sedang terbuka untuk user tsb. */
export type FeatureAccess = Record<ProFeature, boolean>

export interface Entitlement {
  plan: PlanKey
  isTrial: boolean
  isPro: boolean
  /** Akhir masa PRO (dari subscription aktif). `null` kalau tidak sedang PRO. */
  proUntil: Date | null
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  /** Sisa hari trial (0 kalau trial sudah lewat / belum pernah mulai). */
  trialDaysLeft: number
  /** Fitur PRO yang sedang bisa dipakai (TRIAL & PRO = semua true). */
  features: FeatureAccess
}

const DAY_MS = 24 * 60 * 60 * 1000

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS)
}

/**
 * Baris subscription dianggap aktif kalau statusnya `active` DAN masa
 * berlakunya belum lewat. Jadi `status = 'active'` dengan `ends_at` yang sudah
 * lewat otomatis dianggap expired tanpa perlu cron yang mengubah statusnya.
 */
export function isSubscriptionActive(
  sub: SubscriptionWindow,
  now: Date = new Date(),
) {
  return (
    sub.status === 'active' &&
    sub.endsAt !== null &&
    sub.endsAt.getTime() > now.getTime()
  )
}

/**
 * Ambil subscription aktif dengan masa berlaku paling panjang. Bentuk array
 * (bukan satu baris) supaya kalaupun ada lebih dari satu baris aktif — mis.
 * perpanjangan bertingkat — akses yang dipakai yang paling jauh.
 */
export function findActiveWindow(
  windows: Array<SubscriptionWindow>,
  now: Date = new Date(),
): SubscriptionWindow | null {
  let best: SubscriptionWindow | null = null
  for (const window of windows) {
    if (!isSubscriptionActive(window, now)) continue
    const endsAt = window.endsAt?.getTime() ?? 0
    const bestEndsAt = best?.endsAt?.getTime() ?? 0
    if (!best || endsAt > bestEndsAt) best = window
  }
  return best
}

/**
 * Rentang PRO yang baru saat pembayaran diverifikasi admin. Kalau user masih
 * PRO, sisa masanya DILANJUTKAN (bukan di-reset dari nol) — beli 2x = 60 hari.
 */
export function computeProWindow(input: {
  currentEndsAt?: Date | null
  durationDays?: number
  now?: Date
}) {
  const now = input.now ?? new Date()
  const durationDays = input.durationDays ?? PRO_DURATION_DAYS
  const currentEndsAt = input.currentEndsAt ?? null
  const startedAt =
    currentEndsAt && currentEndsAt.getTime() > now.getTime()
      ? currentEndsAt
      : now
  return { startedAt, endsAt: addDays(startedAt, durationDays) }
}

/**
 * Hitung status akses user dari masa trial + histori subscription.
 * Urutan prioritas: PRO aktif > TRIAL belum habis > FREE.
 */
export function resolveEntitlement(
  input: {
    trialStartedAt?: Date | null
    trialEndsAt?: Date | null
    subscriptions?: Array<SubscriptionWindow>
  },
  now: Date = new Date(),
): Entitlement {
  const active = findActiveWindow(input.subscriptions ?? [], now)
  const isPro = active !== null
  const trialStartedAt = input.trialStartedAt ?? null
  const trialEndsAt = input.trialEndsAt ?? null

  const trialRemainingMs = trialEndsAt
    ? trialEndsAt.getTime() - now.getTime()
    : 0
  const isTrial = !isPro && trialRemainingMs > 0
  const plan: PlanKey = isPro ? 'pro' : isTrial ? 'trial' : 'free'

  return {
    plan,
    isTrial,
    isPro,
    proUntil: active?.endsAt ?? null,
    trialStartedAt,
    trialEndsAt,
    trialDaysLeft: isTrial ? Math.ceil(trialRemainingMs / DAY_MS) : 0,
    features: featuresForPlan(plan),
  }
}

/**
 * TRIAL & PRO = semua fitur terbuka; FREE = fitur PRO terkunci.
 * Ini SATU-SATUNYA tempat aturan tersebut ditulis — kode lain (server maupun
 * komponen) cuma membaca hasilnya, nggak lagi mengecek `isPro` sendiri-sendiri.
 */
export function featuresForPlan(plan: PlanKey): FeatureAccess {
  const unlocked = plan !== 'free'
  // Dirakit dari PRO_FEATURES supaya nambah fitur baru cukup di satu tempat.
  const entries = PRO_FEATURES.map((feature) => [feature, unlocked])
  return Object.fromEntries(entries) as FeatureAccess
}

/** Cek satu fitur PRO dari entitlement hasil `getUserEntitlements()`. */
export function canUseFeature(
  entitlement: Entitlement,
  feature: ProFeature,
): boolean {
  return entitlement.features[feature]
}

/** Pesan seragam waktu fitur PRO dipakai tanpa hak akses (server & client). */
export function featureLockedMessage(feature: ProFeature): string {
  return `Fitur "${PRO_FEATURE_INFO[feature].label}" hanya tersedia di paket PRO. Upgrade ke PRO untuk membukanya.`
}

/** TRIAL & PRO sama-sama membuka semua fitur; FREE cuma fitur dasar. */
export function hasFullAccess(entitlement: Entitlement) {
  return entitlement.plan !== 'free'
}

/**
 * Apakah user punya akses penuh PADA WAKTU tertentu. Dipakai buat aturan
 * grandfathering: data yang dibuat saat aksesnya masih terbuka (mis. pesanan
 * yang invoice link-nya sudah terlanjur dikirim ke pelanggan) tetap bisa dibuka
 * walau sekarang user sudah FREE.
 */
export function hadFullAccessAt(
  input: {
    trialStartedAt?: Date | null
    trialEndsAt?: Date | null
    subscriptions?: Array<SubscriptionWindow>
  },
  at: Date,
) {
  return hasFullAccess(resolveEntitlement(input, at))
}

/**
 * Rentang PRO untuk pembelian/perpanjangan berikutnya, dihitung dari histori
 * langganan user (dipakai saat admin memverifikasi pembayaran).
 */
export function nextProWindow(
  windows: Array<SubscriptionWindow>,
  durationDays: number = PRO_DURATION_DAYS,
  now: Date = new Date(),
) {
  const active = findActiveWindow(windows, now)
  return computeProWindow({
    currentEndsAt: active?.endsAt ?? null,
    durationDays,
    now,
  })
}