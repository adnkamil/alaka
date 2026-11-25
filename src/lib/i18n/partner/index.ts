import type { PartnerLocale } from '../../partner-locale'
import analytics from './analytics'
import bundle from './bundle'
import catalog from './catalog'
import check from './check'
import common from './common'
import credit from './credit'
import event from './event'
import eventDetail from './eventDetail'
import invoice from './invoice'
import productRule from './productRule'
import profile from './profile'
import recap from './recap'
import review from './review'
import shell from './shell'
import stock from './stock'
import ui from './ui'
import variant from './variant'

/**
 * Kamus Partner Portal. Tiap namespace punya file sendiri berisi `en` (sumber
 * kebenaran) dan `id: typeof en` — kunci yang kurang/lebih jadi error tipe.
 * Teks dengan angka/nama ditulis sebagai fungsi, mis. `count(n)`.
 */
const en = {
  shell: shell.en,
  common: common.en,
  profile: profile.en,
  analytics: analytics.en,
  ui: ui.en,
  event: event.en,
  eventDetail: eventDetail.en,
  invoice: invoice.en,
  stock: stock.en,
  review: review.en,
  recap: recap.en,
  check: check.en,
  credit: credit.en,
  catalog: catalog.en,
  variant: variant.en,
  productRule: productRule.en,
  bundle: bundle.en,
}

export type PartnerDict = typeof en

const id: PartnerDict = {
  shell: shell.id,
  common: common.id,
  profile: profile.id,
  analytics: analytics.id,
  ui: ui.id,
  event: event.id,
  eventDetail: eventDetail.id,
  invoice: invoice.id,
  stock: stock.id,
  review: review.id,
  recap: recap.id,
  check: check.id,
  credit: credit.id,
  catalog: catalog.id,
  variant: variant.id,
  productRule: productRule.id,
  bundle: bundle.id,
}

export const partnerDictionaries: Record<PartnerLocale, PartnerDict> = {
  en,
  id,
}
