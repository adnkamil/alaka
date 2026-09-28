import { queryOptions } from '@tanstack/react-query'
import { fetchCurrentUser } from './auth-functions'

/**
 * Satu definisi query "current-user" yang dipakai bersama (guard `_app` dan
 * `admin` di beforeLoad, plus loader halaman). Query key yang sama dengan
 * salinan lokal di tiap route, jadi cache-nya tetap satu.
 */
export const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})
