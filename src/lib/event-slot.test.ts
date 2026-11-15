import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveSlotStatus,
  formatRemaining,
  isSlotEnabled,
  parseWibLocal,
  partnerStatusBadge,
  partnerStatusFilterKey,
  slotWindowWarnings,
  validateSlotChange,
  slotPhase,
  toWibLocal,
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

describe('deriveSlotStatus', () => {
  const now = new Date('2026-11-13T10:00:00+07:00')
  const open = {
    opensAt: new Date('2026-11-13T08:00:00+07:00'),
    closesAt: new Date('2026-11-13T18:00:00+07:00'),
  } as const
  const base = { submittedAt: null, pendingCount: 0, disanggahCount: 0, now }

  it('null kalau slot tidak aktif', () => {
    assert.equal(deriveSlotStatus({ ...base, config: null }), null)
  })

  it('belum submit: draft saat slot terbuka', () => {
    assert.equal(
      deriveSlotStatus({ ...base, config: { ...open, partnerId: 'p1' } as never }),
      'draft',
    )
  })

  it('setelah submit dengan pengajuan menunggu: terkirim', () => {
    assert.equal(
      deriveSlotStatus({
        ...base,
        submittedAt: now,
        pendingCount: 2,
        config: { ...open, partnerId: 'p1' } as never,
      }),
      'terkirim',
    )
  })

  it('tidak ada yang menunggu tapi ada barang disanggah: sanggah', () => {
    assert.equal(
      deriveSlotStatus({
        ...base,
        submittedAt: now,
        disanggahCount: 1,
        config: { ...open, partnerId: 'p1' } as never,
      }),
      'sanggah',
    )
  })

  it('selesai dicek tanpa sanggah: disetujui', () => {
    assert.equal(
      deriveSlotStatus({
        ...base,
        submittedAt: now,
        config: { ...open, partnerId: 'p1' } as never,
      }),
      'disetujui',
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

describe('partnerStatusBadge', () => {
  it('memetakan status slot ke label desain', () => {
    assert.equal(partnerStatusBadge('draft').label, 'Draft')
    assert.equal(partnerStatusBadge('belum_dibuka').label, 'Draft')
    assert.equal(partnerStatusBadge('terkirim').label, 'Pengajuan')
    assert.equal(partnerStatusBadge('sanggah').label, 'Pesanan dikembalikan')
    assert.equal(partnerStatusBadge('disetujui').tone, 'success')
    assert.equal(partnerStatusBadge(null).label, 'Draft')
  })
})

describe('partnerStatusFilterKey', () => {
  it('mengelompokkan status ke tab yang sesuai', () => {
    assert.equal(partnerStatusFilterKey('draft'), 'draft')
    assert.equal(partnerStatusFilterKey('belum_dibuka'), 'draft')
    assert.equal(partnerStatusFilterKey('terkirim'), 'pengajuan')
    assert.equal(partnerStatusFilterKey('sanggah'), 'selesai')
    assert.equal(partnerStatusFilterKey('disetujui'), 'selesai')
  })
})

describe('validateSlotChange', () => {
  const t = (iso: string) => new Date(iso)
  const current = { opensAt: t('2026-11-09T10:00:00Z'), closesAt: t('2026-11-13T10:00:00Z') }
  const first = t('2026-11-09T12:00:00Z')

  it('belum ada yang submit: bebas', () => {
    assert.equal(
      validateSlotChange({ current, next: { opensAt: null, closesAt: null }, earliestSubmittedAt: null }),
      null,
    )
  })
  it('sudah ada yang submit: tidak boleh dimatikan', () => {
    assert.match(
      validateSlotChange({ current, next: { opensAt: null, closesAt: null }, earliestSubmittedAt: first }) ?? '',
      /tidak bisa dimatikan/,
    )
  })
  it('waktu buka tidak boleh melewati submit pertama', () => {
    assert.match(
      validateSlotChange({
        current,
        next: { opensAt: t('2026-11-10T00:00:00Z'), closesAt: current.closesAt },
        earliestSubmittedAt: first,
      }) ?? '',
      /Waktu buka/,
    )
  })
  it('waktu tutup hanya boleh diperpanjang', () => {
    assert.match(
      validateSlotChange({
        current,
        next: { opensAt: current.opensAt, closesAt: t('2026-11-12T10:00:00Z') },
        earliestSubmittedAt: first,
      }) ?? '',
      /diperpanjang/,
    )
    assert.equal(
      validateSlotChange({
        current,
        next: { opensAt: t('2026-11-09T08:00:00Z'), closesAt: t('2026-11-14T10:00:00Z') },
        earliestSubmittedAt: first,
      }),
      null,
    )
  })
})

describe('slotWindowWarnings', () => {
  it('memperingatkan kalau slot tutup setelah event berakhir', () => {
    const late = new Date('2026-11-13T10:00:00Z')
    assert.equal(slotWindowWarnings({ closesAt: late, eventEndDate: '2026-11-11' }).length, 1)
  })
  it('tidak ada peringatan kalau masih di dalam event', () => {
    const ok = new Date('2026-11-11T10:00:00Z')
    assert.deepEqual(slotWindowWarnings({ closesAt: ok, eventEndDate: '2026-11-11' }), [])
    assert.deepEqual(slotWindowWarnings({ closesAt: null, eventEndDate: '2026-11-11' }), [])
  })
})
