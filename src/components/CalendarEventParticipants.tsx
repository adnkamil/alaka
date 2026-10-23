import { MessageCircle } from 'lucide-react'
import { buildWhatsAppLink, formatDate, formatPhoneNumber } from '../lib/format'

export type ParticipantRow = {
  brandId: string
  brandName: string | null
  waNumber: string | null
  /** ISO string (hasil serialisasi server function) atau Date. */
  joinedAt: string | Date
  /** Jumlah pesanan di event belanja hasil "Ikut Event". */
  orderCount: number
}

/**
 * Tabel jastiper yang ikut satu event kalender: nama brand, tanggal ikut,
 * jumlah pesanan, dan nomor WhatsApp (tautan langsung ke chat). Presentasional saja — datanya
 * dari `listCalendarEventParticipants`.
 */
export default function CalendarEventParticipants({
  participants,
}: {
  participants: Array<ParticipantRow>
}) {
  return (
    <section className="app-card mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold">Jastiper yang ikut</h2>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{
            background: 'var(--app-accent-soft)',
            color: 'var(--app-accent)',
          }}
        >
          {participants.length}
        </span>
      </div>

      {participants.length === 0 ? (
        <p
          className="px-4 pb-4 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Belum ada jastiper yang ikut event ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="text-xs"
                style={{
                  color: 'var(--app-text-soft)',
                  background: 'var(--app-accent-soft)',
                }}
              >
                <th className="px-4 py-2 font-medium">Brand</th>
                <th className="px-2 py-2 font-medium">Tanggal ikut</th>
                <th className="px-2 py-2 text-right font-medium">Pesanan</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((row) => (
                <tr
                  key={row.brandId}
                  className="border-t"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <td className="px-4 py-3 font-medium">
                    {row.brandName || (
                      <span style={{ color: 'var(--app-text-mute)' }}>
                        Tanpa nama
                      </span>
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap px-2 py-3"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {formatDate(row.joinedAt)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                    {row.orderCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
