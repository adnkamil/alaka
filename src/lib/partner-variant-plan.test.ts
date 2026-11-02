import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  VariantPlanError,
  planVariantChanges,
  validateVariantInput,
  type ExistingVariant,
} from './partner-variant-plan'

const v = (
  id: string,
  size: string | null,
  variation: string | null,
  extra: Partial<ExistingVariant> = {},
): ExistingVariant => ({
  id,
  size,
  variation,
  isActive: true,
  hasOrders: false,
  ...extra,
})

describe('validateVariantInput', () => {
  it('menerima daftar yang valid, termasuk kombinasi yang tidak lengkap', () => {
    assert.doesNotThrow(() =>
      validateVariantInput({
        sizes: ['S', 'M', 'L', 'XL'],
        variations: ['Mocca', 'Cream', 'Black'],
        variants: [
          { size: 'S', variation: 'Mocca', price: 100000 },
          { size: 'L', variation: 'Cream', price: 110000 },
        ],
      }),
    )
  })

  it('menolak nama ganda (tanpa memedulikan huruf besar/kecil)', () => {
    assert.throws(
      () =>
        validateVariantInput({
          sizes: ['S', 's'],
          variations: [],
          variants: [],
        }),
      VariantPlanError,
    )
  })

  it('menolak varian dengan ukuran yang tidak terdaftar', () => {
    assert.throws(
      () =>
        validateVariantInput({
          sizes: ['S'],
          variations: [],
          variants: [{ size: 'XXL', variation: null, price: 1 }],
        }),
      /ukuran yang terdaftar/,
    )
  })

  it('menolak kombinasi dobel dan harga negatif', () => {
    assert.throws(
      () =>
        validateVariantInput({
          sizes: ['S'],
          variations: ['A'],
          variants: [
            { size: 'S', variation: 'A', price: 1 },
            { size: 'S', variation: 'A', price: 2 },
          ],
        }),
      /dobel/,
    )
    assert.throws(
      () =>
        validateVariantInput({
          sizes: ['S'],
          variations: [],
          variants: [{ size: 'S', variation: null, price: -5 }],
        }),
      /tidak valid/,
    )
  })
})

describe('planVariantChanges', () => {
  it('membuat varian baru dan memperbarui harga yang sudah ada', () => {
    const plan = planVariantChanges(
      [v('a', 'S', 'Mocca')],
      [
        { size: 'S', variation: 'Mocca', price: 90000 },
        { size: 'M', variation: 'Mocca', price: 95000 },
      ],
    )
    assert.deepEqual(plan.update, [{ id: 'a', price: 90000 }])
    assert.deepEqual(plan.insert, [{ size: 'M', variation: 'Mocca', price: 95000 }])
    assert.deepEqual(plan.remove, [])
    assert.deepEqual(plan.deactivate, [])
  })

  it('menghapus varian yang tidak diminta kalau belum pernah dipesan', () => {
    const plan = planVariantChanges([v('a', 'S', 'Mocca')], [])
    assert.deepEqual(plan.remove, ['a'])
    assert.deepEqual(plan.deactivate, [])
  })

  it('hanya menonaktifkan varian yang sudah pernah dipesan', () => {
    const plan = planVariantChanges(
      [v('a', 'S', 'Mocca', { hasOrders: true })],
      [],
    )
    assert.deepEqual(plan.deactivate, ['a'])
    assert.deepEqual(plan.remove, [])
  })

  it('mengaktifkan lagi varian nonaktif kalau diminta lagi', () => {
    const plan = planVariantChanges(
      [v('a', 'L', 'Black', { isActive: false, hasOrders: true })],
      [{ size: 'L', variation: 'Black', price: 120000 }],
    )
    assert.deepEqual(plan.reactivate, ['a'])
    assert.deepEqual(plan.update, [{ id: 'a', price: 120000 }])
    assert.deepEqual(plan.deactivate, [])
  })
})
