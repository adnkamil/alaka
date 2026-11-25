import { createContext, useContext } from 'react'

/**
 * Teks komponen UI bersama (paginasi, header urut). Default bahasa Indonesia
 * untuk seluruh app; Partner Portal menyuplai versi bahasa aktif lewat
 * `UiTextContext.Provider` di `PartnerI18nProvider`.
 */
export interface UiText {
  perPage: string
  perPageLabel: string
  prevPage: string
  currentPage: string
  ofPages: (total: string) => string
  nextPage: string
  pageJump: string
  pageJumpLabel: string
  numberLocale: string
  sortBy: (label: string) => string
  sortByNext: (label: string, next: 'asc' | 'desc' | 'none') => string
  close: string
  closeNotification: string
}

export const UI_TEXT_ID: UiText = {
  perPage: 'per halaman',
  perPageLabel: 'Jumlah data per halaman',
  prevPage: 'Halaman sebelumnya',
  currentPage: 'Halaman saat ini',
  ofPages: (total) => `dari ${total}`,
  nextPage: 'Halaman berikutnya',
  pageJump: 'Halaman',
  pageJumpLabel: 'Loncat ke halaman',
  numberLocale: 'id-ID',
  sortBy: (label) => `Urutkan ${label}`,
  sortByNext: (label, next) =>
    `Urutkan ${label} (${{ asc: 'naik', desc: 'turun', none: 'normal' }[next]})`,
  close: 'Tutup',
  closeNotification: 'Tutup notifikasi',
}

export const UiTextContext = createContext<UiText>(UI_TEXT_ID)

export function useUiText() {
  return useContext(UiTextContext)
}
