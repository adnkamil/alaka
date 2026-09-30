export type ThemeMode = 'light' | 'dark' | 'auto'

/**
 * Mode tema default kalau user belum pernah memilih: **terang**.
 *
 * Auto gelap (ikut setelan sistem lewat `prefers-color-scheme`) sengaja MATI
 * sebagai default — app dibuka terang walau HP-nya mode gelap. User yang mau
 * gelap memilihnya sendiri di Profil ▸ Preferensi ▸ Mode gelap. Nilai `'auto'`
 * tetap didukung (kalau user pernah memilihnya, pilihannya dihormati).
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light'

/**
 * Script inline yang dipasang di `<head>` oleh `__root.tsx` dan jalan SEBELUM
 * React hydrate, supaya tema tersimpan tidak "berkedip" (flash) saat halaman
 * dimuat.
 *
 * Sumber pilihan: `localStorage.theme` ('light' | 'dark' | 'auto'). Kalau
 * kosong / nilainya aneh, dipakai `defaultMode` (lihat DEFAULT_THEME_MODE).
 * Untuk mode 'auto', class `light`/`dark` tetap di-set sesuai setelan sistem,
 * tapi atribut `data-theme` sengaja dilepas supaya CSS `prefers-color-scheme`
 * yang menentukan.
 */
export function buildThemeInitScript(defaultMode: ThemeMode): string {
  return `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'${defaultMode}';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`
}
