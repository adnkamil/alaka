# Alur slot pemesanan event partner

Berlaku hanya untuk event partner (`calendar_event.partner_id` terisi) yang waktu
buka dan tutup slotnya diisi partner. Event admin ALAKA dan event buatan jastiper
sendiri tidak berubah. Kode murninya di `src/lib/event-slot.ts`.

## Status event jastiper

| Status | Syarat | Pesanan |
| --- | --- | --- |
| Slot belum dibuka / Draft / Slot ditutup | `submitted_at` kosong | bebas diubah |
| Menunggu dicek partner | `submitted_at` terisi | terkunci |
| Sanggah | `reviewed_at` terisi, ada paket kekurangan barang | terkunci, hanya lewat jalur sanggah |
| Menunggu verifikasi barang pengganti | ada komponen pengganti `approved_qty` null | terkunci |
| Jastiper menyetujui pesanan / Disetujui | tidak ada paket bermasalah | final |

## Data

- `calendar_event.slot_opens_at`, `slot_closes_at`: diisi partner. Keduanya kosong = alur lama.
- `events.submitted_at`: jam server saat submit. Urutan "#N dari M" dihitung di database
  (`row_number() over (order by submitted_at, id)`), tidak disimpan.
- `events.reviewed_at`, `sanggah_deadline`, `decided_at`.
- `items.requested_qty`: yang diminta. Setelah dicek, `items.qty` = yang DAPAT (boleh 0),
  sehingga total, FIFO, dan invoice otomatis memakai yang dapat. Baris qty 0 tidak tampil di invoice.
- `item_components.approved_qty`: null = belum dicek / pengganti menunggu verifikasi;
  kurang dari `qty` = paket masuk sanggah.

## Aturan

1. Setelah submit, semua jalur yang mengubah pesanan ditolak server
   (`assertOrdersEditable`): tambah/ubah/hapus pesanan dan barang, import, isi paket.
2. Partner mengecek per varian tanpa nama pemesan. Pcs yang dapat dibagikan ke pemesan
   yang masuk lebih dulu (`allocateApproval`).
3. Pengecekan pertama wajib mengisi batas waktu sanggah. Setelahnya batas hanya boleh diperpanjang.
4. Sanggah per paket:
   - Tidak ganti: paket dibongkar, hanya pcs yang dapat kembali jadi satuan, FIFO jalan lagi
     dari pcs yang disetujui (boleh membentuk paket baru tanpa dicek ulang).
   - Ganti: komponen diganti varian lain dari aturan paket yang sama; yang dapat sebagian dipecah.
     Barang pengganti menunggu verifikasi partner.
5. Lewat batas sanggah: paket bermasalah otomatis "tidak ganti" (`resolveExpiredSanggah`),
   dipanggil saat halaman jastiper atau antrean partner dibuka. `listEventsWithExpiredSanggah`
   tersedia kalau nanti ingin dipanggil dari scheduled function.
6. Koreksi partner setelah dicek diizinkan; paket yang kembali kekurangan barang kembali
   ke keputusan jastiper.

## Belum ada

Notifikasi (fitur terpisah), membuka kembali pesanan yang sudah submit, scheduled function.
