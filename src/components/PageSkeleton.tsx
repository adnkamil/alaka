/**
 * Placeholder yang tampil di area konten saat halaman tujuan menunggu data
 * (dipakai sebagai `defaultPendingComponent` di router). Layout `_app` dan
 * BottomNav tetap tampil karena skeleton ini hanya menggantikan isi halaman.
 */
export default function PageSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Memuat halaman"
      className="mx-auto max-w-lg px-4 pb-8 pt-6"
    >
      <div className="animate-pulse space-y-4">
        <div
          className="h-6 w-1/2 rounded-lg"
          style={{ background: 'var(--app-border)' }}
        />
        <div
          className="h-4 w-2/3 rounded-lg"
          style={{ background: 'var(--app-border)' }}
        />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border"
            style={{
              background: 'var(--app-card)',
              borderColor: 'var(--app-border)',
            }}
          />
        ))}
      </div>
    </main>
  )
}
