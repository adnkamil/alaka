import { queryOptions } from '@tanstack/react-query'
import {
  fetchAdminCalendarEvents,
  fetchCalendarEventParticipants,
} from './calendar-events-admin-functions'
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

/** Semua event kalender untuk halaman admin (daftar + halaman detail/ubah). */
export const adminCalendarEventsQuery = queryOptions({
  queryKey: ['admin-calendar-events'],
  queryFn: () => fetchAdminCalendarEvents(),
})

/** Jastiper yang ikut satu event kalender (tabel peserta di halaman admin). */
export const adminCalendarEventParticipantsQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin-calendar-event-participants', id],
    queryFn: () => fetchCalendarEventParticipants({ data: { id } }),
  })
