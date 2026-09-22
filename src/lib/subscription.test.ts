import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PLAN_INFO,
  PRO_DURATION_DAYS,
  PRO_FEATURES,
  TRIAL_DAYS,
  addDays,
  canUseFeature,
  computeProWindow,
  featureLockedMessage,
  featuresForPlan,
  findActiveWindow,
  hadFullAccessAt,
  hasFullAccess,
  isSubscriptionActive,
  nextProWindow,
  planLabel,
  resolveEntitlement,
} from './subscription'
import type { SubscriptionWindow } from './subscription'

/**
 * Tes aturan langganan (TRIAL 30 hari / FREE / PRO).
 *
 * `subscription.ts` sengaja murni (tanpa `db`) supaya aturannya bisa diuji
 * langsung tanpa database. Jalankan dengan `pnpm test`.
 */

const NOW = new Date('2026-01-31T00:00:00.000Z')

function at(offsetDays: number) {
  return addDays(NOW, offsetDays)
}

function window(
  status: SubscriptionWindow['status'],
  startOffset: number | null,
  endOffset: number | null,
): SubscriptionWindow {
  return {
    status,
    startedAt: startOffset === null ? null : at(startOffset),
    endsAt: endOffset === null ? null : at(endOffset),
  }
}

const trialActive = { trialStartedAt: at(-20), trialEndsAt: at(10) }
const trialEnded = { trialStartedAt: at(-40), trialEndsAt: at(-10) }

describe('durasi paket', () => {
  it('trial 30 hari dan PRO 30 hari per pembelian', () => {
    assert.equal(TRIAL_DAYS, 30)
    assert.equal(PRO_DURATION_DAYS, 30)
  })
})

describe('resolveEntitlement', () => {
  it('TRIAL aktif -> plan trial, semua fitur PRO terbuka', () => {
    const entitlement = resolveEntitlement(trialActive, NOW)

    assert.equal(entitlement.plan, 'trial')
    assert.equal(entitlement.isTrial, true)
    assert.equal(entitlement.isPro, false)
    assert.equal(entitlement.proUntil, null)
    assert.equal(entitlement.trialDaysLeft, 10)
    assert.equal(hasFullAccess(entitlement), true)
    for (const feature of PRO_FEATURES) {
      assert.equal(canUseFeature(entitlement, feature), true, feature)
    }
  })

  it('FREE -> trial habis dan belum PRO, fitur PRO terkunci', () => {
    const entitlement = resolveEntitlement(trialEnded, NOW)

    assert.equal(entitlement.plan, 'free')
    assert.equal(entitlement.trialDaysLeft, 0)
    assert.equal(hasFullAccess(entitlement), false)
    for (const feature of PRO_FEATURES) {
      assert.equal(canUseFeature(entitlement, feature), false, feature)
    }
  })

  it('user lama tanpa kolom trial dianggap FREE (bukan trial abadi)', () => {
    const entitlement = resolveEntitlement(
      { trialStartedAt: null, trialEndsAt: null },
      NOW,
    )

    assert.equal(entitlement.plan, 'free')
    assert.equal(entitlement.isTrial, false)
  })

  it('trial yang berakhir tepat sekarang sudah dianggap habis', () => {
    const entitlement = resolveEntitlement(
      { trialStartedAt: at(-30), trialEndsAt: NOW },
      NOW,
    )

    assert.equal(entitlement.plan, 'free')
  })

  it('PRO aktif -> plan pro, proUntil = ends_at', () => {
    const entitlement = resolveEntitlement(
      { ...trialEnded, subscriptions: [window('active', -5, 25)] },
      NOW,
    )

    assert.equal(entitlement.plan, 'pro')
    assert.equal(entitlement.isPro, true)
    assert.equal(entitlement.isTrial, false)
    assert.equal(entitlement.proUntil?.getTime(), at(25).getTime())
    for (const feature of PRO_FEATURES) {
      assert.equal(canUseFeature(entitlement, feature), true, feature)
    }
  })

  it('PRO menang atas trial', () => {
    const entitlement = resolveEntitlement(
      { ...trialActive, subscriptions: [window('active', -1, 5)] },
      NOW,
    )

    assert.equal(entitlement.plan, 'pro')
    assert.equal(entitlement.trialDaysLeft, 0)
  })

  it('subscription yang belum/tidak sah tidak membuka fitur', () => {
    const cases: Array<SubscriptionWindow> = [
      window('pending', -1, 10),
      window('rejected', -1, 10),
      window('expired', -20, -5),
      window('active', -20, -1),
      window('active', -1, null),
    ]

    for (const subscription of cases) {
      const entitlement = resolveEntitlement(
        { ...trialEnded, subscriptions: [subscription] },
        NOW,
      )
      assert.equal(entitlement.plan, 'free', JSON.stringify(subscription))
    }
  })

  it('beberapa baris aktif -> dipakai yang masa berlakunya paling jauh', () => {
    const entitlement = resolveEntitlement(
      {
        ...trialEnded,
        subscriptions: [window('active', -10, 10), window('active', -1, 60)],
      },
      NOW,
    )

    assert.equal(entitlement.proUntil?.getTime(), at(60).getTime())
  })
})

describe('isSubscriptionActive & findActiveWindow', () => {
  it('active tanpa ends_at tidak dianggap aktif', () => {
    assert.equal(isSubscriptionActive(window('active', -1, null), NOW), false)
  })

  it('findActiveWindow mengembalikan null kalau tidak ada yang aktif', () => {
    assert.equal(findActiveWindow([window('pending', -1, 10)], NOW), null)
  })
})

describe('peta fitur per plan', () => {
  it('TRIAL & PRO = semua fitur true, FREE = semua false', () => {
    for (const feature of PRO_FEATURES) {
      assert.equal(featuresForPlan('trial')[feature], true, feature)
      assert.equal(featuresForPlan('pro')[feature], true, feature)
      assert.equal(featuresForPlan('free')[feature], false, feature)
    }
  })

  it('pesan terkunci menyebut nama fitur dan paket PRO', () => {
    const message = featureLockedMessage('billing')

    assert.match(message, /Tagih/)
    assert.match(message, /PRO/)
  })
})

describe('grandfathering (hadFullAccessAt)', () => {
  it('pesanan yang dibuat waktu trial masih jalan tetap boleh dibuka', () => {
    assert.equal(hadFullAccessAt(trialEnded, at(-20)), true)
  })

  it('pesanan yang dibuat setelah trial habis ditolak', () => {
    assert.equal(hadFullAccessAt(trialEnded, at(-5)), false)
  })

  it('masa PRO lama tetap dihitung walau sekarang sudah lewat', () => {
    const subscriptions = [window('active', -60, -30)]

    assert.equal(
      hadFullAccessAt({ ...trialEnded, subscriptions }, at(-40)),
      true,
    )
    assert.equal(hadFullAccessAt({ ...trialEnded, subscriptions }, NOW), false)
  })
})

describe('perpanjangan PRO (anti reset)', () => {
  it('belum pernah PRO -> mulai sekarang, 30 hari', () => {
    const proWindow = computeProWindow({ now: NOW })

    assert.equal(proWindow.startedAt.getTime(), NOW.getTime())
    assert.equal(proWindow.endsAt.getTime(), at(30).getTime())
  })

  it('masih PRO -> ditambah dari sisa masa, bukan dari sekarang', () => {
    const proWindow = computeProWindow({ currentEndsAt: at(5), now: NOW })

    assert.equal(proWindow.startedAt.getTime(), at(5).getTime())
    assert.equal(proWindow.endsAt.getTime(), at(35).getTime())
  })

  it('masa PRO sudah lewat -> mulai sekarang lagi', () => {
    const proWindow = computeProWindow({ currentEndsAt: at(-1), now: NOW })

    assert.equal(proWindow.startedAt.getTime(), NOW.getTime())
    assert.equal(proWindow.endsAt.getTime(), at(30).getTime())
  })

  it('nextProWindow menghitung dari histori subscription user', () => {
    const proWindow = nextProWindow([window('active', -5, 5)], undefined, NOW)

    assert.equal(proWindow.startedAt.getTime(), at(5).getTime())
    assert.equal(proWindow.endsAt.getTime(), at(35).getTime())
  })
})

describe('label plan buat UI', () => {
  it('label tiap plan sesuai yang ditampilkan di aplikasi', () => {
    assert.equal(planLabel('trial'), 'Trial')
    assert.equal(planLabel('free'), 'FREE')
    assert.equal(planLabel('pro'), 'PRO')
  })

  it('tiap plan punya keterangan buat halaman paket', () => {
    for (const plan of ['trial', 'free', 'pro'] as const) {
      assert.ok(PLAN_INFO[plan].description.length > 0)
    }
  })
})
