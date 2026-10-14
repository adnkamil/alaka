import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import CalendarEventForm from '../../../components/CalendarEventForm'
import ConfirmModal from '../../../components/ui/ConfirmModal'
import {
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../../../lib/calendar-events-admin-functions'
import { adminCalendarEventsQuery } from '../../../lib/queries'
import type { CalendarEventFormValue } from '../../../components/CalendarEventForm'

export const Route = createFileRoute('/admin/event/$eventId')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminCalendarEventsQuery),
  component: AdminEventDetailPage,
})

function AdminEventDetailPage() {
  const { eventId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const { data: events } = useSuspenseQuery(adminCalendarEventsQuery)
  const event = events.find((row) => row.id === eventId)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/admin/event"
          aria-label="Kembali ke daftar event"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Ubah Event</h1>
      </header>

      {!event ? (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Event tidak ditemukan. Mungkin sudah dihapus.
        </p>
      ) : (
        <>
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
