import { useState } from 'react'
import { DEFAULT_PAGE_SIZE, pageCount } from './pagination'

/**
 * Paginasi di sisi klien untuk tabel yang datanya sudah ada di browser.
 * Mengembalikan baris halaman aktif dan props siap pakai untuk toolbar.
 */
export function useClientPager<T>(rows: Array<T>) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const totalPages = pageCount(rows.length, pageSize)
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  return {
    paged,
    /** Kembali ke halaman 1, dipanggil saat kata cari berubah. */
    resetPage: () => setPage(1),
    pager: {
      page: safePage,
      pageSize,
      total: rows.length,
      onPageChange: setPage,
      onPageSizeChange: (size: number) => {
        setPageSize(size)
        setPage(1)
      },
    },
  }
}
