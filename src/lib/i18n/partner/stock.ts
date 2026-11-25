/** Label stok varian yang dipakai di beberapa halaman partner. */

const en = {
  soldOut: 'Sold out',
  outOfStock: 'out of stock',
  stockOf: (qty: number) => `stock ${qty}`,
  stockLabel: (value: string) => `Stock ${value}`,
}

const id: typeof en = {
  soldOut: 'Habis',
  outOfStock: 'stok habis',
  stockOf: (qty) => `stok ${qty}`,
  stockLabel: (value) => `Stok ${value}`,
}

export default { en, id }
