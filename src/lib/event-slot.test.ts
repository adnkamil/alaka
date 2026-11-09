import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ORDERS_LOCKED_MESSAGE,
  allocateApproval,
  applySatuanApproval,
  approvalKind,
  assertOrdersEditable,
  bundleReviewState,
  checkCanSubmit,
  checkComponentApproval,
  componentsToReturn,
  deriveSlotStatus,
  formatRemaining,
  isSanggahExpired,
  isSlotEnabled,
  parseWibLocal,
  planReplacement,
  slotPhase,
  toWibLocal,
  validateSanggahDeadline,
  validateSlotWindow
  
} from './event-slot'
import type {SlotConfig} from './event-slot';

const at = (h: number, m = 0, s = 0) =>
  new Date(Date.UTC(2026, 10, 10, h, m, s))
const config: SlotConfig = {
  partnerId: 'p1',
  opensAt: at(10),
  closesAt: at(12),
}

describe('isSlotEnabled', () => {
  it('aktif hanya untuk event partner dengan waktu buka dan tutup terisi', () => {
    assert.equal(isSlotEnabled(config), true)
    assert.equal(isSlotEnabled({ ...config, partnerId: null }), false)
    assert.equal(isSlotEnabled({ ...config, opensAt: null }), false)
    assert.equal(isSlotEnabled({ ...config, closesAt: null }), false)
    assert.equal(isSlotEnabled(null), false)
    assert.equal(isSlotEnabled(undefined), false)
  })
})

describe('slotPhase', () => {
  it('belum dibuka, terbuka, ditutup', () => {
    assert.equal(slotPhase(config, at(9, 59, 59)), 'belum_dibuka')
    assert.equal(slotPhase(config, at(10)), 'terbuka')
    assert.equal(slotPhase(config, at(11, 59, 59)), 'terbuka')
    assert.equal(slotPhase(config, at(12)), 'ditutup')
  })
})

describe('validateSlotWindow', () => {
  it('kosong keduanya = alur lama', () => {
    assert.equal(validateSlotWindow(null, null), null)
  })
  it('harus terisi bersamaan', () => {
    assert.match(validateSlotWindow(at(10), null) ?? '', /keduanya/)
    assert.match(validateSlotWindow(null, at(10)) ?? '', /keduanya/)
  })
  it('tutup harus setelah buka', () => {
    assert.match(validateSlotWindow(at(12), at(10)) ?? '', /setelah/)
    assert.match(validateSlotWindow(at(10), at(10)) ?? '', /setelah/)
    assert.equal(validateSlotWindow(at(10), at(12)), null)
  })
})

describe('checkCanSubmit', () => {
  const base = { config, submittedAt: null, itemCount: 2, now: at(11) }
  it('lolos saat slot terbuka dan ada barang', () => {
    assert.deepEqual(checkCanSubmit(base), { ok: true })
  })
  it('ditolak sebelum slot dibuka', () => {
    const r = checkCanSubmit({ ...base, now: at(9) })
    assert.equal(r.ok, false)
  })
  it('ditolak setelah slot ditutup', () => {
    const r = checkCanSubmit({ ...base, now: at(12, 0, 1) })
    assert.equal(r.ok, false)
  })
  it('ditolak kalau sudah submit', () => {
    const r = checkCanSubmit({ ...base, submittedAt: at(10, 30) })
    assert.equal(r.ok, false)
  })
  it('ditolak kalau tidak ada barang', () => {
    const r = checkCanSubmit({ ...base, itemCount: 0 })
    assert.equal(r.ok, false)
  })
  it('ditolak untuk event tanpa alur slot', () => {
    assert.equal(checkCanSubmit({ ...base, config: null }).ok, false)
    assert.equal(
      checkCanSubmit({ ...base, config: { ...config, partnerId: null } }).ok,
      false,
    )
  })
})

describe('kunci pesanan', () => {
  it('bebas diubah sebelum submit, terkunci sesudahnya', () => {
    assert.doesNotThrow(() => assertOrdersEditable({ submittedAt: null }))
    assert.throws(
      () => assertOrdersEditable({ submittedAt: at(10, 5) }),
      new Error(ORDERS_LOCKED_MESSAGE),
    )
  })
})

describe('applySatuanApproval', () => {
  it('menyimpan permintaan asli dan memakai jumlah yang dapat', () => {
    assert.deepEqual(applySatuanApproval({ qty: 5, requestedQty: null }, 3), {
      qty: 3,
      requestedQty: 5,
    })
  })
  it('koreksi memakai permintaan asli sebagai batas atas', () => {
    assert.deepEqual(applySatuanApproval({ qty: 3, requestedQty: 5 }, 5), {
      qty: 5,
      requestedQty: 5,
    })
    assert.throws(() => applySatuanApproval({ qty: 3, requestedQty: 5 }, 6))
  })
  it('tidak dapat = 0, tidak boleh negatif atau pecahan', () => {
    assert.deepEqual(applySatuanApproval({ qty: 2, requestedQty: null }, 0), {
      qty: 0,
      requestedQty: 2,
    })
    assert.throws(() => applySatuanApproval({ qty: 2, requestedQty: null }, -1))
    assert.throws(() =>
      applySatuanApproval({ qty: 2, requestedQty: null }, 1.5),
    )
  })
})

describe('checkComponentApproval / approvalKind', () => {
  it('batas jumlah komponen', () => {
    assert.doesNotThrow(() => checkComponentApproval(2, 0))
    assert.doesNotThrow(() => checkComponentApproval(2, 2))
    assert.throws(() => checkComponentApproval(2, 3))
    assert.throws(() => checkComponentApproval(2, -1))
  })
  it('jenis hasil', () => {
    assert.equal(approvalKind(3, 3), 'dapat')
    assert.equal(approvalKind(3, 1), 'sebagian')
    assert.equal(approvalKind(3, 0), 'tidak_dapat')
  })
})

describe('bundleReviewState', () => {
  it('ok kalau semua disetujui penuh', () => {
    assert.equal(
      bundleReviewState([
        { qty: 1, approvedQty: 1 },
        { qty: 2, approvedQty: 2 },
      ]),
      'ok',
    )
  })
  it('sanggah kalau ada yang tidak atau sebagian dapat', () => {
    assert.equal(
      bundleReviewState([
        { qty: 1, approvedQty: 1 },
        { qty: 1, approvedQty: 0 },
      ]),
      'sanggah',
    )
    assert.equal(bundleReviewState([{ qty: 3, approvedQty: 2 }]), 'sanggah')
  })
  it('verifikasi kalau ada pengganti yang menunggu partner', () => {
    assert.equal(
      bundleReviewState([
        { qty: 1, approvedQty: 1 },
        { qty: 1, approvedQty: null },
      ]),
      'verifikasi',
    )
  })
  it('sanggah didahulukan dari verifikasi', () => {
    assert.equal(
      bundleReviewState([
        { qty: 1, approvedQty: 0 },
        { qty: 1, approvedQty: null },
      ]),
      'sanggah',
    )
  })
})

describe('deriveSlotStatus', () => {
  const base = {
    config,
    submittedAt: null as Date | null,
    reviewedAt: null as Date | null,
    decidedAt: null as Date | null,
    bundleStates: [] as Array<'ok' | 'sanggah' | 'verifikasi'>,
    now: at(11),
  }
  it('null untuk event tanpa alur slot', () => {
    assert.equal(deriveSlotStatus({ ...base, config: null }), null)
  })
  it('sebelum submit mengikuti fase slot', () => {
    assert.equal(deriveSlotStatus({ ...base, now: at(9) }), 'belum_dibuka')
    assert.equal(deriveSlotStatus(base), 'draft')
    assert.equal(deriveSlotStatus({ ...base, now: at(13) }), 'ditutup')
  })
  it('terkirim sampai partner selesai mengecek', () => {
    assert.equal(
      deriveSlotStatus({ ...base, submittedAt: at(10, 1) }),
      'terkirim',
    )
  })
  it('setelah dicek: sanggah, verifikasi, menyetujui, disetujui', () => {
    const reviewed = {
      ...base,
      submittedAt: at(10, 1),
      reviewedAt: at(14),
      now: at(15),
    }
    assert.equal(deriveSlotStatus(reviewed), 'disetujui')
    assert.equal(
      deriveSlotStatus({ ...reviewed, bundleStates: ['ok', 'sanggah'] }),
      'sanggah',
    )
    assert.equal(
      deriveSlotStatus({
        ...reviewed,
        bundleStates: ['sanggah', 'verifikasi'],
      }),
      'menunggu_verifikasi',
    )
    assert.equal(
      deriveSlotStatus({
        ...reviewed,
        decidedAt: at(16),
        bundleStates: ['ok'],
      }),
      'menyetujui',
    )
  })
})

describe('validateSanggahDeadline', () => {
  it('harus di masa depan', () => {
    assert.match(
      validateSanggahDeadline(at(10), at(11), null) ?? '',
      /masa depan/,
    )
    assert.equal(validateSanggahDeadline(at(12), at(11), null), null)
  })
  it('hanya boleh diperpanjang', () => {
    assert.match(
      validateSanggahDeadline(at(13), at(11), at(14)) ?? '',
      /diperpanjang/,
    )
    assert.equal(validateSanggahDeadline(at(15), at(11), at(14)), null)
  })
  it('tanggal tidak valid ditolak', () => {
    assert.match(
      validateSanggahDeadline(new Date('x'), at(11), null) ?? '',
      /tidak valid/,
    )
  })
  it('isSanggahExpired', () => {
    assert.equal(isSanggahExpired(null, at(11)), false)
    assert.equal(isSanggahExpired(at(11), at(11)), true)
    assert.equal(isSanggahExpired(at(12), at(11)), false)
  })
})

describe('planReplacement', () => {
  it('tidak dapat sama sekali: tukar varian', () => {
    assert.deepEqual(planReplacement({ qty: 2, approvedQty: 0 }, false), {
      kind: 'swap',
    })
  })
  it('dapat sebagian: pecah komponen', () => {
    assert.deepEqual(planReplacement({ qty: 3, approvedQty: 1 }, false), {
      kind: 'split',
      keepQty: 1,
      newQty: 2,
    })
  })
  it('menolak yang belum dicek, tidak bermasalah, atau varian sama', () => {
    assert.throws(() => planReplacement({ qty: 1, approvedQty: null }, false))
    assert.throws(() => planReplacement({ qty: 1, approvedQty: 1 }, false))
    assert.throws(() => planReplacement({ qty: 1, approvedQty: 0 }, true))
  })
})

describe('componentsToReturn', () => {
  it('mengembalikan yang dapat dan mencatat yang diminta', () => {
    const r = componentsToReturn([
      { qty: 1, approvedQty: 1 },
      { qty: 2, approvedQty: 1 },
      { qty: 1, approvedQty: 0 },
    ])
    assert.deepEqual(
      r.map((c) => [c.returnQty, c.requestedQty]),
      [
        [1, 1],
        [1, 2],
        [0, 1],
      ],
    )
  })
})

describe('formatRemaining', () => {
  it('format hari, jam, menit, detik', () => {
    const now = at(10)
    assert.equal(
      formatRemaining(new Date(now.getTime() + 2 * 86400e3 + 3 * 3600e3), now),
      '2 hari 3 jam',
    )
    assert.equal(
      formatRemaining(new Date(now.getTime() + 3 * 3600e3 + 12 * 60e3), now),
      '3 jam 12 mnt',
    )
    assert.equal(
      formatRemaining(new Date(now.getTime() + 5 * 60e3 + 10e3), now),
      '5 mnt 10 dtk',
    )
    assert.equal(formatRemaining(new Date(now.getTime() + 30e3), now), '30 dtk')
  })
  it('null kalau sudah lewat', () => {
    const now = at(10)
    assert.equal(formatRemaining(now, now), null)
    assert.equal(formatRemaining(new Date(now.getTime() - 1000), now), null)
  })
})

describe('allocateApproval', () => {
  const demands = [
    { key: 'b', qty: 2, at: at(10, 5) },
    { key: 'a', qty: 3, at: at(10, 1) },
    { key: 'c', qty: 1, at: at(10, 9) },
  ]
  it('membagi ke pemesan yang masuk lebih dulu', () => {
    const r = allocateApproval(demands, 4)
    assert.equal(r.get('a'), 3)
    assert.equal(r.get('b'), 1)
    assert.equal(r.get('c'), 0)
  })
  it('dapat semua dan tidak dapat sama sekali', () => {
    const all = allocateApproval(demands, 6)
    assert.deepEqual([...all.values()].sort(), [1, 2, 3])
    const none = allocateApproval(demands, 0)
    assert.deepEqual([...none.values()], [0, 0, 0])
  })
  it('waktu sama dipecah dengan key supaya hasilnya tetap', () => {
    const tie = [
      { key: 'y', qty: 1, at: at(10) },
      { key: 'x', qty: 1, at: at(10) },
    ]
    const r = allocateApproval(tie, 1)
    assert.equal(r.get('x'), 1)
    assert.equal(r.get('y'), 0)
  })
  it('menolak jumlah di luar batas', () => {
    assert.throws(() => allocateApproval(demands, 7))
    assert.throws(() => allocateApproval(demands, -1))
    assert.throws(() => allocateApproval(demands, 1.5))
  })
})

describe('parseWibLocal / toWibLocal', () => {
  it('jam dinding WIB <-> instant', () => {
    const d = parseWibLocal('2026-11-10T19:30')
    assert.equal(d?.toISOString(), '2026-11-10T12:30:00.000Z')
    assert.equal(toWibLocal(d), '2026-11-10T19:30')
  })
  it('format salah ditolak', () => {
    assert.equal(parseWibLocal(''), null)
    assert.equal(parseWibLocal('2026-11-10'), null)
    assert.equal(parseWibLocal('2026-13-40T99:99'), null)
  })
})
