/**
 * Daftar booth event offline (mis. IMBEX): satu baris = satu brand di satu
 * booth. Brand yang punya beberapa booth muncul beberapa kali, dan satu booth
 * bisa diisi banyak brand. Disimpan di `calendar_event.booths`.
 */
export type EventBooth = {
  /** Kode booth sesuai floorplan, mis. `A-M07`. */
  code: string
  /** Nama brand seperti tertulis di brand listing penyelenggara. */
  brand: string
  /** Area/hall, mis. `Hall A`. */
  area: string
}

/** Huruf kecil, tanpa aksen, hanya huruf dan angka: "Dr. Teal's" -> "drteals". */
export function normalizeBoothText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Cari booth berdasarkan nama brand atau kode booth. Pencocokan mengabaikan
 * huruf besar, spasi, dan tanda baca, jadi "mooi mom", "MOOIMOM", dan "am07"
 * sama-sama ketemu. Urutan hasil: nama brand diawali kata kunci, lalu kode
 * booth diawali kata kunci, lalu yang hanya memuat kata kunci; di dalam tiap
 * kelompok urut nama brand.
 */
export function searchBooths(
  booths: ReadonlyArray<EventBooth>,
  query: string,
): EventBooth[] {
  const q = normalizeBoothText(query)
  if (!q) return []

  const ranked: Array<{ booth: EventBooth; rank: number }> = []
  for (const booth of booths) {
    const brand = normalizeBoothText(booth.brand)
    const code = normalizeBoothText(booth.code)
    let rank: number
    if (brand.startsWith(q)) rank = 0
    else if (code.startsWith(q)) rank = 1
    else if (brand.includes(q)) rank = 2
    else continue
    ranked.push({ booth, rank })
  }

  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.booth.brand.localeCompare(b.booth.brand, 'id') ||
        a.booth.code.localeCompare(b.booth.code, 'id'),
    )
    .map((r) => r.booth)
}

/** Brand lain yang berbagi booth yang sama (untuk info "satu booth dengan"). */
export function boothNeighbors(
  booths: ReadonlyArray<EventBooth>,
  booth: EventBooth,
): string[] {
  return booths
    .filter((b) => b.code === booth.code && b.brand !== booth.brand)
    .map((b) => b.brand)
}
