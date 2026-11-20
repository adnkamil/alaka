import { useState } from 'react'
import { nextSort } from './table-sort'
import type { SortState } from './table-sort'

/** State sort satu tabel: `toggle(key)` memutar asc → desc → normal. */
export function useTableSort<TKey extends string>() {
  const [sort, setSort] = useState<SortState<TKey>>(null)
  return {
    sort,
    toggle: (key: TKey) => setSort((current) => nextSort(current, key)),
  }
}
