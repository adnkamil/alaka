import { UI_TEXT_ID } from '../../../components/ui/ui-text'
import type { UiText } from '../../../components/ui/ui-text'

/** Teks komponen UI bersama (Pagination, SortHeader) di Partner Portal. */

const en: UiText = {
  perPage: 'per page',
  perPageLabel: 'Rows per page',
  prevPage: 'Previous page',
  currentPage: 'Current page',
  ofPages: (total) => `of ${total}`,
  nextPage: 'Next page',
  pageJump: 'Page',
  pageJumpLabel: 'Go to page',
  numberLocale: 'en-GB',
  sortBy: (label) => `Sort by ${label}`,
  sortByNext: (label, next) =>
    `Sort by ${label} (${{ asc: 'ascending', desc: 'descending', none: 'default' }[next]})`,
  close: 'Close',
  closeNotification: 'Close notification',
}

const id: UiText = UI_TEXT_ID

export default { en, id }
