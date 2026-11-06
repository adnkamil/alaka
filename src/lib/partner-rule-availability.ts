// Produk yang boleh dipilih di form aturan paket. Satu produk boleh masuk
// beberapa aturan selama rentang ukurannya tidak tumpang tindih, jadi semua
// produk tetap bisa dipilih. Bentrok ukuran dicek di server (lihat
// assertRuleScopesNoOverlap).
export function selectableProducts<T extends { id: string }>(
  products: Array<T>,
): Array<T> {
  return products
}
