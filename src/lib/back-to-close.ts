import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import type { ShouldBlockFn } from '@tanstack/react-router'

/**
 * Bikin tombol **back** (HP/browser) menutup modal, bukan meninggalkan halaman.
 *
 * Modal di aplikasi ini disimpan sebagai state lokal (bukan URL), jadi back
 * langsung mem-pop history dan user "ketendang" ke halaman sebelumnya padahal
 * ekspektasinya modalnya yang tertutup. Hook ini memakai `useBlocker` TanStack
 * Router: selama modal terbuka, navigasi BACK ditahan dulu — URL & history tetap
 * di halaman yang sama — lalu `onClose` dipanggil.
 *
 * Catatan:
 * - Modal yang dibuka lewat URL (sheet Tambah/Edit Pesanan di halaman event,
 *   lihat `lib/order-sheet-search.ts`) TIDAK pakai hook ini — back cukup
 *   mengembalikan search param-nya, jadi jangan dobel.
 * - Cuma modal paling atas yang mengambil alih back (lihat `isTopmostOpenModal`),
 *   jadi kalau ada modal bertumpuk, back menutup satu per satu dari yang paling
 *   atas.
 */

/** Modal yang sedang terbuka, urut waktu dibuka (paling akhir = paling atas). */
const openModals: Array<symbol> = []

/** Daftarkan modal terbuka. Idempoten — aman dipanggil ulang. */
export function registerOpenModal(id: symbol) {
  if (!openModals.includes(id)) openModals.push(id)
}

/** Hapus modal dari daftar (waktu ditutup atau komponennya unmount). */
export function unregisterOpenModal(id: symbol) {
  const index = openModals.indexOf(id)
  if (index >= 0) openModals.splice(index, 1)
}

/** Cuma modal paling atas yang boleh mengambil alih tombol back. */
export function isTopmostOpenModal(id: symbol) {
  return openModals[openModals.length - 1] === id
}

export function useBackToClose(open: boolean, onClose: () => void) {
  const [id] = useState(() => Symbol('back-to-close'))

  // `onClose` disimpan di ref supaya blocker-nya tidak perlu didaftar ulang tiap
  // render (`useBlocker` mendaftar ulang kalau identitas fungsinya berubah).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    registerOpenModal(id)
    return () => unregisterOpenModal(id)
  }, [open, id])

  const shouldBlockFn = useCallback<ShouldBlockFn>(
    ({ action }) => {
      // Cuma BACK (tombol back / swipe) yang diambil alih. Navigasi lain — mis.
      // pindah halaman sesudah menyimpan, atau `history.go()` dari kode —
      // dibiarkan jalan seperti biasa.
      if (action !== 'BACK') return false
      if (!isTopmostOpenModal(id)) return false
      onCloseRef.current()
      return true
    },
    [id],
  )

  useBlocker({
    disabled: !open,
    // Jangan sampai browser nanya "yakin mau keluar?" waktu tab di-refresh atau
    // ditutup — yang ditangani cuma tombol back.
    enableBeforeUnload: false,
    shouldBlockFn,
  })
}
