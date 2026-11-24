import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Calculator,
  CalendarDays,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  MessageCircle,
  ShoppingBag,
  Store,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatRupiah } from '../lib/partner-product-rules'
import { FREE_FEATURES, PRO_FEATURES_LIST } from '../lib/plan-features'
import { discountPercent } from '../lib/price-discount'
import { publicPricingQuery } from '../lib/queries'
import { PRO_DURATION_DAYS, TRIAL_DAYS } from '../lib/subscription'

/**
 * Landing page publik di `/` untuk pengunjung yang belum login (lihat
 * `shouldShowLanding` di `lib/landing.ts`). Dibuka dari ikon PWA tidak pernah
 * sampai sini, langsung ke `/login`. Panduan visual: `design.md`.
 *
 * Design Read: landing produk fintech hangat untuk jastiper kecil yang bekerja
 * dari HP. Dial ENERGY 2 / RHYTHM 3 / MOTION 1.
 *
 * Motif identitas: kapsul (pil panjang) dan transisi miring. Aksen: coral,
 * hanya untuk aksi dan satu frasa kunci di H1. Band gelap hanya dua (partner
 * dan footer). Semua warna lewat token (`--app-*`, `--landing-*`) sehingga
 * mode gelap ikut. Mockup dibangun dari HTML dan datanya contoh (diberi
 * keterangan di halaman), bukan data pengguna.
 *
 * Ikon lucide-react dipakai karena sama dengan ikon di aplikasi; tiap ikon
 * dipilih sesuai isi kartunya.
 */

const NAV_LINKS = [
  { href: '#fitur', label: 'Fitur' },
  { href: '#cara-kerja', label: 'Cara kerja' },
  { href: '#harga', label: 'Harga' },
  { href: '#partner', label: 'Partner' },
]

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  /** Fitur inti (alur catat lalu tagih): kartu lebih besar. */
  core?: boolean
}

const FEATURES: Array<Feature> = [
  {
    icon: ShoppingBag,
    title: 'Pesanan per event',
    body: 'Catat titipan tiap pelanggan per event belanja. Satu pelanggan, satu tagihan, dan barang tambahan otomatis digabung.',
    core: true,
  },
  {
    icon: MessageCircle,
    title: 'Tagih lewat WhatsApp',
    body: 'Template chat berisi daftar barang, total, dan rekening. Tinggal kirim.',
    core: true,
  },
  {
    icon: Calculator,
    title: 'Fee jastip otomatis',
    body: 'Atur tier fee sekali, lalu fee terisi sesuai harga barang.',
  },
  {
    icon: Wallet,
    title: 'Keuangan rapi',
    body: 'Uang masuk dan tagihan yang belum lunas terlihat tanpa hitung manual.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Import & export Excel',
    body: 'Pindahkan rekap lama dari spreadsheet, atau unduh pesanan kapan saja.',
  },
  {
    icon: CalendarDays,
    title: 'Kalender event',
    body: 'Temukan bazar, pameran, dan PO, lalu ikut dengan satu tombol.',
  },
]

const STATS = [
  { value: `${TRIAL_DAYS} hari`, label: 'Trial gratis semua fitur' },
  { value: 'Tanpa batas', label: 'Event dan pesanan' },
  { value: '1 klik', label: 'Kirim tagihan ke WhatsApp' },
  { value: 'Rp0', label: 'Untuk mulai' },
]

const STEPS = [
  {
    title: 'Daftar gratis',
    body: `Buat akun brand kamu, langsung dapat trial ${TRIAL_DAYS} hari.`,
  },
  {
    title: 'Buat event belanja',
    body: 'Isi nama event dan pilih aturan fee yang dipakai.',
  },
  {
    title: 'Catat dan tagih',
    body: 'Masukkan titipan, kirim tagihan, tandai yang sudah bayar.',
  },
]

export default function LandingPage() {
  const { data: pricing } = useSuspenseQuery(publicPricingQuery)
  const proPrice = Number(pricing.proPrice)
  const discount = discountPercent(pricing.originalPrice, pricing.proPrice)

  return (
    <div
      className="lp min-h-screen overflow-x-clip"
      style={{ background: 'var(--app-card)', color: 'var(--app-text)' }}
    >
      <SiteHeader />

      <main>
        {/* ── Hero ───────────────────────────────────────────── */}
        <section className="relative">
          {/* Kapsul dekoratif di belakang mockup. */}
          <div
            aria-hidden
            className="lp-capsule -right-24 top-6 h-32 w-[26rem] rotate-[-28deg] sm:h-40 sm:w-[34rem]"
            style={{ background: 'var(--app-accent-soft)' }}
          />
          <div
            aria-hidden
            className="lp-capsule -left-28 bottom-10 h-20 w-80 rotate-[-28deg]"
            style={{
              background: 'color-mix(in oklab, var(--brand-gold) 16%, transparent)',
            }}
          />
          <div className="relative mx-auto grid max-w-[1100px] items-center gap-14 px-4 pb-24 pt-10 sm:pt-14 lg:grid-cols-2 lg:gap-12 lg:pb-32 lg:pt-20">
            <div>
              <h1 className="mb-5 text-[2rem] font-extrabold leading-[1.2] tracking-[-0.01em] text-balance md:text-[2.5rem]">
                Satu aplikasi untuk semua{' '}
                <span style={{ color: 'var(--app-accent)' }}>
                  titipan pelanggan
                </span>
                .
              </h1>
              <p
                className="mb-8 max-w-lg text-base leading-relaxed"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Kelola event belanja, pesanan, fee jastip, tagihan WhatsApp, dan
                keuangan dari HP, tanpa spreadsheet.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/register"
                  className="lp-btn lp-btn-primary lp-btn-glow"
                >
                  Coba gratis {TRIAL_DAYS} hari
                  <ArrowRight size={18} aria-hidden />
                </Link>
                <a href="#cara-kerja" className="lp-btn lp-btn-outline">
                  Lihat cara kerja
                </a>
              </div>
              <ul
                className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {['Tanpa kartu kredit', 'Bisa dipasang di HP'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={16}
                      aria-hidden
                      style={{ color: 'var(--app-accent)' }}
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <HeroMockup />
              <SampleNote className="mt-10 text-center lg:text-left" />
            </div>
          </div>
        </section>

        {/* ── Strip fakta produk (miring dari hero) ──────────── */}
        <section
          className="lp-slant relative"
          style={
            {
              background: 'var(--app-bg)',
              '--lp-slant-bg': 'var(--app-bg)',
            } as React.CSSProperties
          }
        >
          {/* Kapsul menyeberang batas hero dan strip. */}
          <div
            aria-hidden
            className="lp-capsule left-[8%] top-[-3.25rem] z-10 hidden h-9 w-56 rotate-[-12deg] md:block"
            style={{
              background: 'color-mix(in oklab, var(--app-accent) 26%, transparent)',
            }}
          />
          <dl className="relative mx-auto grid max-w-[1100px] grid-cols-2 gap-y-8 px-4 py-12 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`px-4 text-center ${i > 0 ? 'lg:border-l' : ''}`}
                style={{ borderColor: 'var(--app-border)' }}
              >
                <dt
                  className="text-2xl font-extrabold sm:text-3xl"
                  style={{ color: 'var(--app-accent-strong)' }}
                >
                  {s.value}
                </dt>
                <dd
                  className="mt-1 text-sm"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Fitur ──────────────────────────────────────────── */}
        <section
          id="fitur"
          className="scroll-mt-20 py-[60px] lg:py-24"
        >
          <div className="mx-auto max-w-[1100px] px-4">
            <SectionHeading
              eyebrow="Fitur"
              title="Semua yang dibutuhkan jastiper"
              body="Dari catat titipan sampai tagihan lunas, tanpa pindah-pindah aplikasi."
            />
            {/* Dua fitur inti (catat lalu tagih) lebih besar dari empat
                fitur pendukung. */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
              {FEATURES.map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className={`lp-card lp-card-hover ${
                      f.core
                        ? 'p-6 sm:col-span-2 sm:p-8 lg:col-span-6'
                        : 'p-6 lg:col-span-3'
                    }`}
                  >
                    <span
                      className={`app-icon-tile mb-4 rounded-xl ${
                        f.core ? 'h-14 w-14' : 'h-12 w-12'
                      }`}
                    >
                      <Icon size={f.core ? 26 : 22} aria-hidden />
                    </span>
                    <h3
                      className={`mb-1.5 font-bold ${f.core ? 'text-2xl' : 'text-xl'}`}
                    >
                      {f.title}
                    </h3>
                    <p
                      className={`leading-relaxed ${f.core ? 'text-base' : 'text-sm'}`}
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {f.body}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Sorotan fitur ──────────────────────────────────── */}
        <section
          className="py-[60px] lg:py-24"
          style={{ background: 'var(--app-bg)' }}
        >
          <div className="mx-auto flex max-w-[1100px] flex-col gap-[60px] px-4 lg:gap-24">
            <ShowcaseRow
              eyebrow="Fee otomatis"
              title="Atur fee sekali, terisi sendiri tiap catat barang"
              body="Buat tier fee berdasarkan rentang harga. Saat kamu mencatat barang, fee langsung terisi dan tetap bisa diubah. Ada saran tier dari riwayat pesanan kamu."
              points={[
                'Tier per rentang harga',
                'Saran tier otomatis',
                'Bundling satu harga',
              ]}
              visual={<FeeMockup />}
            />
            <ShowcaseRow
              reverse
              eyebrow="Tagihan"
              title="Tagih pelanggan lewat WhatsApp dalam satu klik"
              body="Pesan tagihan tersusun otomatis: daftar barang, total, DP, dan rekening tujuan. Pelanggan juga bisa membuka link tagihan sendiri."
              points={[
                'Template chat bisa diatur',
                'Link tagihan publik',
                'Sembunyikan rincian fee',
              ]}
              visual={<WhatsappMockup />}
            />
            <ShowcaseRow
              eyebrow="Keuangan"
              title="Tahu persis uang masuk dan yang belum dibayar"
              body="Ringkasan keuangan menghitung seluruh event, termasuk yang sudah ditutup, jadi tidak ada tagihan yang terlupa."
              points={[
                'Uang masuk dan belum bayar',
                'Status Lunas, DP, Dikirim',
                'Export ke Excel',
              ]}
              visual={<FinanceMockup />}
            />
          </div>
        </section>

        {/* ── Cara kerja ─────────────────────────────────────── */}
        <section
          id="cara-kerja"
          className="relative scroll-mt-20 py-[60px] lg:py-24"
        >
          <div
            aria-hidden
            className="lp-capsule -left-20 top-16 hidden h-24 w-80 rotate-[24deg] lg:block"
            style={{ background: 'var(--app-accent-soft)' }}
          />
          <div className="relative mx-auto max-w-[1100px] px-4">
            <SectionHeading
              eyebrow="Cara kerja"
              title="Mulai dalam 3 langkah"
            />
            {/* Langkah menurun seperti anak tangga: urutan kerja dari atas ke
                bawah, kiri ke kanan. */}
            <ol className="grid gap-5 md:grid-cols-3 md:items-start">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="lp-card p-6 md:p-[30px]"
                  style={{ marginTop: `${i * 2}rem` }}
                >
                  <span
                    aria-hidden
                    className="mb-3 block text-5xl font-extrabold leading-none"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mb-1.5 text-xl font-bold">
                    <span className="sr-only">Langkah {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Harga ──────────────────────────────────────────── */}
        <section
          id="harga"
          className="scroll-mt-20 pb-28 pt-[60px] lg:pb-36 lg:pt-24"
          style={{ background: 'var(--app-bg)' }}
        >
          <div className="mx-auto max-w-4xl px-4">
            <SectionHeading
              eyebrow="Harga"
              title="Dua paket, harga yang jelas"
              body={`Semua akun baru dapat trial ${TRIAL_DAYS} hari dengan seluruh fitur PRO.`}
            />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="lp-card flex flex-col rounded-[32px] p-6 sm:p-8">
                <h3 className="text-xl font-bold">FREE</h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Untuk mulai merapikan jastip.
                </p>
                <p className="my-6 text-4xl font-extrabold">Rp0</p>
                <ul className="mb-8 flex flex-col gap-3">
                  {FREE_FEATURES.map((text) => (
                    <PlanFeature key={text} text={text} />
                  ))}
                </ul>
                <Link
                  to="/register"
                  className="lp-btn lp-btn-outline mt-auto"
                >
                  Daftar gratis
                </Link>
              </div>

              <div
                className="lp-onaccent relative flex flex-col rounded-[32px] p-6 sm:p-8"
                style={{
                  background:
                    'linear-gradient(155deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
                  color: 'var(--lp-on-accent)',
                  boxShadow: 'var(--lp-float-shadow)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-bold">PRO</h3>
                  {discount !== null && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{
                        background:
                          'color-mix(in oklab, var(--lp-on-accent) 22%, transparent)',
                      }}
                    >
                      Hemat {discount}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">
                  Untuk jastiper yang serius berkembang.
                </p>
                <div className="my-6">
                  {discount !== null && pricing.originalPrice !== null && (
                    <p className="text-sm line-through">
                      {formatRupiah(Number(pricing.originalPrice))}
                    </p>
                  )}
                  <p className="text-4xl font-extrabold">
                    {formatRupiah(proPrice)}
                    <span className="text-sm font-medium">
                      {' '}
                      / {PRO_DURATION_DAYS} hari
                    </span>
                  </p>
                </div>
                <p className="mb-3 text-sm font-semibold">
                  Semua fitur FREE, plus:
                </p>
                <ul className="mb-8 flex flex-col gap-3">
                  {PRO_FEATURES_LIST.map((text) => (
                    <PlanFeature key={text} text={text} inverted />
                  ))}
                </ul>
                <Link
                  to="/register"
                  className="lp-btn lp-btn-light mt-auto"
                >
                  Coba gratis {TRIAL_DAYS} hari
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Band gelap: partner (miring dari harga) ────────── */}
        <section
          id="partner"
          className="lp-dark lp-slant lp-slant-rev scroll-mt-20"
          style={
            {
              background: 'var(--landing-dark)',
              color: 'var(--landing-dark-fg)',
              '--lp-slant-bg': 'var(--landing-dark)',
            } as React.CSSProperties
          }
        >
          <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 py-[60px] lg:grid-cols-2 lg:py-24">
            <div>
              <p
                className="mb-3 text-sm font-bold uppercase tracking-[0.1em]"
                style={{ color: 'var(--landing-dark-accent)' }}
              >
                Untuk partner
              </p>
              <h2 className="mb-4 text-[1.625rem] font-bold leading-[1.2] md:text-[2rem]">
                Punya brand atau mengadakan event?
              </h2>
              <p
                className="mb-8 max-w-lg leading-relaxed"
                style={{
                  color: 'color-mix(in oklab, var(--landing-dark-fg) 80%, transparent)',
                }}
              >
                Pamerkan katalog produk di kalender event ALAKA dan terima
                pesanan dari jastiper yang ikut event kamu. Akun partner dibuat
                lewat undangan dari tim ALAKA.
              </p>
              <Link to="/login" className="lp-btn lp-btn-inverse">
                Masuk partner
              </Link>
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  icon: Store,
                  title: 'Katalog produk',
                  body: 'Varian, foto, dan harga paket.',
                },
                {
                  icon: CalendarDays,
                  title: 'Event di kalender',
                  body: 'Tampil ke semua jastiper.',
                },
                {
                  icon: Users,
                  title: 'Jaringan jastiper',
                  body: 'Lihat siapa yang ikut event.',
                },
                {
                  icon: Wallet,
                  title: 'Tagihan dan saldo',
                  body: 'Pantau pesanan yang lunas.',
                },
              ].map((c) => {
                const Icon = c.icon
                return (
                  <li
                    key={c.title}
                    className="rounded-[20px] border p-5"
                    style={{
                      borderColor:
                        'color-mix(in oklab, var(--landing-dark-fg) 12%, transparent)',
                      background:
                        'color-mix(in oklab, var(--landing-dark-fg) 5%, transparent)',
                    }}
                  >
                    <Icon
                      size={22}
                      aria-hidden
                      className="mb-3"
                      style={{ color: 'var(--landing-dark-accent)' }}
                    />
                    <h3 className="mb-1 font-bold">{c.title}</h3>
                    <p
                      className="text-sm"
                      style={{
                        color:
                          'color-mix(in oklab, var(--landing-dark-fg) 75%, transparent)',
                      }}
                    >
                      {c.body}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* ── CTA penutup ────────────────────────────────────── */}
        <section className="py-[60px] lg:py-24">
          <div className="mx-auto max-w-[1100px] px-4">
            <div
              className="lp-onaccent relative overflow-hidden rounded-[32px] px-6 py-14 text-center sm:px-12"
              style={{
                background:
                  'linear-gradient(120deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
                color: 'var(--lp-on-accent)',
              }}
            >
              <div
                aria-hidden
                className="lp-capsule -right-16 top-6 h-16 w-72 rotate-[-28deg]"
                style={{
                  background:
                    'color-mix(in oklab, var(--lp-on-accent) 12%, transparent)',
                }}
              />
              <div
                aria-hidden
                className="lp-capsule -bottom-4 -left-20 h-20 w-80 rotate-[-28deg]"
                style={{
                  background:
                    'color-mix(in oklab, var(--lp-on-accent) 10%, transparent)',
                }}
              />
              <div className="relative">
                <h2 className="mb-3 text-[1.625rem] font-bold leading-[1.2] md:text-[2rem]">
                  Siap rapikan jastip kamu?
                </h2>
                <p className="mx-auto mb-8 max-w-md">
                  Daftar sekarang dan pakai semua fitur gratis selama{' '}
                  {TRIAL_DAYS} hari.
                </p>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Link to="/register" className="lp-btn lp-btn-light">
                    Daftar gratis
                  </Link>
                  <Link to="/login" className="lp-btn lp-btn-ghost-light">
                    Masuk
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

/* ── Bagian-bagian halaman ─────────────────────────────────────────── */

function Logo({
  inverted = false,
  size = 44,
}: {
  inverted?: boolean
  size?: number
}) {
  return (
    <span className="flex items-center gap-2.5">
      {/* Logo resmi (bulatan "Alaka"). Alt kosong karena wordmark di sebelahnya
          sudah menyebut nama. */}
      <img
        src="/pwa-192x192.png"
        alt=""
        width={size}
        height={size}
        className="flex-shrink-0 rounded-full border"
        style={{
          width: size,
          height: size,
          borderColor: 'var(--app-border)',
        }}
      />
      <span
        className="text-lg font-extrabold tracking-tight"
        style={{
          color: inverted ? 'var(--landing-dark-fg)' : 'var(--app-text)',
        }}
      >
        ALAKA
      </span>
    </span>
  )
}

function SiteHeader() {
  return (
    // Tombol Masuk selalu terlihat, terutama untuk user PWA lama (iOS) yang
    // sesinya habis dan mendarat di sini.
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--app-border)',
        background: 'color-mix(in oklab, var(--app-card) 88%, transparent)',
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-4 px-4">
        <Link to="/" className="no-underline" aria-label="ALAKA, ke beranda">
          <Logo />
        </Link>
        <nav aria-label="Navigasi utama" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-semibold no-underline transition-colors duration-200 hover:!text-[var(--app-accent-strong)]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="lp-btn lp-btn-sm lp-btn-outline">
            Masuk
          </Link>
          <Link to="/register" className="lp-btn lp-btn-sm lp-btn-primary">
            Daftar gratis
          </Link>
        </div>
      </div>
    </header>
  )
}

function SiteFooter() {
  const columns = [
    { title: 'Produk', links: NAV_LINKS },
    {
      title: 'Akun',
      links: [
        { href: '/register', label: 'Daftar' },
        { href: '/login', label: 'Masuk' },
        { href: '/lupa-sandi', label: 'Lupa sandi' },
      ],
    },
  ]
  const soft = 'color-mix(in oklab, var(--landing-dark-fg) 75%, transparent)'
  return (
    <footer
      className="lp-dark"
      style={{ background: 'var(--landing-dark)', color: soft }}
    >
      <div className="mx-auto grid max-w-[1100px] gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo inverted size={56} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            Aplikasi manajemen jastip (titip beli): event belanja, pesanan,
            tagihan, dan keuangan dalam satu tempat.
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2
              className="mb-4 text-sm font-bold"
              style={{ color: 'var(--landing-dark-fg)' }}
            >
              {col.title}
            </h2>
            <ul className="flex flex-col gap-1 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="inline-flex min-h-[44px] items-center no-underline hover:underline"
                    style={{ color: 'inherit' }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div
        className="border-t py-6 text-center text-xs"
        style={{
          borderColor:
            'color-mix(in oklab, var(--landing-dark-fg) 10%, transparent)',
        }}
      >
        © {new Date().getFullYear()} ALAKA. Semua hak dilindungi.
      </div>
    </footer>
  )
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body?: string
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center lg:mb-16">
      {/* Eyebrow huruf kapital: pola wajib di design.md, dipakai konsisten
          di semua judul section sebagai penanda navigasi. */}
      <p
        className="mb-3 text-sm font-bold uppercase tracking-[0.1em]"
        style={{ color: 'var(--app-accent-strong)' }}
      >
        {eyebrow}
      </p>
      <h2 className="text-[1.625rem] font-bold leading-[1.2] text-balance md:text-[2rem]">
        {title}
      </h2>
      {body && (
        <p
          className="mt-4 text-base leading-relaxed"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {body}
        </p>
      )}
    </div>
  )
}

function ShowcaseRow({
  eyebrow,
  title,
  body,
  points,
  visual,
  reverse = false,
}: {
  eyebrow: string
  title: string
  body: string
  points: Array<string>
  visual: React.ReactNode
  reverse?: boolean
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? 'lg:order-2' : ''}>
        <p
          className="mb-3 text-sm font-bold uppercase tracking-[0.1em]"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          {eyebrow}
        </p>
        <h3 className="mb-4 text-xl font-bold leading-[1.2] text-balance md:text-[1.625rem]">
          {title}
        </h3>
        <p
          className="mb-6 leading-relaxed"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {body}
        </p>
        <ul className="flex flex-col gap-3">
          {points.map((p) => (
            <PlanFeature key={p} text={p} />
          ))}
        </ul>
      </div>
      <div className={reverse ? 'lg:order-1' : ''}>
        <div className="relative">
          <div
            aria-hidden
            className={`lp-capsule -bottom-5 h-16 w-52 rotate-[-18deg] ${
              reverse ? '-left-5' : '-right-5'
            }`}
            style={{ background: 'var(--app-accent-soft)' }}
          />
          <div className="relative">{visual}</div>
        </div>
        <SampleNote className="mt-6 text-center" />
      </div>
    </div>
  )
}

function PlanFeature({
  text,
  inverted = false,
}: {
  text: string
  inverted?: boolean
}) {
  return (
    <li className="flex items-center gap-3 text-sm font-medium">
      <span
        aria-hidden
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
        style={
          inverted
            ? {
                background:
                  'color-mix(in oklab, var(--lp-on-accent) 22%, transparent)',
                color: 'var(--lp-on-accent)',
              }
            : {
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent-strong)',
              }
        }
      >
        <Check size={13} strokeWidth={3} />
      </span>
      {text}
    </li>
  )
}

/** Keterangan bahwa isi mockup hanya contoh (bukan data pengguna). */
function SampleNote({ className = '' }: { className?: string }) {
  return (
    <p
      className={`text-xs ${className}`}
      style={{ color: 'var(--app-text-soft)' }}
    >
      Contoh tampilan dengan data fiktif.
    </p>
  )
}

/* ── Mockup (ilustrasi dari elemen HTML, isinya contoh) ────────────── */

const mockCard: React.CSSProperties = {
  borderColor: 'var(--app-border)',
  background: 'var(--app-card)',
  boxShadow: 'var(--lp-float-shadow)',
}

const STATUS_DOT: Record<'Lunas' | 'DP' | 'Belum bayar', string> = {
  Lunas: 'var(--app-success)',
  DP: 'var(--app-warning)',
  'Belum bayar': 'var(--app-danger)',
}

/** Status memakai titik berwarna + teks ink (bukan hanya warna). */
function StatusChip({ status }: { status: 'Lunas' | 'DP' | 'Belum bayar' }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{
        background: 'var(--app-accent-soft)',
        color: 'var(--app-text)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: STATUS_DOT[status] }}
      />
      {status}
    </span>
  )
}

function HeroMockup() {
  const orders = [
    { name: 'Sinta', items: '3 barang', total: 'Rp 485.000', status: 'Lunas' },
    { name: 'Rina', items: '2 barang', total: 'Rp 312.000', status: 'DP' },
    {
      name: 'Dewi',
      items: '5 barang',
      total: 'Rp 760.000',
      status: 'Belum bayar',
    },
  ] as const
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md lg:max-w-none">
      {/* Kartu aplikasi utama */}
      <div className="rounded-[32px] border p-5 sm:p-6" style={mockCard}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Event belanja
            </p>
            <p className="font-bold">Bazar Akhir Tahun</p>
          </div>
          <span className="app-icon-tile h-9 w-9 rounded-xl">
            <ShoppingBag size={18} />
          </span>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-3"
            style={{ background: 'var(--app-accent-soft)' }}
          >
            <p
              className="text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Uang masuk
            </p>
            <p
              className="text-base font-extrabold"
              style={{ color: 'var(--app-accent-strong)' }}
            >
              Rp 2.450.000
            </p>
          </div>
          <div
            className="rounded-2xl p-3"
            style={{ background: 'var(--app-bg)' }}
          >
            <p
              className="text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Belum bayar
            </p>
            <p className="text-base font-extrabold">Rp 760.000</p>
          </div>
        </div>
        <ul
          className="flex flex-col divide-y"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {orders.map((o) => (
            <li
              key={o.name}
              className="flex items-center gap-3 py-3"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <span
                className="app-avatar h-9 w-9 flex-shrink-0 text-sm font-bold"
                style={{
                  background: 'var(--app-bg)',
                  color: 'var(--app-text)',
                }}
              >
                {o.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{o.name}</p>
                <p
                  className="text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {o.items}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-sm font-bold">{o.total}</p>
                <StatusChip status={o.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Kartu melayang: notifikasi tagihan */}
      <div
        className="absolute -bottom-6 -left-2 flex items-center gap-3 rounded-[20px] border px-4 py-3 sm:-left-8"
        style={mockCard}
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            background: 'var(--app-success-soft)',
            color: 'var(--app-success)',
          }}
        >
          <MessageCircle size={18} />
        </span>
        <div>
          <p className="text-xs font-bold">Tagihan terkirim</p>
          <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            via WhatsApp ke Dewi
          </p>
        </div>
      </div>

      {/* Kartu melayang: fee */}
      <div
        className="absolute -right-2 -top-10 hidden rounded-[20px] border px-4 py-3 sm:block lg:-right-6"
        style={mockCard}
      >
        <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
          Fee bulan ini
        </p>
        <p
          className="text-sm font-extrabold"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          + Rp 380.000
        </p>
      </div>
    </div>
  )
}

function FeeMockup() {
  const tiers = [
    { range: 'Rp 0 – 50.000', fee: 'Rp 5.000' },
    { range: 'Rp 50.001 – 150.000', fee: 'Rp 10.000' },
    { range: 'Rp 150.001 – 300.000', fee: 'Rp 15.000' },
  ]
  return (
    <div aria-hidden className="rounded-[20px] border p-6" style={mockCard}>
      <div className="mb-4 flex items-center gap-3">
        <span className="app-icon-tile h-9 w-9 rounded-xl">
          <Calculator size={18} />
        </span>
        <p className="font-bold">Aturan fee: Reguler</p>
      </div>
      <div
        className="mb-5 overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {tiers.map((t, i) => (
          <div
            key={t.range}
            className={`flex justify-between gap-3 px-4 py-3 text-sm ${i > 0 ? 'border-t' : ''}`}
            style={{ borderColor: 'var(--app-border)' }}
          >
            <span style={{ color: 'var(--app-text-soft)' }}>{t.range}</span>
            <span className="font-bold">{t.fee}</span>
          </div>
        ))}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm"
        style={{ background: 'var(--app-accent-soft)' }}
      >
        <span>
          Tas kanvas · <b>Rp 120.000</b>
        </span>
        <span
          className="font-bold"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          Fee Rp 10.000 terisi
        </span>
      </div>
    </div>
  )
}

function WhatsappMockup() {
  return (
    <div aria-hidden className="rounded-[20px] border p-6" style={mockCard}>
      <div
        className="mb-4 flex items-center gap-3 border-b pb-4"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <span
          className="app-avatar h-9 w-9 text-sm font-bold"
          style={{ background: 'var(--app-bg)', color: 'var(--app-text)' }}
        >
          R
        </span>
        <div>
          <p className="text-sm font-bold">Rina</p>
          <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            WhatsApp
          </p>
        </div>
      </div>
      <div
        className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm p-4 text-sm leading-relaxed"
        style={{ background: 'var(--app-success-soft)' }}
      >
        <p>Halo Rina, ini tagihan Bazar Akhir Tahun ya.</p>
        <p className="mt-2">• Kaos oversize (Rp 95.000 + 8.000)</p>
        <p>• Tote bag (Rp 120.000 + 10.000)</p>
        <p className="mt-2 font-bold">Total: Rp 233.000</p>
        <p>DP: Rp 100.000 · Sisa: Rp 133.000</p>
        <p className="mt-2">Transfer ke BCA 123xxxx a.n. Toko Kamu</p>
        <p
          className="mt-2 font-semibold underline"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          Lihat tagihan
        </p>
      </div>
    </div>
  )
}

function FinanceMockup() {
  const bars = [40, 65, 50, 85, 70, 95]
  return (
    <div aria-hidden className="rounded-[20px] border p-6" style={mockCard}>
      <div className="mb-6">
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Uang masuk · 6 event terakhir
        </p>
        <p className="text-2xl font-extrabold">Rp 14.820.000</p>
      </div>
      <div className="flex h-40 items-end gap-3">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-lg"
            style={{
              height: `${h}%`,
              background:
                i === bars.length - 1
                  ? 'var(--app-accent)'
                  : 'color-mix(in oklab, var(--app-accent) 30%, transparent)',
            }}
          />
        ))}
      </div>
      <div
        className="mt-5 grid grid-cols-2 gap-3 border-t pt-5 text-sm"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <div>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Total fee
          </p>
          <p className="font-bold">Rp 1.240.000</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Belum bayar
          </p>
          <p className="font-bold">Rp 760.000</p>
        </div>
      </div>
    </div>
  )
}
