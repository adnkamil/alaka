import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc16, getQrisInfo, isStaticQris, isValidQris, parseTlv, toDynamicQris } from "./qris";

// QRIS statis sintetis (bukan merchant asli) untuk test.
function makeStatic(): string {
  const merchant = "0011ID.CO.TEST.WWW" + "0215ID1234567890123" + "0303UMI";
  const body =
    "000201" + "010211" +
    "26" + String(merchant.length).padStart(2, "0") + merchant +
    "52045812" + "5303360" + "5802ID" +
    "5911WARUNG TEST" + "6005DEMAK" + "6304";
  return body + crc16(body);
}

describe("qris", () => {
  const stat = makeStatic();

  it("statis valid", () => {
    assert.equal(isValidQris(stat), true);
    assert.equal(isStaticQris(stat), true);
  });

  it("CRC16 test vector standar", () => {
    assert.equal(crc16("123456789"), "29B1");
  });

  it("konversi: tag 01=12, tag 54 diisi, CRC valid", () => {
    const dyn = toDynamicQris(stat, 25000);
    assert.equal(isValidQris(dyn), true);
    const tlv = parseTlv(dyn);
    assert.equal(tlv.find((t) => t.tag === "01")?.value, "12");
    assert.equal(tlv.find((t) => t.tag === "54")?.value, "25000");
    assert.equal(getQrisInfo(dyn).merchantName, "WARUNG TEST");
    // urutan tag naik
    const tags = tlv.map((t) => Number(t.tag));
    assert.deepEqual(tags, [...tags].sort((a, b) => a - b));
  });

  it("idempotent: konversi ulang mengganti nominal", () => {
    const dyn = toDynamicQris(toDynamicQris(stat, 1000), 2000);
    assert.deepEqual(parseTlv(dyn).filter((t) => t.tag === "54"), [{ tag: "54", value: "2000" }]);
  });

  it("fee fixed & persen", () => {
    const f = parseTlv(toDynamicQris(stat, 10000, { type: "fixed", value: 500 }));
    assert.equal(f.find((t) => t.tag === "55")?.value, "02");
    assert.equal(f.find((t) => t.tag === "56")?.value, "500");
    const p = parseTlv(toDynamicQris(stat, 10000, { type: "percentage", value: 2.5 }));
    assert.equal(p.find((t) => t.tag === "57")?.value, "2.5");
  });

  it("menolak input buruk", () => {
    assert.throws(() => toDynamicQris(stat, 0));
    assert.throws(() => toDynamicQris(stat, 10.5));
    assert.throws(() => toDynamicQris(stat.slice(0, -1) + "0", 1000));
  });
});