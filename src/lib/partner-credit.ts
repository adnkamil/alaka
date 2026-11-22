// Aturan murni saldo kredit partner (tanpa db, aman dipakai client & server).
// Saldo diisi lewat top up dan dipakai membayar biaya admin ALAKA. Tidak bisa
// ditarik. Penulisan ke db ada di `partner-credit-queries.ts`.

/** Pilihan nominal top up (Rupiah). Minimal 10rb, dijaga juga oleh check db. */
export const PARTNER_TOPUP_AMOUNTS = [10_000, 20_000, 50_000, 100_000] as const
export type PartnerTopupAmount = (typeof PARTNER_TOPUP_AMOUNTS)[number]

export function isPartnerTopupAmount(n: number): n is PartnerTopupAmount {
  return (PARTNER_TOPUP_AMOUNTS as ReadonlyArray<number>).includes(n)
}

/** Batas panjang catatan koreksi saldo oleh admin. */
export const CREDIT_ADJUSTMENT_NOTE_MAX = 500

/**
 * Ubah nilai decimal dari db (string) atau number ke sen bulat, supaya
 * penjumlahan uang tidak kena galat floating point.
 */
export function toCents(value: string | number): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) throw new Error(`Nominal tidak valid: ${value}`)
  return Math.round(n * 100)
}

/** Sen bulat ke string decimal(…, 2) untuk disimpan di db. */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Nominal tidak valid: ${cents}`)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Saldo setelah satu entri ledger. `amount` bertanda (negatif = potongan). */
export function nextBalance(balance: string | number, amount: string | number): string {
  return centsToDecimal(toCents(balance) + toCents(amount))
}

/**
 * Biaya admin ALAKA untuk satu tagihan lunas: `total × persen / 100`,
 * dibulatkan ke rupiah penuh (setengah ke atas, seperti `Math.round`).
 * Dihitung dengan bilangan bulat (BigInt) supaya hasil 25,5 tidak terbaca
 * 25,4999… lalu turun ke 25.
 */
export function computeAdminFee(
  totalAmount: string | number,
  percent: string | number,
): number {
  const totalCents = BigInt(toCents(totalAmount))
  const percentHundredths = BigInt(toCents(percent))
  if (totalCents <= 0n || percentHundredths <= 0n) return 0
  // total (sen) × persen (per 100) / 100 (persen) / 100 (sen→rupiah) / 100.
  const scale = 1_000_000n
  return Number((totalCents * percentHundredths + scale / 2n) / scale)
}

/**
 * Tampilan saldo: saldo negatif ditampilkan sebagai tunggakan biaya admin
 * (positif), bukan "saldo minus".
 */
export function creditBalanceState(balance: string | number): {
  balance: number
  arrears: number
} {
  const cents = toCents(balance)
  return cents < 0
    ? { balance: 0, arrears: -cents / 100 }
    : { balance: cents / 100, arrears: 0 }
}
