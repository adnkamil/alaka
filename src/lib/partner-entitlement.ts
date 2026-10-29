// Cek akses PRO untuk akun partner. Memakai fungsi murni dari subscription.ts
// (findActiveWindow), tanpa menyentuh langganan brand jastiper.

import { findActiveWindow, type SubscriptionWindow } from './subscription'

/** Fitur partner yang dikunci di balik PRO. */
export const PARTNER_PRO_FEATURES = ['partner_variants'] as const
export type PartnerProFeature = (typeof PARTNER_PRO_FEATURES)[number]

/**
 * Partner punya akses PRO kalau ada langganan partner yang aktif dan belum
 * habis masa berlakunya. Fungsi ini tidak tahu apa-apa soal brand jastiper.
 */
export function hasPartnerPro(
  subscriptions: Array<SubscriptionWindow>,
  now: Date = new Date(),
): boolean {
  return findActiveWindow(subscriptions, now) !== null
}

/**
 * Apakah partner boleh memakai fitur tertentu. Saat ini semua fitur partner
 * masih dikunci PRO, jadi fungsi ini sama dengan hasPartnerPro. Disediakan
 * sebagai titik tunggal kalau nanti ada fitur yang berbeda aturannya.
 */
export function canUsePartnerFeature(
  feature: PartnerProFeature,
  subscriptions: Array<SubscriptionWindow>,
  now: Date = new Date(),
): boolean {
  return PARTNER_PRO_FEATURES.includes(feature) && hasPartnerPro(subscriptions, now)
}
