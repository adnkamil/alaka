import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, CircleCheck, CirclePlay } from 'lucide-react'
import CalendarEventForm from '../../../components/CalendarEventForm'
import CalendarEventParticipants from '../../../components/CalendarEventParticipants'
import ConfirmModal from '../../../components/ui/ConfirmModal'
import {
  deleteCalendarEvent,
  setCalendarEventEnded,
  updateCalendarEvent,
} from '../../../lib/calendar-events-admin-functions'
import { eventEndDate } from '../../../lib/calendar'
import {
  adminCalendarEventParticipantsQuery,
  adminCalendarEventsQuery,
} from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import type { CalendarEventFormValue } from '../../../components/CalendarEventForm'

export const Route = createFileRoute('/admin/event/$eventId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminCalendarEventsQuery),
      context.queryClient.ensureQueryData(
        adminCalendarEventParticipantsQuery(params.eventId),
      ),
    ]),
  component: AdminEventDetailPage,
})

function AdminEventDetailPage() {
  const { eventId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const { data: events } = useSuspenseQuery(adminCalendarEventsQuery)
  const event = events.find((row) => row.id === eventId)
  const { data: participants } = useSuspenseQuery(
    adminCalendarEventParticipantsQuery(eventId),
  )

  const [tab, setTab] = useState<'detail' | 'jastiper'>('detail')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [isTogglingEnded, setIsTogglingEnded] = useState(false)
  const [endedError, setEndedError] = useState<string | null>(null)

  async function refresh() {
    // Cache sisi user ikut dibuang supaya perubahan langsung terlihat.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-calendar-events'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-event'] }),
    ])
  }

  async function handleSubmit(value: CalendarEventFormValue) {
    await updateCalendarEvent({ data: { id: eventId, ...value } })
    await refresh()
    await navigate({ to: '/admin/event' })
  }

  async function handleSetEnded(ended: boolean) {
    setIsTogglingEnded(true)
    setEndedError(null)
    try {
      await setCalendarEventEnded({ data: { id: eventId, ended } })
      await refresh()
      setConfirmEnd(false)
    } catch (err) {
      setConfirmEnd(false)
      setEndedError(
        err instanceof Error ? err.message : 'Gagal mengubah status event',
      )
    } finally {
      setIsTogglingEnded(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteCalendarEvent({ data: { id: eventId } })
      await refresh()
      await navigate({ to: '/admin/event' })
    } catch (err) {
      setConfirmDelete(false)
      setDeleteError(
        err instanceof Error ? err.message : 'Gagal menghapus event',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <main className="pm-wide mx-auto max-w-lg px-4 pb-8 pt-6 lg:max-w-[760px]! lg:mx-0!">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/admin/event"
          aria-label="Kembali ke daftar event"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="min-w-0 break-words text-xl font-bold">
          {event?.name ?? 'Event'}
        </h1>
      </header>

      {event && (
        <div
          role="tablist"
          aria-label="Bagian event"
          className="mb-4 flex border-b"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {(
            [
              { key: 'detail', label: 'Detail' },
              { key: 'jastiper', label: `Jastiper (${participants.length})` },
            ] as const
          ).map((item) => {
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.key)}
                className="-mb-px flex-1 border-b-2 px-3 py-2.5 text-sm font-semibold"
                style={{
                  borderColor: active ? 'var(--app-accent)' : 'transparent',
                  color: active ? 'var(--app-accent)' : 'var(--app-text-soft)',
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}

      {!event ? (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Event tidak ditemukan. Mungkin sudah dihapus.
        </p>
      ) : tab === 'jastiper' ? (
        <CalendarEventParticipants participants={participants} />
      ) : (
        <>
          <section className="app-card mb-4 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {event.isEnded ? (
                <CircleCheck
                  size={16}
                  style={{ color: 'var(--app-text-soft)' }}
                />
              ) : (
                <CirclePlay size={16} style={{ color: 'var(--app-accent)' }} />
              )}
              {event.isEnded
                ? 'Event sudah diakhiri'
                : eventEndDate(event) < todayIsoDateInAppTimeZone()
                  ? 'Tanggal event sudah lewat'
                  : 'Event berjalan'}
            </p>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {event.isEnded
                ? 'Event ini tidak muncul di kalender user. Datanya tetap tersimpan dan bisa dibuka kembali.'
                : eventEndDate(event) < todayIsoDateInAppTimeZone()
                  ? 'Event ini otomatis tidak muncul lagi di kalender user.'
                  : 'Akhiri event kalau sudah selesai atau dibatalkan sebelum tanggalnya. Event langsung hilang dari kalender user.'}
            </p>
            {event.isEnded ? (
              <button
                type="button"
                disabled={isTogglingEnded}
                onClick={() => void handleSetEnded(false)}
                className="app-btn-outline mt-3 w-full disabled:opacity-50"
              >
                {isTogglingEnded ? 'Memproses...' : 'Buka kembali event'}
              </button>
            ) : eventEndDate(event) >= todayIsoDateInAppTimeZone() ? (
              <button
                type="button"
                disabled={isTogglingEnded}
                onClick={() => setConfirmEnd(true)}
                className="app-btn-outline mt-3 w-full disabled:opacity-50"
              >
                Akhiri event
              </button>
            ) : null}
            {endedError && (
              <p
                className="mt-2 text-sm"
                style={{ color: 'var(--app-danger)' }}
              >
                {endedError}
              </p>
            )}
          </section>

          {deleteError && (
            <p className="mb-3 text-sm" style={{ color: 'var(--app-danger)' }}>
              {deleteError}
            </p>
          )}
          <CalendarEventForm
            // Form dibuat ulang kalau banner/data event berganti dari server.
            key={`${event.id}:${event.bannerSrc ?? ''}`}
            initialValue={{
              name: event.name,
              location: event.location,
              eventDate: event.eventDate,
              endDate: event.endDate,
              isOnline: event.isOnline,
              description: event.description ?? '',
              exhibitors: event.exhibitors,
            }}
            currentBannerSrc={event.bannerSrc}
            onCancel={() => void navigate({ to: '/admin/event' })}
            onSubmit={handleSubmit}
            onDelete={() => setConfirmDelete(true)}
          />
        </>
      )}

      <ConfirmModal
        open={confirmEnd}
        title="Akhiri event?"
        content={
          event
            ? `"${event.name}" langsung hilang dari kalender semua user. Kamu bisa membukanya kembali kapan saja.`
            : undefined
        }
        okText="Akhiri"
        danger={false}
        loading={isTogglingEnded}
        onOk={() => void handleSetEnded(true)}
        onCancel={() => setConfirmEnd(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Hapus event?"
        content={
          event
            ? `"${event.name}" akan dihapus dari kalender semua user. Tindakan ini tidak bisa dibatalkan.`
            : undefined
        }
        okText="Hapus"
        loading={isDeleting}
        onOk={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  )
}
