import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatDate } from './format'
import { APP_TIME_ZONE, todayIsoDateInAppTimeZone } from './timezone'

/**
 * Tes konversi tanggal ke zona WIB.
 *
 * Tanggal bisnis Alaka harus dihitung dalam `Asia/Jakarta`, bukan zona
 * perangkat/server. Kalau server (mis. Neon) jalan di UTC, transaksi tanggal 1
 * pagi WIB (= tanggal terakhir bulan sebelumnya di UTC) bakal nyasar bulan/tahun
 * yang salah. Tes di bawah mengunci perilaku itu pakai instant di batas hari.
 */

describe('APP_TIME_ZONE', () => {
  it('zona aplikasi adalah WIB', () => {
    assert.equal(APP_TIME_ZONE, 'Asia/Jakarta')
  })
})

describe('todayIsoDateInAppTimeZone', () => {
  it('hasilnya format YYYY-MM-DD (siap dipakai <input type="date">)', () => {
    const iso = todayIsoDateInAppTimeZone(new Date('2026-08-12T05:00:00Z'))
    assert.equal(iso, '2026-08-12')
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/)
  })

  it('1 Okt 00:30 WIB (= 30 Sep 17:30 UTC) dianggap 1 Oktober, bukan September', () => {
    // Kalau pakai zona server UTC, ini bakal jadi '2026-09-30' — salah.
    assert.equal(
      todayIsoDateInAppTimeZone(new Date('2026-09-30T17:30:00Z')),
      '2026-10-01',
    )
  })

  it('1 Jan 00:00 WIB (= 31 Des 17:00 UTC) sudah masuk tahun berikutnya', () => {
    assert.equal(
      todayIsoDateInAppTimeZone(new Date('2026-12-31T17:00:00Z')),
      '2027-01-01',
    )
  })
})

describe('formatDate', () => {
  it('null/undefined jadi string kosong supaya aman di JSX', () => {
    assert.equal(formatDate(null), '')
    assert.equal(formatDate(undefined), '')
  })

  it('terima Date dan string ISO', () => {
    const expected = '12 Agustus 2026'
    assert.equal(formatDate(new Date('2026-08-12T05:00:00Z')), expected)
    assert.equal(formatDate('2026-08-12T05:00:00Z'), expected)
  })

  it('batas hari dihitung dalam WIB, bukan zona perangkat', () => {
    // 31 Des 17:30 UTC = 1 Jan 00:30 WIB -> harus "1 Januari 2027".
    assert.equal(formatDate('2026-12-31T17:30:00Z'), '1 Januari 2027')
  })
})
