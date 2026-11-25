import type { PartnerStatusFilter } from '../../event-slot'

/** Rekap Orderan event (/partner/event/rekap/$id). */

const en = {
  title: 'Order Recap',
  status: {
    semua: 'All',
    draft: 'Draft',
    pengajuan: 'Submitted',
    selesai: 'Checked',
  } as Record<PartnerStatusFilter, string>,
  summary: (pcs: number, status: string) =>
    `${pcs} pcs to prepare · Status: ${status}`,
  backToEvent: 'Back to event',
  filterLabel: 'Recap filter',
  all: 'All',
  singleItems: 'Single items',
  bundle: (name: string) => `Bundle: ${name}`,
  single: 'Single',
  loadFailed: 'Could not load the recap.',
  empty: 'No items to show yet.',
  searchProduct: 'Search product name',
  noMatch: 'No products match your search.',
  standard: 'Standard',
  colProduct: 'Product',
  colVariation: 'Variation',
  colSize: 'Size',
  colSource: 'Source',
  colQty: 'Qty',
  colPerJastiper: 'Per jastiper',
}

const id: typeof en = {
  title: 'Rekap Orderan',
  status: {
    semua: 'Semua',
    draft: 'Draft',
    pengajuan: 'Pengajuan',
    selesai: 'Selesai dicek',
  },
  summary: (pcs, status) => `${pcs} pcs untuk disiapkan · Status: ${status}`,
  backToEvent: 'Kembali ke event',
  filterLabel: 'Filter rekap',
  all: 'Semua',
  singleItems: 'Barang satuan',
  bundle: (name) => `Paket: ${name}`,
  single: 'Satuan',
  loadFailed: 'Gagal memuat rekap.',
  empty: 'Belum ada barang untuk ditampilkan.',
  searchProduct: 'Cari nama produk',
  noMatch: 'Tidak ada produk yang cocok dengan pencarian.',
  standard: 'Standar',
  colProduct: 'Produk',
  colVariation: 'Variasi',
  colSize: 'Ukuran',
  colSource: 'Sumber',
  colQty: 'Qty',
  colPerJastiper: 'Per jastiper',
}

export default { en, id }
