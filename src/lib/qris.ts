/**
 * QRIS statis -> dinamis (EMVCo MPM, TLV).
 * Murni string-in/string-out, tanpa dependensi, aman dipakai di client maupun server.
 */

export interface Tlv {
  tag: string;
  value: string;
}

export type QrisFee =
  | { type: "fixed"; value: number }
  | { type: "percentage"; value: number };

export class QrisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QrisError";
  }
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), hasil 4 hex uppercase. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Parse TLV level atas: [tag 2 digit][panjang 2 digit][value]. */
export function parseTlv(payload: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) throw new QrisError("Struktur QRIS rusak (header TLV terpotong)");
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) {
      throw new QrisError(`Struktur QRIS rusak di posisi ${i}`);
    }
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new QrisError(`Panjang tag ${tag} tidak sesuai`);
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

function encodeTlv({ tag, value }: Tlv): string {
  if (value.length > 99) throw new QrisError(`Value tag ${tag} terlalu panjang`);
  return tag + String(value.length).padStart(2, "0") + value;
}

/** Cek CRC di akhir payload ("6304XXXX"). */
export function isValidQris(payload: string): boolean {
  const s = payload.trim();
  if (s.length < 8 || s.slice(-8, -4) !== "6304") return false;
  return crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase();
}

export function isStaticQris(payload: string): boolean {
  return parseTlv(payload.trim()).find((t) => t.tag === "01")?.value === "11";
}

/** Ambil info ringkas (nama & kota merchant) untuk ditampilkan/dikonfirmasi user. */
export function getQrisInfo(payload: string) {
  const tlv = parseTlv(payload.trim());
  const get = (t: string) => tlv.find((x) => x.tag === t)?.value;
  return {
    method: get("01") === "12" ? ("dynamic" as const) : ("static" as const),
    merchantName: get("59") ?? "",
    merchantCity: get("60") ?? "",
    amount: get("54"),
  };
}

/**
 * Ubah QRIS statis jadi dinamis dengan nominal tertentu (Rupiah, bilangan bulat).
 * Fee opsional: fixed -> tag 55="02" + 56, percentage -> tag 55="03" + 57.
 */
export function toDynamicQris(staticQris: string, amount: number, fee?: QrisFee): string {
  const payload = staticQris.trim();
  if (!isValidQris(payload)) throw new QrisError("QRIS tidak valid (CRC tidak cocok)");
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new QrisError("Nominal harus bilangan bulat > 0");
  }

  const tlv = parseTlv(payload).filter(
    // buang CRC lama + tag nominal/fee lama supaya idempotent
    (t) => !["63", "54", "55", "56", "57"].includes(t.tag),
  );
  const initiation = tlv.find((t) => t.tag === "01");
  if (!initiation) throw new QrisError("Tag 01 tidak ditemukan");
  initiation.value = "12";

  const added: Tlv[] = [{ tag: "54", value: String(amount) }];
  if (fee) {
    if (!(fee.value > 0)) throw new QrisError("Nilai fee harus > 0");
    if (fee.type === "fixed") {
      added.push({ tag: "55", value: "02" }, { tag: "56", value: String(Math.round(fee.value)) });
    } else {
      added.push({ tag: "55", value: "03" }, { tag: "57", value: String(fee.value) });
    }
  }

  // Urutkan naik berdasarkan tag supaya 54-57 jatuh di antara 53 dan 58 (sort stabil).
  const body = [...tlv, ...added]
    .sort((a, b) => Number(a.tag) - Number(b.tag))
    .map(encodeTlv)
    .join("");

  const withCrcTag = body + "6304";
  return withCrcTag + crc16(withCrcTag);
}