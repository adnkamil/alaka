/** Kolom tabel Aturan Paket yang boleh diurutkan (murni, aman dipakai UI). */
export const RULE_SORT_KEYS = ['name', 'minQty', 'bundlePrice', 'isActive'] as const
export type RuleSortKey = (typeof RULE_SORT_KEYS)[number]
