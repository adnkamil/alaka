/** Cek stok otomatis & cek manual submit jastiper (PartnerSubmitReview). */

const en = {
  stoppedByError: 'The check stopped because of a problem.',
  stopFailed: 'Could not stop',
  loading: 'Loading submissions…',
  loadFailed: 'Could not load submissions.',
  progress: (processed: number, total: number) =>
    `${processed} of ${total} submissions`,
  checkingProgress: (progress: string) => `Checking ${progress}…`,
  pendingCount: (count: number) => `${count} submissions not checked yet`,
  allChecked: 'All submissions have been checked',
  resumeAuto: 'Resume automatic check',
  startAuto: 'Automatic stock check',
  stop: 'Stop',
  pausedNote: 'The check stopped midway. Resume to check the rest.',
  newAfterDone: (count: number) =>
    `${count} new submissions came in after the last check. Press automatic stock check to check them.`,
  noSubmissions: 'No submissions from jastipers yet.',
  stopping: 'Stopping the check…',
  checking: (processed: number, total: number) =>
    `Checking ${processed} of ${total} submissions`,
  busyHint: 'You can keep this page open. The jastiper list updates too.',
  errorTitle: 'The check stopped because of a problem',
  interruptedTitle: (processed: number, total: number) =>
    `The check stopped at ${processed} of ${total}`,
  interruptedHint: (pending: number) =>
    `${pending} submissions are still waiting. Resume to check the rest.`,
  pendingTitle: (pending: number) =>
    `${pending} submissions waiting for a stock check`,
  pendingHintNew: 'New submissions came in after the last check.',
  pendingHint:
    'Remaining stock is allocated automatically to submissions in the order they arrived.',
  doneHint: (count: number) =>
    `${count} submissions were checked automatically.`,
  retry: 'Try again',
  resume: 'Resume',
  saveFailed: 'Could not save',
  cancelFailed: 'Could not cancel',
  submitNo: (no: number) => `Submission #${no}`,
  otherPending: (list: string) =>
    `this jastiper still has pending items in submission ${list}`,
  partiallyApproved: 'Partially approved',
  cancelConfirm: 'Cancel this item? The stock will return to the catalog.',
  cancelledByPartner: 'Cancelled by partner',
  doneChecking: 'Done checking',
  beingChecked: 'Being checked',
  checked: 'Checked',
  rowWaiting: 'Waiting for check',
  rowApproved: 'Approved',
  rowShort: 'Short',
  rowCancelled: 'Cancelled',
  bundleSuffix: ' (bundle)',
  stockLabel: (qty: number) => `Stock ${qty}`,
  approvedQtyFor: (item: string) => `Approved quantity for ${item}`,
  cancelItem: 'Cancel',
}

const id: typeof en = {
  stoppedByError: 'Pengecekan berhenti karena gangguan.',
  stopFailed: 'Gagal menghentikan',
  loading: 'Memuat pengajuan…',
  loadFailed: 'Gagal memuat pengajuan.',
  progress: (processed, total) => `${processed} dari ${total} pengajuan`,
  checkingProgress: (progress) => `Sedang mengecek ${progress}…`,
  pendingCount: (count) => `${count} pengajuan belum dicek`,
  allChecked: 'Semua pengajuan sudah dicek',
  resumeAuto: 'Lanjutkan cek otomatis',
  startAuto: 'Cek stok otomatis',
  stop: 'Hentikan',
  pausedNote:
    'Pengecekan berhenti di tengah. Lanjutkan untuk mengecek sisanya.',
  newAfterDone: (count) =>
    `Ada ${count} pengajuan baru yang masuk setelah pengecekan terakhir. Tekan cek stok otomatis untuk mengecek.`,
  noSubmissions: 'Belum ada pengajuan dari jastiper.',
  stopping: 'Menghentikan pengecekan…',
  checking: (processed, total) =>
    `Mengecek ${processed} dari ${total} pengajuan`,
  busyHint: 'Halaman boleh tetap dibuka. Daftar jastiper ikut diperbarui.',
  errorTitle: 'Pengecekan berhenti karena gangguan',
  interruptedTitle: (processed, total) =>
    `Pengecekan berhenti di ${processed} dari ${total}`,
  interruptedHint: (pending) =>
    `${pending} pengajuan masih menunggu. Lanjutkan untuk mengecek sisanya.`,
  pendingTitle: (pending) => `${pending} pengajuan menunggu dicek stok`,
  pendingHintNew: 'Pengajuan baru masuk setelah pengecekan terakhir.',
  pendingHint: 'Sisa stok dibagi otomatis ke pengajuan sesuai urutan masuk.',
  doneHint: (count) => `${count} pengajuan selesai dicek otomatis.`,
  retry: 'Coba lagi',
  resume: 'Lanjutkan',
  saveFailed: 'Gagal menyimpan',
  cancelFailed: 'Gagal membatalkan',
  submitNo: (no) => `Submit ke-${no}`,
  otherPending: (list) =>
    `jastiper ini masih memiliki barang pengajuan di submit ke ${list}`,
  partiallyApproved: 'Sebagian disetujui',
  cancelConfirm: 'Batalkan item ini? Stok akan kembali ke katalog.',
  cancelledByPartner: 'Dibatalkan partner',
  doneChecking: 'Selesai dicek',
  beingChecked: 'Sedang dicek',
  checked: 'Sudah dicek',
  rowWaiting: 'Menunggu dicek',
  rowApproved: 'Disetujui',
  rowShort: 'Kurang',
  rowCancelled: 'Dibatalkan',
  bundleSuffix: ' (paket)',
  stockLabel: (qty) => `Stok ${qty}`,
  approvedQtyFor: (item) => `Jumlah disetujui untuk ${item}`,
  cancelItem: 'Batalkan',
}

export default { en, id }
