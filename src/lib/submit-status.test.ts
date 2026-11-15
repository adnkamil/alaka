import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bundleRowStatusAfterReview,
  billableQty,
  bundleState,
  isBillable,
  isDeleteLocked,
  isQtyLocked,
  nextSubmitNo,
  pendingSubmitNotice,
  splitReview,
  submitLabel,
} from './submit-status'

describe('kunci baris setelah submit', () => {
  it('baris belum disubmit boleh diubah qty', () => {
    assert.equal(isQtyLocked({ qty: 3, status: null }), false)
    assert.equal(isDeleteLocked({ qty: 3, status: null }), false)
  })

  it('baris yang sudah berstatus apa pun terkunci qty dan hapus', () => {
    for (const status of ['pengajuan', 'disetujui', 'disanggah'] as const) {
      assert.equal(isQtyLocked({ qty: 3, status }), true)
      assert.equal(isDeleteLocked({ qty: 3, status }), true)
    }
  })
})

describe('tagihan', () => {
  it('hanya baris disetujui yang ditagih', () => {
    assert.equal(isBillable({ qty: 1, status: 'disetujui' }), true)
    assert.equal(isBillable({ qty: 1, status: 'pengajuan' }), false)
    assert.equal(isBillable({ qty: 1, status: 'disanggah' }), false)
    assert.equal(isBillable({ qty: 1, status: null }), false)
  })

  it('total pcs tagihan menjumlahkan yang disetujui saja', () => {
    const lines = [
      { qty: 2, status: 'disetujui' as const },
      { qty: 1, status: 'disanggah' as const },
      { qty: 3, status: 'pengajuan' as const },
      { qty: 4, status: 'disetujui' as const },
    ]
    assert.equal(billableQty(lines), 6)
  })
})

describe('splitReview', () => {
  it('disetujui penuh: tidak ada bagian disanggah', () => {
    assert.deepEqual(splitReview(3, 3), { approved: 3, rejected: 0 })
  })

  it('sebagian: 2 dari 3 pcs disetujui, 1 disanggah', () => {
    assert.deepEqual(splitReview(3, 2), { approved: 2, rejected: 1 })
  })

  it('tidak disetujui sama sekali', () => {
    assert.deepEqual(splitReview(3, 0), { approved: 0, rejected: 3 })
  })

  it('menolak jumlah di luar rentang', () => {
    assert.throws(() => splitReview(3, 4))
    assert.throws(() => splitReview(3, -1))
    assert.throws(() => splitReview(3, 1.5))
    assert.throws(() => splitReview(0, 0))
  })
})

describe('status paket', () => {
  it('belum disubmit kalau semua komponen belum punya status', () => {
    assert.equal(
      bundleState([
        { qty: 1, status: null },
        { qty: 2, status: null },
      ]),
      'belum_disubmit',
    )
  })

  it('pengajuan kalau ada komponen yang menunggu cek', () => {
    assert.equal(
      bundleState([
        { qty: 2, status: 'disetujui' },
        { qty: 1, status: 'pengajuan' },
      ]),
      'pengajuan',
    )
  })

  it('sanggah kalau ada yang disanggah dan tidak ada yang menunggu', () => {
    assert.equal(
      bundleState([
        { qty: 2, status: 'disetujui' },
        { qty: 1, status: 'disanggah' },
      ]),
      'sanggah',
    )
  })

  it('lengkap kalau semua komponen disetujui', () => {
    assert.equal(
      bundleState([
        { qty: 2, status: 'disetujui' },
        { qty: 1, status: 'disetujui' },
      ]),
      'lengkap',
    )
  })
})

describe('nomor submit', () => {
  it('submit pertama bernomor 1, berikutnya lanjut', () => {
    assert.equal(nextSubmitNo([]), 1)
    assert.equal(nextSubmitNo([1]), 2)
    assert.equal(nextSubmitNo([1, 2, 4]), 5)
  })

  it('label kolom submit', () => {
    assert.equal(submitLabel(2), 'Submit ke-2')
  })
})

describe('info pengajuan tersisa', () => {
  it('tidak ada info kalau tidak ada pengajuan lain', () => {
    assert.equal(pendingSubmitNotice([]), null)
  })

  it('menyebut submit yang masih punya pengajuan, urut dan tanpa duplikat', () => {
    assert.equal(
      pendingSubmitNotice([3, 2, 3]),
      'jastiper ini masih memiliki barang pengajuan di submit ke 2, 3',
    )
  })
})

describe('status baris paket setelah cek', () => {
  it('ada komponen disanggah: paket tidak ditagih', () => {
    assert.equal(
      bundleRowStatusAfterReview([
        { submitStatus: 'disanggah' },
        { submitStatus: 'disanggah' },
      ]),
      'disanggah',
    )
  })

  it('tanpa komponen disanggah: tetap ditagih seperti biasa', () => {
    assert.equal(bundleRowStatusAfterReview([{ submitStatus: 'disetujui' }]), null)
    assert.equal(bundleRowStatusAfterReview([{ submitStatus: null }]), null)
  })
})
