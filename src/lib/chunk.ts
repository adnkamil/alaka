/** Pecah array menjadi potongan berukuran paling banyak `size`, urutan tetap. */
export function chunk<T>(rows: ReadonlyArray<T>, size: number): Array<Array<T>> {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Ukuran potongan harus bilangan bulat positif.')
  }
  const out: Array<Array<T>> = []
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size))
  }
  return out
}
