/** Saldo kredit partner (/partner/saldo) dan modal top up. */

const en = {
  title: 'Credit Balance',
  intro:
    'Used to pay ALAKA admin fees when invoices to jastipers are paid. The balance cannot be withdrawn.',
  topupSent:
    'Top up proof sent. Your balance increases after the admin verifies it.',
  loadFailed: 'Could not load the balance.',
  balance: 'Balance',
  topup: 'Top up',
  negativeNote:
    'A negative balance is covered automatically by your next top up.',
  pendingTopup: (amount: string, time: string) =>
    `Top up of ${amount} (${time}) is waiting for admin verification.`,
  historyLabel: 'Balance history',
  viewEntries: 'Balance activity',
  viewTopups: 'Top up history',
  statusPending: 'Waiting for verification',
  statusApproved: 'Added to balance',
  statusRejected: 'Rejected',
  entryTopup: 'Top up',
  entryAdminFee: 'Admin fee',
  entryAdjustment: 'Admin adjustment',
  noEntries: 'No balance activity yet.',
  balanceAfter: 'Balance',
  noTopups: 'No top ups yet.',
  reason: (note: string) => `Reason: ${note}`,

  // Modal
  readFileFailed: 'Could not read the file',
  formatError: 'The format must be PNG, JPG, JPEG, or WEBP',
  imageReadFailed: 'Could not read the image, try another file',
  proofRequired: 'Upload the transfer proof first',
  submitFailed: 'Could not send the top up',
  modalTitle: 'Top Up Balance',
  amount: 'Amount',
  loading: 'Loading...',
  qrisAlt: (amount: string) => `QRIS top up ${amount}`,
  qrisMissing: 'QRIS is not available yet, contact the ALAKA admin.',
  scanDynamic:
    'Scan, the amount fills in automatically, then upload the proof below.',
  scanStatic:
    'Scan and transfer the amount above, then upload the proof below.',
  proof: 'Transfer proof',
  processingImage: 'Processing image...',
  proofPreview: 'Transfer proof preview',
  tapToUpload: 'Tap to upload a transfer screenshot',
  removeImage: 'Remove this image',
  sending: 'Sending...',
  sendProof: 'Send Top Up Proof',
}

const id: typeof en = {
  title: 'Saldo Kredit',
  intro:
    'Dipakai untuk membayar biaya admin ALAKA saat tagihan ke jastiper lunas. Saldo tidak bisa ditarik.',
  topupSent:
    'Bukti top up terkirim. Saldo bertambah setelah admin memverifikasi.',
  loadFailed: 'Gagal memuat saldo.',
  balance: 'Saldo',
  topup: 'Top up',
  negativeNote: 'Saldo minus tertutup otomatis dari top up berikutnya.',
  pendingTopup: (amount, time) =>
    `Top up ${amount} (${time}) sedang menunggu verifikasi admin.`,
  historyLabel: 'Riwayat saldo',
  viewEntries: 'Mutasi saldo',
  viewTopups: 'Riwayat top up',
  statusPending: 'Menunggu verifikasi',
  statusApproved: 'Masuk saldo',
  statusRejected: 'Ditolak',
  entryTopup: 'Top up',
  entryAdminFee: 'Biaya admin',
  entryAdjustment: 'Koreksi admin',
  noEntries: 'Belum ada mutasi saldo.',
  balanceAfter: 'Saldo',
  noTopups: 'Belum pernah top up.',
  reason: (note) => `Alasan: ${note}`,

  readFileFailed: 'Gagal membaca file',
  formatError: 'Format harus PNG, JPG, JPEG, atau WEBP',
  imageReadFailed: 'Gagal membaca gambar, coba file lain',
  proofRequired: 'Upload bukti transfer dulu',
  submitFailed: 'Gagal mengirim top up',
  modalTitle: 'Top Up Saldo',
  amount: 'Nominal',
  loading: 'Memuat...',
  qrisAlt: (amount) => `QRIS top up ${amount}`,
  qrisMissing: 'QRIS belum tersedia, hubungi admin ALAKA.',
  scanDynamic: 'Scan, nominal terisi otomatis, lalu upload buktinya di bawah.',
  scanStatic:
    'Scan lalu transfer sesuai nominal di atas, upload buktinya di bawah.',
  proof: 'Bukti transfer',
  processingImage: 'Memproses gambar...',
  proofPreview: 'Preview bukti transfer',
  tapToUpload: 'Tap untuk upload screenshot transfer',
  removeImage: 'Hapus gambar ini',
  sending: 'Mengirim...',
  sendProof: 'Kirim Bukti Top Up',
}

export default { en, id }
