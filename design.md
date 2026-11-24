---
version: alpha
name: ALAKA Landing Design System
description: >-
  Bahasa visual landing page publik ALAKA (`/` untuk pengunjung belum login).
  Struktur, ritme, bentuk, dan elevasi mengikuti gaya landing produk fintech
  (header bernavigasi, section berlapis latar, kartu lembut, kapsul dekoratif,
  transisi miring), dengan warna dan font milik ALAKA — hangat (krem, coral,
  ink hijau tua), bukan biru korporat.
colors:
  primary: "#21332f"          # ink — fondasi gelap: band gelap, footer, judul
  primary-light: "#b6584b"    # coral — semua aksi utama (tombol, link aktif)
  primary-strong: "#9c463b"   # coral gelap — hover / gradien tombol & kartu PRO
  secondary: "#e8b9ad"        # coral pucat — elemen ilustrasi, kapsul dekoratif
  accent: "#8a6a3a"           # gold — highlight ilustrasi, badge sekunder
  accent-on-dark: "#f2a68f"   # coral terang — eyebrow & ikon di atas band gelap
  background-light: "#fdf9ef" # surface — latar section utama & kartu
  background-alt: "#f3e9d7"   # krem — latar section selang-seling
  background-soft: "#f8f1e1"  # krem terang — panel aktif (accordion terbuka)
  text-main: "#21332f"
  text-muted: "#5c6b62"
  text-subtle: "#8b978f"      # caption, placeholder, teks tersier
  text-inverse: "#ffffff"
  border: "rgba(33, 51, 47, 0.14)"
  accent-soft: "rgba(182, 88, 75, 0.14)" # latar tile ikon, chip, badge
  success: "#22c55e"
  warning: "#f59e0b"
  danger: "#ef4444"
typography:
  fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
  headingFont: "Figtree Bold (700), H1 ExtraBold (800)"
  displayFont: "Fraunces (opsional, hanya aksen editorial — bukan default)"
  sizes:
    h1: 40px          # mobile 32px
    h2: 32px          # mobile 26px
    h3: 20px
    body-md: 16px
    body-sm: 14px
    caption: 12px
  lineHeight:
    heading: 1.2
    body: 1.6
  weights:
    extrabold: 800
    bold: 700
    semibold: 600
    medium: 500
    regular: 400
spacing:
  container: 1100px
  gutter: 16px        # padding sisi di HP
  section-gap: 80px   # mobile 60px, desktop 96px untuk section besar
  item-padding: 30px  # mobile 24px
rounded:
  default: 12px
  button: 22px
  card: 20px
  panel: 32px         # band CTA / kartu harga besar
  pill: 100px
elevation:
  card: "0 10px 20px 0 rgba(33, 51, 47, 0.06)"
  card-hover: "0 16px 32px -8px rgba(33, 51, 47, 0.12)"
  floating: "0 30px 60px -30px rgba(0, 0, 0, 0.35)"
  cta-glow: "0 12px 28px -10px rgba(182, 88, 75, 0.55)"
components:
  button-primary:
    background: "{colors.primary-light}"
    hoverBackground: "{colors.primary-strong}"
    color: "{colors.text-inverse}"
    borderRadius: "{rounded.button}"
    fontWeight: 600
    minHeight: 44px
  button-secondary:
    background: transparent
    border: "1px solid {colors.border}"
    color: "{colors.text-main}"
    borderRadius: "{rounded.button}"
  card-feature:
    background: "{colors.background-light}"
    boxShadow: "{elevation.card}"
    borderRadius: "{rounded.card}"
    padding: "{spacing.item-padding}"
---

# ALAKA Landing Design System

> **Status:** panduan desain saja — belum diterapkan ke kode. Implementasi
> saat ini ada di `src/components/LandingPage.tsx` dan akan disesuaikan ke
> dokumen ini.

## Overview

Landing page ALAKA harus terasa **tepercaya dan rapi** seperti produk fintech
(karena isinya soal uang: tagihan, fee, pembayaran), tetapi tetap **hangat dan
dekat** dengan jastiper — mayoritas pelaku usaha kecil yang bekerja dari HP.

Caranya: struktur fintech yang tegas (container terpusat, section berlapis
latar, kartu dengan bayangan halus, band gelap yang memberi bobot) dipadukan
dengan palet ALAKA yang hangat — krem sebagai kanvas, **coral** untuk aksi,
dan **ink hijau tua** sebagai fondasi gelap pengganti navy. Bentuknya lembut di
mana-mana (kartu 20px, tombol pil), dengan motif **kapsul** dan **transisi
miring** antar-section supaya layout tidak kaku.

## Colors

Palet ini **sama dengan token aplikasi** di `src/styles.css`. Landing tidak
boleh memperkenalkan warna brand baru; pakai variabel CSS yang sudah ada.

| Peran | Hex | Token CSS | Dipakai untuk |
|---|---|---|---|
| Fondasi gelap | `#21332f` | `--brand-ink` / `--landing-dark` | Band gelap, footer, judul |
| Aksi utama | `#b6584b` | `--brand-accent` / `--app-accent` | Tombol utama, link aktif, angka penting |
| Aksi hover | `#9c463b` | `--brand-accent-strong` | Hover tombol, ujung gradien |
| Aksen lembut | `rgba(182,88,75,.14)` | `--brand-accent-soft` | Tile ikon, chip, badge |
| Aksen kedua | `#8a6a3a` | `--brand-gold` | Highlight ilustrasi, badge sekunder |
| Aksen di gelap | `#f2a68f` | `--landing-dark-accent` | Eyebrow & ikon di band gelap |
| Latar utama | `#fdf9ef` | `--brand-surface` / `--app-card` | Section utama, kartu |
| Latar selang | `#f3e9d7` | `--brand-bg` / `--app-bg` | Section selang-seling, strip angka |
| Latar panel | `#f8f1e1` | `--brand-bg-soft` | Panel accordion terbuka |
| Teks utama | `#21332f` | `--app-text` | Judul & teks penting |
| Teks sekunder | `#5c6b62` | `--app-text-soft` | Paragraf |
| Teks tersier | `#8b978f` | `--app-text-mute` | Caption, footer kecil |
| Garis | `rgba(33,51,47,.14)` | `--app-border` | Border kartu & pemisah |

**Hierarki latar:** section berganti antara `background-light` (surface) dan
`background-alt` (krem) untuk menandai batas — bukan dengan garis tebal. Band
gelap (`primary`) dipakai **maksimal dua kali** per halaman (mis. bagian
partner/testimoni dan footer) supaya tetap punya bobot.

**Mode gelap:** semua warna di atas punya padanan gelap di `styles.css`
(`:root[data-theme='dark']` dan `prefers-color-scheme`). Landing wajib memakai
token, bukan hex langsung, supaya ikut berganti. `--landing-dark` di mode gelap
menjadi `#0a0706` (lebih gelap dari latar) agar band tetap terbaca sebagai band.

**Semantik status** (hanya di mockup produk): hijau = Lunas, kuning = DP, merah
= Belum bayar — memakai `--app-success|warning|danger` + versi `-soft`.

## Typography

Satu keluarga font: **Figtree** (dimuat di `styles.css`, hanya untuk landing; aplikasi
tetap Manrope), pengganti gratis untuk Proxima Nova yang berlisensi. Ramah,
terbaca jelas di HP, dan tidak terkesan bawaan generator. **Fraunces** (serif) boleh dipakai sangat terbatas untuk aksen
editorial, bukan untuk judul section.

- **H1 (hero):** Figtree 800, 40px desktop / 32px mobile, line-height 1.2,
  tracking sedikit rapat (`-0.01em`). Satu frasa kunci boleh diwarnai coral.
- **H2 (judul section):** Figtree 700, 32px / 26px mobile, rata tengah, selalu
  didahului **eyebrow**.
- **Eyebrow:** 14px, 700, huruf kapital, `letter-spacing: 0.1em`, warna coral
  (atau `accent-on-dark` di band gelap).
- **H3 (judul kartu):** Figtree 700, 20px.
- **Body:** 16px, 400, line-height 1.6, warna `text-muted`.
- **Kecil:** 14px untuk caption, link footer, label; 12px untuk catatan kaki.
- **Interaktif:** tombol & link memakai 600. Link di dalam paragraf diberi
  garis bawah.

## Layout

- **Container** terpusat 1100px, gutter 16px di HP; tidak boleh ada scroll
  horizontal di lebar 360px.
- **Ruang vertikal** lega: 60px (HP) sampai 96px (desktop) antar-section.
- **Grid:** 3 kolom untuk fitur, 4 kolom untuk strip angka / proof points,
  2 kolom untuk harga dan baris teks–visual. Semua turun jadi 1 kolom di HP
  (strip angka jadi 2×2).
- **Transisi miring ("slanted edge"):** beberapa batas section dibuat miring
  dengan `clip-path: polygon(...)` atau SVG inline berwarna section berikutnya
  — **tanpa file PNG pattern**. Pakai paling banyak 2–3 kali, misalnya hero →
  strip angka dan sebelum band gelap.
- **Header** sticky setinggi 64px; sisakan offset bila nanti ada pita
  pengumuman di atasnya.

### Alur halaman (urutan rekomendasi)

1. **Header** — logo, navigasi anchor (Fitur, Cara kerja, Harga, Partner),
   Masuk + Daftar gratis.
2. **Hero** — janji produk, CTA utama, mockup aplikasi.
3. **Proof strip** — 4 fakta produk (trial 30 hari, tanpa batas event, 1 klik
   tagih WA, Rp0 untuk mulai).
4. **Fitur** — grid 6 kartu manfaat.
5. **Sorotan fitur** — 2–3 baris teks/mockup bergantian.
6. **Cara kerja** — 3 langkah.
7. **Testimoni / bukti** — lihat aturan di Components.
8. **Harga** — FREE vs PRO, harga dari database.
9. **Partner** (band gelap).
10. **CTA penutup** — panel coral bergradien.
11. **Footer** (gelap).

## Elevation & Depth

Kedalaman dibangun dari **lapisan latar dan bayangan halus**, bukan border
tebal:

- **Kartu:** `0 10px 20px rgba(33,51,47,.06)` + border tipis `--app-border`.
  Hover: naik 4px dengan bayangan `card-hover`.
- **Mockup & kartu melayang:** bayangan `floating` yang lebih dalam, menumpang
  sedikit di luar kartu utama untuk kesan sumbu-Z.
- **Kapsul dekoratif:** pil panjang berwarna `secondary` / `accent-soft` /
  gold pudar, diletakkan **menyeberang batas section** (setengah di section
  atas, setengah di bawah) dan di belakang hero. Dibuat dengan `div` +
  `border-radius: 100px`, `aria-hidden`, tanpa gambar.
- **Glow tombol:** CTA utama di hero boleh memakai `cta-glow`; tombol lain
  tidak.

## Shapes

- **Kartu:** radius 20px. Panel besar (kartu harga, band CTA): 32px.
- **Tombol:** pil — radius 22px (tinggi standar) atau 100px.
- **Input & chip:** radius 12px; chip status & badge memakai pil.
- **Kapsul:** motif berulang untuk dekorasi latar (lihat Elevation).
- **Avatar:** selalu lingkaran penuh.
- **Tile ikon:** kotak 48px radius 12px, latar `accent-soft`, ikon coral.
- **Larangan:** tidak ada sudut 90° pada kontainer utama, kartu, atau tombol.

## Components

- **Header:** sticky, latar surface 88% + `backdrop-blur`, border bawah tipis.
  Navigasi anchor di desktop (≥ 768px); di HP hanya logo + Masuk + Daftar.
  Tombol **Masuk wajib selalu terlihat** — user PWA iOS lama yang sesinya habis
  mendarat di landing (lihat PRD §4.1.1).
- **Hero:** dua kolom (teks kiri, mockup kanan), turun jadi satu kolom di HP.
  Isi: chip eyebrow → H1 → paragraf → CTA utama (coral, pil, glow) + CTA
  sekunder (outline) → 2 poin centang. Mockup = tampilan aplikasi dari HTML
  (daftar pesanan + status) dengan 1–2 kartu melayang.
- **Proof strip:** 4 angka besar berwarna coral + label kecil, dipisah garis
  vertikal tipis di desktop.
- **Feature card:** surface, ikon di tile kiri atas, judul H3, deskripsi 2
  baris, opsional link "Pelajari" bergaris bawah.
- **Baris sorotan:** teks (eyebrow, H3 besar, paragraf, 3 poin centang) +
  mockup, posisi bergantian kiri/kanan.
- **Accordion (FAQ, opsional):** daftar bersih; item terbuka berlatar
  `background-soft`, panah berputar 180°, judul aktif berwarna coral.
- **Testimoni:** slider satu-item — kutipan besar dengan ikon tanda kutip,
  avatar lingkaran, nama + nama brand jastip.
  **Aturan wajib:** hanya testimoni **asli** dengan izin pemiliknya. Sebelum
  ada, bagian ini diganti **proof points** (fakta produk yang bisa dibuktikan)
  — jangan pernah mengarang nama, foto, kutipan, atau jumlah pengguna.
- **Kartu harga:** FREE = surface + border; PRO = gradien coral
  (`primary-light` → `primary-strong`) dengan teks putih dan badge "Hemat N%"
  bila ada harga coret. Harga dan fitur diambil dari `fetchPublicPricing` dan
  `lib/plan-features.ts`.
- **Band gelap (partner):** latar `primary`, eyebrow `accent-on-dark`, kartu
  di dalamnya transparan (`rgba(255,255,255,.05)` + border putih 12%).
- **CTA penutup:** panel radius 32px bergradien coral, dua kapsul putih
  transparan sebagai dekorasi, tombol putih (teks coral) + tombol outline putih.
- **Newsletter / kontak (opsional):** input pil dengan tombol bulat menumpang
  di sisi kanan input.
- **Footer:** latar `primary`, teks putih 70%; kolom logo + deskripsi singkat,
  Produk, Akun, Kontak; baris hak cipta di bawah dipisah garis putih 10%.

## Motion

- Transisi 150–250ms `ease-out` untuk hover (naik kartu, warna tombol).
- Accordion: tinggi & rotasi panah 200ms.
- Slider testimoni: geser horizontal, bisa digeser jari di HP, tanpa autoplay
  cepat (≥ 6 detik bila autoplay).
- Hormati `prefers-reduced-motion`: matikan animasi naik/geser.

## Do's and Don'ts

### Do's

- Pakai coral `#b6584b` untuk **semua** aksi utama, dan hanya itu.
- Pakai token CSS yang ada (`--app-*`, `--brand-*`, `--landing-*`), bukan hex
  langsung, supaya mode gelap ikut.
- Judul dengan `text-main` (ink) di atas latar terang; putih di atas band gelap.
- Beri jarak vertikal minimal 60px antar-section.
- Bangun mockup & dekorasi dari HTML/CSS (ringan, tajam di semua layar, ikut
  tema).

### Don'ts

- Jangan pakai sudut tajam 90° pada kontainer, kartu, atau tombol.
- Jangan pakai hitam murni untuk teks; pakai ink dan abu kehijauan.
- Jangan pakai gold atau coral pucat untuk teks paragraf — itu warna ilustrasi.
- Jangan pakai warna, logo, aset, atau pola milik brand lain.
- Jangan mengarang testimoni, logo klien, liputan media, sertifikasi, atau
  angka pengguna. Klaim fitur harus sesuai kode (lihat catatan PRD §4.12
  tentang daftar fitur PRO).

## Accessibility

- **Kontras:** putih di atas ink/coral, ink di atas krem — keduanya ≥ 4.5:1
  untuk teks body. Cek ulang kombinasi coral-di-krem untuk teks kecil.
- **Target sentuh:** tombol dan link utama minimal 44px tinggi.
- **Status aktif:** tab/accordion aktif dibedakan dengan warna coral **dan**
  ikon/garis, tidak hanya warna.
- **Keterbacaan:** line-height body 1.6.
- **Fokus:** semua tombol, link, dan kontrol slider punya `:focus-visible`
  yang jelas (ring `accent-soft` 3px seperti `.app-input`).
- **Dekorasi** (kapsul, mockup) diberi `aria-hidden`.

## Assets

Tidak ada aset gambar eksternal. Semuanya dari repo atau dibuat dengan kode:

- **Logo:** monogram "A" dalam kotak coral + wordmark "ALAKA" (versi terbalik:
  kotak putih, teks putih, untuk latar gelap). Ikon app: `public/pwa-512x512.png`.
- **Ikon:** `lucide-react` (sudah dipakai di aplikasi), stroke default,
  ukuran 18–24px.
- **Font:** Figtree, Manrope & Fraunces dari Google Fonts (sudah di-import
  `styles.css`).
- **Mockup produk, kapsul, transisi miring, ikon kutip:** HTML/CSS/SVG inline.
- **Testimoni:** foto & nama hanya dari pelanggan asli dengan izin.
