import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analyzeHoles,
  compareCheckQueue,
  holesToWaiveForInvoice,
  replacementGroups,
  validateReplacement,
  validateWaive,
} from './submit-replacement'
import type { Hole, ReplacementRow } from './submit-replacement'

function row(over: Partial<ReplacementRow>): ReplacementRow {
  return {
    id: 'r',
    kind: 'komponen',
    submissionId: 's1',
    status: 'disetujui',
    qty: 1,
    replacesId: null,
    waivedAt: null,
    ...over,
  }
}

function hole(over: Partial<Hole>): Hole {
  return {
    id: 'h',
    kind: 'komponen',
    submissionId: 's1',
    qty: 1,
    status: 'perlu_keputusan',
    openQty: 1,
    fromPaket: true,
    blocking: true,
    replacements: [],
    ...over,
  }
}

describe('analyzeHoles', () => {
  it('komponen disanggah tanpa keputusan menahan tagihan', () => {
    const [h, ...rest] = analyzeHoles([
      row({ id: 'a' }),
      row({ id: 'c', status: 'disanggah', qty: 2 }),
    ])
    assert.equal(rest.length, 0)
    assert.equal(h.id, 'c')
    assert.equal(h.status, 'perlu_keputusan')
    assert.equal(h.openQty, 2)
    assert.equal(h.blocking, true)
  })

  it('satuan disanggah tidak menahan tagihan', () => {
    const [h] = analyzeHoles([
      row({ id: 'x', kind: 'satuan', status: 'disanggah' }),
    ])
    assert.equal(h.status, 'perlu_keputusan')
    assert.equal(h.blocking, false)
  })

  it('pengganti yang belum dicek: menunggu cek, tidak menahan', () => {
    const [h] = analyzeHoles([
      row({ id: 'c', status: 'disanggah' }),
      row({ id: 'd', submissionId: 's2', status: 'pengajuan', replacesId: 'c' }),
    ])
    assert.equal(h.status, 'menunggu_cek')
    assert.equal(h.openQty, 0)
    assert.equal(h.blocking, false)
    assert.deepEqual(h.replacements.map((r) => r.id), ['d'])
  })

  it('pengganti disetujui (sudah jadi satuan): diganti', () => {
    const [h] = analyzeHoles([
      row({ id: 'c', status: 'disanggah' }),
      row({ id: 'd', kind: 'satuan', submissionId: 's2', replacesId: 'c' }),
    ])
    assert.equal(h.status, 'diganti')
  })

  it('pengganti sebagian: sisanya masih perlu keputusan', () => {
    const [h] = analyzeHoles([
      row({ id: 'c', status: 'disanggah', qty: 3 }),
      row({ id: 'd', submissionId: 's2', status: 'pengajuan', qty: 1, replacesId: 'c' }),
    ])
    assert.equal(h.status, 'perlu_keputusan')
    assert.equal(h.openQty, 2)
    assert.equal(h.blocking, true)
  })

  it('pengganti (satuan) disanggah lagi menjadi lubang baru yang menahan', () => {
    const holes = analyzeHoles([
      row({ id: 'c', status: 'disanggah' }),
      row({
        id: 'd',
        kind: 'satuan',
        submissionId: 's2',
        status: 'disanggah',
        replacesId: 'c',
      }),
    ])
    const byId = new Map(holes.map((h) => [h.id, h]))
    assert.equal(byId.get('c')!.status, 'diganti')
    assert.equal(byId.get('c')!.blocking, false)
    assert.equal(byId.get('d')!.status, 'perlu_keputusan')
    assert.equal(byId.get('d')!.blocking, true)
  })

  it('rantai pengganti berlapis tetap dianggap dari paket', () => {
    const holes = analyzeHoles([
      row({ id: 'c', status: 'disanggah' }),
      row({ id: 'd', kind: 'satuan', status: 'disanggah', replacesId: 'c' }),
      row({ id: 'e', kind: 'satuan', status: 'disanggah', replacesId: 'd' }),
    ])
    const e = holes.find((h) => h.id === 'e')!
    assert.equal(e.fromPaket, true)
    assert.equal(e.blocking, true)
  })

  it('pengganti satuan biasa yang disanggah tidak menahan', () => {
    const holes = analyzeHoles([
      row({ id: 'x', kind: 'satuan', status: 'disanggah' }),
      row({ id: 'y', kind: 'satuan', status: 'disanggah', replacesId: 'x' }),
    ])
    assert.equal(holes.find((h) => h.id === 'y')!.blocking, false)
  })

  it('pengganti yang sudah dipaketkan ulang (jadi komponen) tetap menutup lubang', () => {
    const [h] = analyzeHoles([
      row({ id: 'c', status: 'disanggah', qty: 2 }),
      row({ id: 'd1', kind: 'satuan', submissionId: 's2', qty: 1, replacesId: 'c' }),
      row({ id: 'd2', kind: 'komponen', submissionId: 's2', qty: 1, replacesId: 'c' }),
    ])
    assert.equal(h.status, 'diganti')
    assert.equal(h.openQty, 0)
  })

  it('pengganti dibatalkan partner membuka lubang lagi', () => {
    const [h] = analyzeHoles([
      row({ id: 'c', status: 'disanggah' }),
      row({ id: 'd', submissionId: 's2', status: 'dibatalkan', replacesId: 'c' }),
    ])
    assert.equal(h.status, 'perlu_keputusan')
    assert.equal(h.openQty, 1)
  })

  it('tidak diganti: tertutup walau tanpa pengganti', () => {
    const [h] = analyzeHoles([
      row({ id: 'c', status: 'disanggah', waivedAt: new Date() }),
    ])
    assert.equal(h.status, 'tidak_diganti')
    assert.equal(h.openQty, 0)
    assert.equal(h.blocking, false)
  })
})

describe('replacementGroups', () => {
  it('submit belum dicek (termasuk dibuka lagi): menunggu dicek', () => {
    const groups = replacementGroups({
      submits: [{ id: 's1', checked: false }],
      holes: [],
    })
    assert.equal(groups.get('s1')!.state, 'menunggu_dicek')
  })

  it('submit dicek tanpa lubang yang menahan: siap', () => {
    const groups = replacementGroups({
      submits: [{ id: 's1', checked: true }],
      holes: [hole({ id: 'x', kind: 'satuan', blocking: false })],
    })
    assert.equal(groups.get('s1')!.state, 'siap')
  })

  it('lubang isi paket yang belum diputuskan: menunggu keputusan', () => {
    const groups = replacementGroups({
      submits: [
        { id: 's1', checked: true },
        { id: 's2', checked: true },
      ],
      holes: [hole({ id: 'c', submissionId: 's1' })],
    })
    assert.equal(groups.get('s1')!.state, 'menunggu_keputusan')
    assert.deepEqual(groups.get('s1')!.blockingHoleIds, ['c'])
    assert.equal(groups.get('s2')!.state, 'siap')
  })

  it('belum dicek lebih dulu daripada menunggu keputusan', () => {
    const groups = replacementGroups({
      submits: [{ id: 's1', checked: false }],
      holes: [hole({ id: 'c', submissionId: 's1' })],
    })
    assert.equal(groups.get('s1')!.state, 'menunggu_dicek')
  })
})

describe('validateReplacement', () => {
  const ok = { qty: 1, groupInvoiced: false, variantAllowed: true }

  it('boleh untuk lubang yang masih terbuka', () => {
    assert.equal(validateReplacement({ ...ok, hole: hole({}) }), null)
  })

  it('menolak kalau submit sudah ditagih', () => {
    assert.match(
      validateReplacement({ ...ok, hole: hole({}), groupInvoiced: true })!,
      /sudah ditagih/,
    )
  })

  it('menolak jumlah melebihi sisa lubang', () => {
    assert.equal(
      validateReplacement({ ...ok, qty: 3, hole: hole({ qty: 3, openQty: 2 }) }),
      'Jumlah pengganti maksimal 2 pcs.',
    )
  })

  it('menolak lubang yang sudah tertutup', () => {
    assert.equal(
      validateReplacement({ ...ok, hole: hole({ status: 'menunggu_cek', openQty: 0 }) }),
      'Barang ini sudah punya pengganti.',
    )
    assert.match(
      validateReplacement({ ...ok, hole: hole({ status: 'tidak_diganti', openQty: 0 }) })!,
      /tidak diganti/,
    )
  })

  it('menolak jumlah bukan bilangan bulat positif', () => {
    assert.match(validateReplacement({ ...ok, qty: 0, hole: hole({}) })!, /lebih dari 0/)
    assert.match(validateReplacement({ ...ok, qty: 1.5, hole: hole({}) })!, /lebih dari 0/)
  })

  it('menolak varian di luar aturan paket', () => {
    assert.match(
      validateReplacement({ ...ok, variantAllowed: false, hole: hole({}) })!,
      /aturan paket/,
    )
  })
})

describe('validateWaive', () => {
  it('boleh untuk lubang terbuka, termasuk yang sudah diganti sebagian', () => {
    assert.equal(validateWaive({ hole: hole({}), groupInvoiced: false }), null)
    assert.equal(
      validateWaive({ hole: hole({ qty: 3, openQty: 1 }), groupInvoiced: false }),
      null,
    )
  })

  it('menolak lubang yang sudah tertutup penuh', () => {
    assert.match(
      validateWaive({ hole: hole({ status: 'diganti', openQty: 0 }), groupInvoiced: false })!,
      /sudah punya pengganti/,
    )
  })
})

describe('holesToWaiveForInvoice', () => {
  it('mengembalikan lubang yang menahan tagihan', () => {
    const groups = replacementGroups({
      submits: [{ id: 's1', checked: true }],
      holes: [hole({ id: 'c' })],
    })
    assert.deepEqual(holesToWaiveForInvoice(groups.get('s1')!), ['c'])
  })

  it('menolak kalau pengganti belum dicek', () => {
    const groups = replacementGroups({
      submits: [{ id: 's1', checked: false }],
      holes: [],
    })
    assert.throws(() => holesToWaiveForInvoice(groups.get('s1')!), /Cek dulu/)
  })
})

describe('compareCheckQueue', () => {
  const t = (n: number) => new Date(2026, 10, 19, 10, n)

  it('submit dibuka lagi didahulukan, yang lebih dulu dibuka lebih dulu', () => {
    const rows = [
      { id: 'a', queueSeq: 1, reopenedAt: null, checked: false },
      { id: 'b', queueSeq: 5, reopenedAt: t(2), checked: false },
      { id: 'c', queueSeq: 2, reopenedAt: null, checked: false },
      { id: 'd', queueSeq: 4, reopenedAt: t(1), checked: false },
    ]
    assert.deepEqual(
      rows.sort(compareCheckQueue).map((r) => r.id),
      ['d', 'b', 'a', 'c'],
    )
  })

  it('submit yang sudah dicek kembali ke urutan masuknya', () => {
    const rows = [
      { id: 'a', queueSeq: 1, reopenedAt: null, checked: true },
      { id: 'b', queueSeq: 5, reopenedAt: t(1), checked: true },
      { id: 'c', queueSeq: 2, reopenedAt: null, checked: false },
      { id: 'd', queueSeq: 4, reopenedAt: t(2), checked: false },
    ]
    assert.deepEqual(
      rows.sort(compareCheckQueue).map((r) => r.id),
      ['d', 'a', 'c', 'b'],
    )
  })
})
