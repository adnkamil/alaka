# Rencana teknis: list per submit dan tagihan partner

Status: rencana, belum dikerjakan. Kerjakan per tahap, satu tahap selesai dan dicek user sebelum lanjut.

## Aturan kerja (wajib)

- **Jangan commit.** User yang commit sendiri.
- Database: hanya DB lokal `jastip_dev` (`.env.local` → localhost). `pnpm db:generate` lalu `pnpm db:migrate` aman karena `drizzle.config.ts` membaca `.env.local` lebih dulu. **Jangan** pakai `db:migrate:neon*` dan jangan sentuh `.env.neon*.local`.
- Sebelum mengubah file, ikuti `AGENTS.md`: `pnpm dlx @tanstack/intent@latest list` lalu load skill yang cocok (router / start / query).
- Cek setelah tiap tahap: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`.
  Error yang **sudah ada sebelumnya** (bukan tanggung jawab tahap ini): `'tabs' is declared but never read` di `src/routes/partner/event/$id.tsx`, dan 9 error ESLint di `AddOrderSheet.tsx` / `events-functions.ts`.
- Teks UI pakai Bahasa Indonesia, gaya yang sama dengan komponen sekitarnya (`app-card`, `app-badge`, `pm-num`, `pm-chip`, CSS var `--app-*`).
- Data uji: event kalender **"testing 150 jastiper"** (`1abb3e50-189f-4d19-bdb6-e3c2fcc25fdd`), 150 jastiper dummy `dummy001@seed.local` … `dummy150@seed.local`, password `dummy123`.

## Keputusan produk yang sudah final

1. Hanya submit yang **sudah dicek** (`event_submissions.stock_checked_at` terisi) yang bisa ditagih.
2. Barang dari submit yang **sudah ditagih tidak boleh dibatalkan**. Jalan keluarnya: partner membatalkan tagihan dulu.
3. **Unit tagih = satu submit utuh.** Tidak ada tagih sebagian barang dalam satu submit.
4. Alur bayar (jastiper klik "sudah bayar" + upload bukti, tab Review pembayaran, tombol Lunas) = **tahap 4, dikerjakan nanti**.

## Fakta kode yang perlu diketahui

| Hal | Lokasi | Catatan |
|---|---|---|
| Tabel submit | `eventSubmissions` di `src/db/schema.ts:551` | `submitNo` (per event jastiper), `queueSeq` (identity global, urutan cek stok), `stockCheckedAt` (null = belum dicek) |
| Status barang | `submit_status`: `pengajuan`, `disetujui`, `disanggah` (ditolak: stok kurang/habis), `dibatalkan` (dibatalkan partner setelah disetujui) | Ada di `items` (satuan, `isBundle=false`) dan `item_components` (isi paket). Baris paket induk (`isBundle=true`) tidak punya status. |
| Riwayat per submit | `loadSubmissionHistory` di `src/lib/event-slot-queries.ts:296` | Sudah menghitung pcs approved/rejected/pending per submit, tapi per satu event jastiper dan tanpa `dibatalkan` / nominal. |
| Tagihan paket | `bundleBillingAmount` di `src/lib/partner-billing.ts` | Paket lengkap (semua isi disetujui) = harga paket (`items.hpp`), selain itu isi yang disetujui × harga satuan. |
| Harga satuan | `partner_variants.price` (**live**, bisa diubah partner kapan saja) | Karena itu tagihan wajib menyimpan snapshot harga. |
| Ringkasan per jastiper | `loadJastiperEventDetail` + `getPartnerEventRevenue` di `src/lib/partner-jastiper-detail.ts` | Dipanggil per jastiper (N+1). Dipakai `PartnerRevenueCard` dan list sekarang. |
| Antrean | `listSlotQueue` di `src/lib/event-slot-queries.ts:215` | `rank` dihitung dari `events.submittedAt` (submit pertama jastiper), **bukan** per submit. |
| List partner | `src/routes/partner/event/$id.tsx` | Sekarang menggabungkan baris per jastiper (`listRows`, `rejectedRows`, `rowStatus`). Ada versi mobile (`lg:hidden`) dan desktop (`hidden lg:flex`). |
| Detail jastiper | `src/routes/partner/event/jastiper.$id.$brandId.tsx` → `src/components/PartnerJastiperCheck.tsx` | Search param `view: 'pengajuan' \| 'disetujui'` memfilter baris. |
| Pembatalan | `cancelSubmittedRow` di `src/lib/submit-queries.ts:657` | Hanya cek status `disetujui`. Belum ada kunci tagihan. |
| Regroup paket | `src/lib/partner-paket-queries.ts` (~baris 220) | Satuan yang disetujui dari **submit berbeda** bisa digabung jadi satu paket. Komponen menyimpan `submissionId` asal masing-masing. **Satu paket bisa berisi komponen dari beberapa submit.** |
| Rekap | `src/routes/partner/event/rekap.$id.tsx` | Search `status` memakai `PARTNER_STATUS_FILTERS` (`semua`/`draft`/`pengajuan`/`selesai`). |
| Notifikasi | tabel `notifications` (`kind` varchar bebas, `target`, `eventId`) | Dipakai untuk memberi tahu jastiper. |
| Format waktu | `formatWibDateTime` di `src/lib/event-slot.ts` | "9 Nov, 18.00 WIB". |

---

## Tahap 1: list jastiper jadi satu baris per submit

Tujuan: halaman event partner (tab Jastiper) menampilkan **satu baris per submit**, bukan per jastiper. Hanya berlaku untuk event yang memakai slot (`slotEnabled`). Event tanpa slot **tidak diubah** (tetap `PARTICIPANT_COLUMNS`).

### 1a. Fungsi pembagian harga paket per submit (pure, dengan test)

Tambahkan di `src/lib/partner-billing.ts`:

```ts
export type AllocComponent = {
  submissionId: string | null
  qty: number            // qty komponen per paket
  status: SubmitStatus | null
  unitPrice: number
}

/**
 * Bagi tagihan satu baris paket ke submit asal tiap komponen.
 * Jumlah seluruh hasil == bundleBillingAmount(...) untuk input yang sama.
 * - Paket lengkap: harga paket dibagi proporsional (qty × unitPrice) per komponen.
 *   Sisa pembulatan (rupiah bulat) masuk ke komponen terakhir.
 *   Kalau total harga satuan 0, bagi rata per pcs.
 * - Tidak lengkap: komponen disetujui × unitPrice, lainnya 0.
 */
export function allocateBundleBilling(input: {
  bundleQty: number
  bundlePrice: number | null
  components: Array<AllocComponent>
}): Map<string, number>   // submissionId -> nominal
```

Test baru `src/lib/partner-billing.test.ts` (pakai `node:test` seperti test lain): paket lengkap satu submit, paket lengkap lintas dua submit, paket tidak lengkap, pembulatan (mis. harga paket 100.000 dibagi 3 komponen harga sama), dan **jumlah hasil selalu sama dengan `bundleBillingAmount`**.

### 1b. Query list submit (server)

File baru `src/lib/partner-submit-list.ts`:

```ts
export type PartnerSubmitRow = {
  submissionId: string
  eventId: string          // event belanja jastiper
  brandId: string
  brandName: string
  waNumber: string | null
  submitNo: number
  submittedAt: Date
  /** Posisi di antrean cek stok event ini, 1 = pertama. Urut queue_seq. */
  queueRank: number
  checked: boolean          // stockCheckedAt !== null
  checkedAt: Date | null
  pcs: { total: number; approved: number; rejected: number; cancelled: number; pending: number }
  /** Nominal tagihan submit ini (barang disetujui, paket lengkap memakai allocateBundleBilling). */
  approvedAmount: number
  /** Nilai barang yang masih menunggu cek (harga satuan). */
  pendingAmount: number
}

export type PartnerSubmitList = {
  rows: Array<PartnerSubmitRow>
  /** Jastiper yang ikut tapi belum pernah submit. */
  notSubmitted: Array<{ brandId: string; brandName: string; status: SlotStatus | null }>
}

export const getPartnerSubmitList = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: z.uuid() }))
  .handler(...) // requirePartner + partnerOwnsEvent, sama seperti getPartnerEventRevenue
```

Implementasi, **query sekali jalan untuk seluruh event** (jangan per jastiper):
1. `event_submissions` join `events` (filter `calendarEventId`) join `brands` → semua submit. Urutkan `queueSeq asc`, `queueRank = index + 1`.
2. Satuan: `items` where `submissionId in subIds and isBundle = false` → qty, status, partnerVariantId, submissionId.
3. Komponen: `item_components` where `submissionId in subIds` → kumpulkan `itemId` paket induknya. Lalu ambil **semua** komponen dari paket-paket itu (termasuk yang submit-nya lain) + baris induknya (`qty`, `hpp`). Ini perlu supaya status "paket lengkap" benar.
4. Harga: `partner_variants.price` untuk semua varian yang terlibat (satu query `inArray`).
5. Hitung: pcs per status per submit (komponen: `c.qty * item.qty`, sama dengan `loadSubmissionHistory`); `approvedAmount` = satuan disetujui × harga + hasil `allocateBundleBilling` per paket; `pendingAmount` = pcs pengajuan × harga satuan.
6. `notSubmitted`: pakai `listSlotQueue` (sudah ada) dan ambil yang `submittedAt === null`.

Kalau `loadSubmissionHistory` bisa memakai helper hitung yang sama tanpa mengubah output-nya, boleh direfaktor. Kalau berisiko, biarkan.

Index (opsional tapi disarankan, migration baru lewat `pnpm db:generate`): `items(submission_id)` dan `item_components(submission_id)`. Sekarang belum ada.

### 1c. UI list (`src/routes/partner/event/$id.tsx`)

- Query baru: `useQuery({ queryKey: ['partner-submit-list', id], queryFn: getPartnerSubmitList, refetchInterval: 15_000 })`.
- Hapus logika lama khusus slot: `ListRow`, `listRows`, `rejectedRows`, `rowStatus`, `revenueByBrand` (kalau tidak dipakai lagi). `revenue` tetap dipakai `PartnerRevenueCard` dan info "Pesanan … pcs masuk". `queue` tetap dipakai untuk `slotEnabled`.
- Kolom desktop (slot), ganti `PARTICIPANT_COLUMNS_SLOT`:

  | Kolom | Isi |
  |---|---|
  | Jastiper | inisial + nama brand |
  | Waktu submit | `formatWibDateTime(submittedAt)` |
  | No. WhatsApp | seperti sekarang |
  | Pcs | `pcs.total` |
  | Urutan | `#queueRank` |
  | Submit ke | `#submitNo` |
  | Hasil | belum dicek: `–`. Sudah dicek: "48 dapat" + badge merah "2 ditolak" bila `rejected > 0` + teks abu "1 dibatalkan" bila `cancelled > 0` |
  | Status | badge "Menunggu dicek" (tone info) atau "Sudah dicek" (tone success) |

- Mobile: kartu per submit dengan isi yang sama (nama, waktu submit, status, hasil, `Urutan #n · Submit ke-n`, pcs · nominal).
- Filter chip slot diganti: **Semua / Menunggu dicek / Sudah dicek**, hitungan dari `rows`. Pencarian nama jastiper tetap. Urutan default: `queueRank` naik.
- Di bawah tabel: teks kecil "N jastiper belum submit", bisa diklik untuk membuka daftar namanya (`notSubmitted`). Tidak ada baris tabel untuk mereka.
- Klik baris → `/partner/event/jastiper/$id/$brandId` dengan search `{ submit: submitNo }` (lihat tahap 2).
- Link "Rekap Orderan": petakan filter baru ke `status` rekap: Menunggu dicek → `pengajuan`, Sudah dicek → `selesai`, Semua → `semua`.
- Jangan ubah `PartnerSubmitReview` (bar progres) dan `PartnerSlotSection`.
- Fungsi lama yang tidak dipakai lagi (`partnerStatusFilterKey`, `PartnerStatusChips`, `partnerStatusBadge`) jangan dihapus kalau masih dipakai file lain. Cek dengan grep dulu.

### Selesai kalau

- Event "testing 150 jastiper" menampilkan 150 baris (1 submit per jastiper), urutan #1–#150 sesuai `queue_seq`.
- Jastiper yang submit dua kali tampil dua baris, masing-masing dengan Urutan, Waktu submit, dan Status sendiri.
- Jumlah `approvedAmount` semua baris == `revenue.approvedAmount` di kartu pendapatan. Cek manual atau dengan query.
- Event tanpa slot tampil seperti sebelumnya.

---

## Tahap 2: detail jastiper jadi ringkasan gabungan

File: `src/routes/partner/event/jastiper.$id.$brandId.tsx`, `src/components/PartnerJastiperCheck.tsx`.

- Search param: ganti `view` dengan `submit?: number`. `validateSearch` menerima angka positif, selain itu `undefined`. Cari semua pemakai `view: 'pengajuan' | 'disetujui'` (ada di `PartnerJastiperCheck.tsx` ~baris 348 dan `$id.tsx`) lalu sesuaikan.
- Di atas halaman tambahkan **kartu ringkasan** jastiper: jumlah submit, pcs dapat / ditolak / dibatalkan / menunggu, total tagihan (jumlah `approvedAmount` semua submit), nilai yang menunggu cek. Sumber data: `getPartnerSubmitList` difilter `brandId`. Lebih baik tambahkan parameter opsional `brandId` ke fungsi itu supaya query hanya membaca satu jastiper, seperti `loadSubmissionsForPartner`.
- Di bawahnya **rincian per submit**: satu blok per submit (Submit ke-n · waktu · status · hasil). Isi tabel barangnya memakai yang sudah ada di `PartnerJastiperCheck`.
- Kalau `submit` diisi: scroll ke blok submit itu dan beri highlight singkat. Tidak memfilter, semua submit tetap tampil.
- Alur cek manual (tombol cek per submit, pembatalan) jangan diubah.

### Selesai kalau

- Dari list, klik baris submit ke-2 membuka detail dan langsung fokus ke blok submit ke-2.
- Total di kartu ringkasan == jumlah nominal baris-baris jastiper itu di list.

---

## Tahap 3: tagihan (invoice)

**Sebelum mulai, tanyakan user:** di mana tagihan muncul untuk jastiper. Usulan default: section "Tagihan dari partner" di halaman event jastiper + notifikasi.

### 3a. Skema (migration lewat `pnpm db:generate`)

```ts
export const invoiceStatus = pgEnum('invoice_status', ['ditagih', 'dibatalkan'])
// Tahap 4 menambah nilai: 'menunggu_review', 'lunas'.

export const invoices = pgTable('invoices', {
  id: uuid().primaryKey().defaultRandom(),
  number: bigint('number', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(), // tampil "INV-000123"
  calendarEventId: uuid('calendar_event_id').notNull().references(() => calendarEvents.id, { onDelete: 'restrict' }),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'restrict' }), // event belanja jastiper
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'restrict' }),
  status: invoiceStatus().notNull().default('ditagih'),
  totalAmount: numeric('total_amount').notNull(),
  totalPcs: integer('total_pcs').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  createdAt: ..., updatedAt: ...,
})

export const invoiceSubmissions = pgTable('invoice_submissions', {
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id').notNull().references(() => eventSubmissions.id, { onDelete: 'restrict' }),
  amount: numeric().notNull(),
  pcs: integer().notNull(),
  /** Terisi saat tagihan dibatalkan: submit bebas ditagih lagi. */
  releasedAt: timestamp('released_at', { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.invoiceId, t.submissionId] }),
  // Satu submit hanya boleh ada di satu tagihan aktif.
  uniqueIndex('invoice_submissions_active_unique').on(t.submissionId).where(sql`released_at is null`),
])

/** Snapshot baris tagihan. Harga katalog live bisa berubah, tagihan tidak boleh ikut berubah. */
export const invoiceLines = pgTable('invoice_lines', {
  id: uuid().primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id').notNull(),
  kind: varchar().notNull(),            // 'satuan' | 'paket'
  label: text().notNull(),              // nama produk (ukuran / variasi) atau nama paket + isi
  qty: integer().notNull(),
  unitPrice: numeric('unit_price').notNull(),
  amount: numeric().notNull(),
})
```

`onDelete: 'restrict'` disengaja: event atau submit yang sudah ditagih tidak boleh hilang diam-diam. Periksa juga apakah `deleteEvent` (`src/lib/events-functions.ts`) dan `cleanup_150.sql` di scratchpad perlu menyesuaikan. Hapus invoice dulu sebelum menghapus event uji.

### 3b. Aturan server

File baru `src/lib/invoice-queries.ts` (logika, terima `tx`) dan `src/lib/invoice-functions.ts` (server fn).

**Submit bisa ditagih** jika: `stockCheckedAt` terisi, tidak ada di `invoice_submissions` dengan `releasedAt is null`, dan `approvedAmount > 0`. Submit sudah dicek dengan nominal 0 (semua ditolak/dibatalkan) tidak bisa ditagih dan cukup tampil di tab Semua dengan keterangan "tidak ada tagihan".

**`createInvoice({ calendarEventId, submissionIds })`**, dalam satu transaksi:
1. `requirePartner` + `partnerOwnsEvent`.
2. Lock submit: `select … from event_submissions where id in (…) for update`.
3. Semua submit harus milik **satu event jastiper** (satu brand) di calendar event ini, dan semuanya bisa ditagih. Kalau tidak, lempar error yang jelas.
4. **Paket lintas submit:** kalau ada paket yang komponennya berasal dari submit yang dipilih *dan* submit lain yang belum dipilih, tolak dengan pesan "Paket X juga berisi barang dari Submit ke-N. Tagih bersama submit itu." Alasannya, harga paket hanya benar kalau semua isinya ditagih bersama.
5. Hitung nominal dengan fungsi yang sama dengan tahap 1 (`allocateBundleBilling`), lalu tulis `invoices`, `invoice_submissions`, `invoice_lines` (snapshot).
6. Notifikasi ke jastiper (`notifications`: `kind: 'tagihan'`, `brandId`, `eventId`, `target: 'event'`).

**`cancelInvoice({ invoiceId, reason? })`**: hanya kalau `status = 'ditagih'`. Set `status = 'dibatalkan'`, `cancelledAt`, dan `releasedAt` pada semua `invoice_submissions`-nya. Kirim notifikasi ke jastiper.

**Kunci setelah ditagih.** Helper `isSubmissionInvoiced(tx, submissionId)` dipakai di:
- `cancelSubmittedRow`: lempar `"Barang ini sudah ditagih. Batalkan tagihannya dulu."`.
- Regroup paket (`partner-paket-queries.ts`, filter `pool`): satuan dari submit yang sudah ditagih **tidak boleh ikut membentuk paket baru**, karena harga submit yang sudah ditagih akan berubah.
- `reviewSubmission` / alur cek ulang: kalau submit yang sudah dicek bisa dicek ulang, blokir untuk submit yang sudah ditagih. Periksa dulu apakah jalur itu ada.
- Sisi jastiper: pastikan `deleteItem`, `deleteOrder`, `updateOrder` (`src/lib/orders-functions.ts`) tidak bisa menghapus atau mengubah barang yang `submitStatus`-nya bukan null. Sepertinya sudah dikunci (`LOCKED_QTY_MESSAGE`), tapi tetap verifikasi.

Test pure function untuk aturan "bisa ditagih" dan validasi paket lintas submit.

### 3c. UI partner

- Di `$id.tsx`, chip filter tahap 1 berubah menjadi **tabs**: `Semua · Menunggu dicek (n) · Siap ditagih (n) · Sudah ditagih (n)`. Status tiap baris menjadi salah satu dari: Menunggu dicek, Siap ditagih, Sudah ditagih, atau Sudah dicek (tanpa tagihan). `getPartnerSubmitList` menambah field `invoice: { id, number, status } | null` per baris.
- Tab **Siap ditagih**: checkbox per baris. Setelah satu baris dicentang, baris jastiper lain dinonaktifkan (tooltip "Satu tagihan untuk satu jastiper"). Tombol "Pilih semua submit jastiper ini". Bar aksi menempel di bawah: "3 submit · 140 pcs · Rp 4.200.000 · **Kirim tagihan**" → `ConfirmModal` dengan ringkasan → `createInvoice`.
- Tab **Sudah ditagih**: kolom Status menampilkan nomor invoice. Klik membuka detail tagihan (halaman atau modal; ikuti pola yang ada) berisi `invoice_lines` dan tombol **Batalkan tagihan** (dengan konfirmasi dan alasan opsional).
- Di detail barang (`PartnerJastiperCheck`), tombol batal pada barang dari submit yang sudah ditagih dinonaktifkan, dengan keterangan "Sudah ditagih". Kunci di server tetap wajib.
- Invalidate `['partner-submit-list', id]`, `['partner-event-revenue', id, …]`, dan `['partner-jastiper-detail', id, brandId]` setelah membuat atau membatalkan tagihan.

### 3d. UI jastiper (baca saja)

Sesuai keputusan user di awal tahap 3. Minimal: daftar tagihan untuk event belanja ini (nomor, tanggal, total, status), dan halaman detail yang menampilkan `invoice_lines` (snapshot, bukan hitung ulang). Belum ada tombol bayar.

### Selesai kalau

- Tagih submit dua jastiper sekaligus ditolak. Tagih submit yang belum dicek ditolak. Tagih submit yang sudah ada di tagihan aktif ditolak.
- Setelah ditagih, `cancelSubmittedRow` untuk barang di submit itu gagal dengan pesan yang jelas.
- Ubah harga varian di katalog → total tagihan yang sudah dibuat tidak berubah.
- Batalkan tagihan → submit kembali ke Siap ditagih, barang bisa dibatalkan lagi, dan submit bisa ditagih ulang (tagihan lama tetap tersimpan sebagai `dibatalkan`).

---

## Tahap 4 (nanti): pembayaran

Hanya garis besar. Rinci saat akan dikerjakan.

- Enum `invoice_status` + `menunggu_review`, `lunas`. Kolom `paidClaimedAt`, `paidConfirmedAt`, bukti bayar (pola upload mengikuti foto produk partner).
- Jastiper: tombol "Sudah bayar" + upload bukti → `menunggu_review`.
- Partner: tab "Review pembayaran" → tombol **Lunas** → `lunas`, atau tolak kembali ke `ditagih`.
- `cancelInvoice` hanya boleh saat `ditagih`, tidak boleh lagi setelah jastiper mengaku bayar.
