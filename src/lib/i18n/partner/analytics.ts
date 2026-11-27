import { INSIGHT_COPY_ID } from '../../partner-analytics-rules'
import type {
  AnalyticsPreset,
  Granularity,
  InsightCopy,
} from '../../partner-analytics-rules'
import type { PartnerEventStatus } from '../../partner-event-rules'

/** Dashboard partner, grafik & panel analitik, dan halaman Analisa Event. */

const INSIGHT_COPY_EN: InsightCopy = {
  trendFlat: (comparison) => `Sales are stable compared with ${comparison}.`,
  trendChange: (up, pct, comparison) =>
    `Sales ${up ? 'rose' : 'fell'} ${pct} compared with ${comparison}.`,
  topEvent: (name, money, pct) =>
    `${name} generated the highest revenue: ${money} (${pct} of total).`,
  topProduct: (name, units) =>
    `${name} is the best seller with ${units} pcs invoiced.`,
  concentration: (pct, name) =>
    `${pct} of product revenue comes from ${name}. Sales still rely on a single product.`,
  aov: (up, pct, money) =>
    `Average value per invoice ${up ? 'rose' : 'fell'} ${pct} to ${money}.`,
  decimalSeparator: '.',
  numberLocale: 'en-GB',
}

const en = {
  // Dashboard
  greeting: 'Hello,',
  title: 'Dashboard',
  subtitle: 'Track your sales performance and business growth.',
  loadFailed: 'Analytics data could not be loaded.',
  retry: 'Try again',
  comparedWith: 'compared with',
  timezone: 'WIB',
  salesPerformance: 'Sales Performance',
  revenueByGranularity: (granularity: Granularity) =>
    `${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[granularity]} revenue in the selected period.`,
  chartAggregation: 'Chart aggregation',
  granularity: { day: 'Daily', week: 'Weekly', month: 'Monthly' } as Record<
    Granularity,
    string
  >,
  period: 'Period',
  customRange: 'Custom date range',
  from: 'From',
  to: 'To',
  apply: 'Apply',
  event: 'Event',
  allEvents: 'All Events',
  presets: {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    this_month: 'This month',
    last_month: 'Last month',
    this_year: 'This year',
    custom: 'Custom',
  } as Record<AnalyticsPreset, string>,
  comparison: {
    '7d': 'the previous 7 days',
    '30d': 'the previous 30 days',
    this_month: 'the same period last month',
    last_month: 'the previous month',
    this_year: 'the same period last year',
    custom: 'the previous period',
  } as Record<AnalyticsPreset, string>,

  // Grafik
  chartThisPeriod: 'This period',
  chartAria: 'Revenue chart by period. Use the arrow keys to read values.',
  chartNoSales: 'No sales in this period yet.',
  chartCaption: 'Revenue by period',
  chartPeriod: 'Period',
  chartRevenue: 'Revenue',
  chartComparison: 'Comparison',

  // Panel umum
  definitionOf: (label: string) => `Definition of ${label}`,
  noComparison: 'No comparison yet',
  trendFlat: 'Stable',
  trendUp: 'Up',
  trendDown: 'Down',
  showLess: 'Show less',
  showAll: (count: number) => `Show all (${count})`,

  // KPI
  kpiRevenue: 'Total Revenue',
  kpiRevenueDef:
    'Net sales: total value of invoices to jastipers in this period, excluding cancelled invoices. Bundle prices are already taken into account. Not profit, not funds received, and excluding shipping and ALAKA admin fees.',
  kpiInvoices: 'Total Invoices',
  kpiInvoicesDef:
    'Number of invoices issued to jastipers in this period, excluding cancelled ones. Not the number of buyers: one invoice can contain several submissions.',
  kpiUnits: 'Pcs Invoiced',
  kpiUnitsDef:
    'Total product pcs in active invoices. Bundle contents are counted per pcs. Pcs that are approved but not yet invoiced are not included here.',
  kpiAov: 'Average per Invoice',
  kpiAovDef:
    'Average value of one invoice: Total Revenue divided by Total Invoices.',
  changeComparedWith: (label: string) => `Change compared with ${label}.`,

  // Event Performance
  eventStatus: {
    mendatang: 'Upcoming',
    berjalan: 'Ongoing',
    selesai: 'Completed',
  } as Record<PartnerEventStatus, string>,
  eventPerformance: 'Event Performance',
  eventPerformanceDesc:
    'Events that are ongoing or had sales in this period. Click an event for the full analysis.',
  sortEvents: 'Sort events',
  sortHighestRevenue: 'Highest revenue',
  sortMostPcs: 'Most pcs',
  noEventsInPeriod: 'No events in this period.',
  colEvent: 'Event',
  colPeriod: 'Period',
  colRevenue: 'Total Revenue',
  colInvoices: 'Invoices',
  colUnits: 'Pcs invoiced',
  colStatus: 'Status',
  colDetail: 'Detail',
  eventRowSummary: (orders: string, units: string) =>
    `${orders} invoices · ${units} pcs`,

  // Top Selling Products
  topProducts: 'Top Selling Products',
  topProductsDesc: (count: number) => `Top ${count} products in this period.`,
  sortProducts: 'Sort products',
  noProductsSold: 'No products sold in this period yet.',
  colProduct: 'Product',
  colContribution: 'Contribution',
  contributionDef:
    'Share of product revenue in Total Revenue. Invoice value is split across its products in proportion to qty × catalog price, so bundle discounts are spread too.',
  sku: (sku: string) => `SKU ${sku}`,
  shareOfRevenue: (pct: string) => `${pct} of revenue`,

  // Business Insights
  insightsTitle: 'Business Insights',
  insightsDesc: 'Generated automatically from sales data in this period.',
  insightsEmpty: 'Not enough data to draw conclusions for this period yet.',
  insightCopy: INSIGHT_COPY_EN,

  // Cara angka dihitung
  howCalculated: 'How the numbers are calculated',
  defRevenueTerm: 'Revenue (Net Sales)',
  defRevenue:
    ' = total value of invoices to jastipers. An invoice value is locked when the invoice is issued, so it does not change even if catalog prices change.',
  defDiscountTerm: 'Discounts',
  defDiscount:
    ': bundle prices are already included in Net Sales. Discounts are not recorded separately yet, so Gross Sales and Discounts are not shown as separate numbers.',
  defInvoicesTerm: 'Invoices & Pcs invoiced',
  defInvoices:
    ' only count invoices that have been issued. Pcs approved during checking but not yet invoiced are not included here; that number appears in Event Analysis as “Pcs sold”.',
  defCancelTerm: 'Cancellations',
  defCancel:
    ': cancelled invoices are not counted at all. Returns/refunds are not supported yet.',
  defExcludedTerm: 'Not included',
  defExcluded:
    ': shipping, ALAKA admin fees, and payment status. Revenue is not profit and not funds received. Profit is not calculated because product and operating costs are not available yet.',
  defDateTerm: 'Transaction date',
  defDate: ' = invoice issue date, grouped in WIB (GMT+7).',

  // Analisa Event
  eventAnalysis: 'Event Analysis',
  analysisCrumb: 'Analysis',
  backToEvent: 'Back to event',
  analysisLoadFailed: 'Could not load the event analysis.',
  loadingAnalysis: 'Loading analysis',
  noJastiperTitle: 'No jastipers have joined yet',
  noJastiperBody:
    'The analysis appears once jastipers join and start sending orders.',
  summary: 'Summary',
  productsSold: (count: string) => `${count} products sold`,
  billedSplit: (billed: string, notBilled: string) =>
    `${billed} already invoiced · ${notBilled} not yet`,
  allBilled: 'All invoiced',
  kpiBilled: 'Total invoiced',
  billedHint: (count: string, paidPct: number) =>
    `${count} invoices · ${paidPct}% paid`,
  noInvoices: 'No invoices yet',
  kpiBilledDef:
    'Total value of active invoices to jastipers in this event, excluding cancelled invoices. Same as this event’s Total Revenue on the Dashboard. Not profit and not funds received.',
  kpiSold: 'Pcs sold',
  kpiSoldDefSlot:
    'Pcs approved during checking, invoiced or not. The Dashboard only counts invoiced pcs. Bundle contents are counted per pcs.',
  kpiSoldDef:
    'All pcs ordered through jastipers. Bundle contents are counted per pcs.',
  kpiJoined: 'Jastipers joined',
  joinedSubmitted: (count: string) => `${count} submitted`,
  joinedActive: (count: string) => `${count} with orders`,
  kpiJoinedDef: 'Jastipers who pressed Join Event for this event.',
  kpiRejected: 'Pcs rejected',
  rejectedHint: 'Unavailable when checked',
  allAvailable: 'All orders available',
  kpiRejectedDef:
    'Pcs that could not be fulfilled when checked (out of stock). Not invoiced.',
  highlights: 'Event highlights',
  highlightsDesc: 'Generated automatically from this event’s data.',
  highlightsEmpty: 'Not enough data to draw conclusions from this event yet.',
  insightTopProduct: (name: string, pcs: string, jastiper: string) =>
    `${name} sold best: ${pcs} pcs through ${jastiper} jastipers.`,
  insightTopJastiper: (name: string, pcs: string) =>
    `${name} sold the most pcs (${pcs} pcs).`,
  insightStockOutHot: (count: string, hot: string) =>
    `${count} variants sold out, ${hot} of which were ordered. Consider adding stock for the next event.`,
  insightStockOut: (count: string) => `${count} variants sold out.`,
  insightRejected: (count: string) =>
    `${count} pcs were rejected because they were unavailable when checked.`,
  insightTopSize: (size: string, pcs: string) =>
    `Size ${size} is the most popular (${pcs} pcs).`,
  pcsRejectedTitle: (count: number) => `${count} pcs rejected`,
  flowTitle: 'Pcs flow',
  flowDesc: (count: string) =>
    `${count} pcs ordered through jastipers in this event.`,
  flowEmpty: 'No product orders yet.',
  flowSold: 'Sold',
  flowWaiting: 'Waiting for check',
  flowRejected: 'Rejected',
  flowDraft: 'Not submitted',
  flowSingle: 'Single items',
  flowBundle: 'Via bundles',
  activityTitle: 'Submission activity',
  activityDesc: (granularity: 'jam' | 'hari') =>
    `Pcs sent by jastipers per ${granularity === 'jam' ? 'hour' : 'day'} (WIB).`,
  activityEmpty: 'No order submissions yet.',
  activityPcsFrom: (submits: string) => `pcs from ${submits} submissions`,
  activityPeak: 'Busiest:',
  activityBarLabel: (label: string, pcs: number, submits: number) =>
    `${label}: ${pcs} pcs from ${submits} submissions`,
  bestProducts: 'Best-selling products',
  bestProductsDesc: 'Sorted by pcs sold. Click a product to see each variant.',
  bestProductsEmpty: 'No products sold yet.',
  jastiperCount: (count: string) => `${count} jastipers`,
  rejectedCount: (count: string) => `${count} rejected`,
  standardVariant: 'Standard',
  topJastiper: 'Top jastipers',
  topJastiperDesc: 'Sorted by pcs sold. Click to see jastiper details.',
  colJastiper: 'Jastiper',
  colPcs: 'Pcs',
  colBilled: 'Invoiced',
  paid: 'Paid',
  paidPct: (pct: number) => `${pct}% paid`,
  stockTitle: 'Product stock',
  stockDesc: 'Current stock of products brought to the event.',
  stockFilter: 'Stock filter',
  stockOutTab: (count: number) => `Sold out · ${count}`,
  stockLowTab: (count: number) => `Low stock · ${count}`,
  stockOutEmpty: 'No variants are sold out.',
  stockLowEmpty: 'No variants are running low.',
  soldWord: 'sold',
  rejectedWord: 'rejected',
  notOrderedHere: 'not ordered in this event',
  soldOut: 'Sold out',
  stockLeft: (qty: number) => `${qty} left`,
  unmetTitle: 'Unmet demand',
  unmetDesc: 'Most rejected pcs, a signal to add stock.',
  unmetEmpty: 'All orders were available. No pcs were rejected.',
  sizesTitle: 'Best-selling sizes',
  minOrderTitle: 'Minimum purchase',
  minOrderDesc: (min: string | null) =>
    min
      ? `Current minimum is ${min}. Draft figures reflect current orders.`
      : 'This event has no minimum purchase.',
  minOrderJoined: 'Jastipers joined',
  minOrderSubmitted: 'Submitted',
  minOrderStuck: 'Held below the minimum',
  minOrderStuckAmount: 'Held draft value',
  minOrderStuckNear: 'Held, at 80% of the minimum or more',
  minOrderBuckets: 'First submission value',
  minOrderBucketsEmpty: 'No submissions with a recorded value yet.',
  minOrderBelow: (v: string) => `Below ${v}`,
  minOrderRange: (from: string, to: string) => `${from} to under ${to}`,
  minOrderAbove: (v: string) => `${v} and above`,
  minOrderCount: (n: number) => `${n} jastipers`,
  sizesDesc: 'Pcs sold per size.',
  sizesEmpty: 'Products in this event do not use sizes yet.',
}

const id: typeof en = {
  greeting: 'Halo,',
  title: 'Beranda',
  subtitle: 'Pantau performa penjualan dan perkembangan bisnis Anda.',
  loadFailed: 'Data analytics gagal dimuat.',
  retry: 'Coba lagi',
  comparedWith: 'dibandingkan',
  timezone: 'WIB',
  salesPerformance: 'Performa Penjualan',
  revenueByGranularity: (granularity) =>
    `Revenue ${{ day: 'harian', week: 'mingguan', month: 'bulanan' }[granularity]} pada periode terpilih.`,
  chartAggregation: 'Agregasi grafik',
  granularity: { day: 'Harian', week: 'Mingguan', month: 'Bulanan' },
  period: 'Periode',
  customRange: 'Rentang tanggal sendiri',
  from: 'Dari',
  to: 'Sampai',
  apply: 'Terapkan',
  event: 'Event',
  allEvents: 'Semua Event',
  presets: {
    '7d': '7 hari terakhir',
    '30d': '30 hari terakhir',
    this_month: 'Bulan ini',
    last_month: 'Bulan lalu',
    this_year: 'Tahun ini',
    custom: 'Custom',
  },
  comparison: {
    '7d': '7 hari sebelumnya',
    '30d': '30 hari sebelumnya',
    this_month: 'periode yang sama bulan lalu',
    last_month: 'bulan sebelumnya',
    this_year: 'periode yang sama tahun lalu',
    custom: 'periode sebelumnya',
  },

  chartThisPeriod: 'Periode ini',
  chartAria:
    'Grafik revenue per periode. Gunakan tombol panah untuk membaca nilai.',
  chartNoSales: 'Belum ada penjualan pada periode ini.',
  chartCaption: 'Revenue per periode',
  chartPeriod: 'Periode',
  chartRevenue: 'Revenue',
  chartComparison: 'Pembanding',

  definitionOf: (label) => `Definisi ${label}`,
  noComparison: 'Belum ada pembanding',
  trendFlat: 'Stabil',
  trendUp: 'Naik',
  trendDown: 'Turun',
  showLess: 'Tampilkan lebih sedikit',
  showAll: (count) => `Tampilkan semua (${count})`,

  kpiRevenue: 'Total Revenue',
  kpiRevenueDef:
    'Net sales: total nilai tagihan ke jastiper pada periode ini, tidak termasuk tagihan yang dibatalkan. Harga paket sudah diperhitungkan. Bukan profit, bukan dana yang sudah diterima, tanpa ongkir dan biaya admin ALAKA.',
  kpiInvoices: 'Total Tagihan',
  kpiInvoicesDef:
    'Jumlah tagihan yang terbit ke jastiper pada periode ini, tidak termasuk yang dibatalkan. Bukan jumlah pembeli: satu tagihan bisa berisi beberapa submit.',
  kpiUnits: 'Pcs Ditagih',
  kpiUnitsDef:
    'Total pcs produk di dalam tagihan aktif. Isi paket dihitung per pcs. Pcs yang sudah disetujui tapi belum ditagih belum masuk di sini.',
  kpiAov: 'Rata-rata per Tagihan',
  kpiAovDef:
    'Rata-rata nilai satu tagihan: Total Revenue dibagi Total Tagihan.',
  changeComparedWith: (label) => `Perubahan dibandingkan ${label}.`,

  eventStatus: {
    mendatang: 'Mendatang',
    berjalan: 'Berjalan',
    selesai: 'Selesai',
  },
  eventPerformance: 'Performa Event',
  eventPerformanceDesc:
    'Event yang berjalan atau punya penjualan pada periode ini. Klik event untuk analisa lengkap.',
  sortEvents: 'Urutkan event',
  sortHighestRevenue: 'Revenue tertinggi',
  sortMostPcs: 'Pcs terbanyak',
  noEventsInPeriod: 'Tidak ada event pada periode ini.',
  colEvent: 'Event',
  colPeriod: 'Periode',
  colRevenue: 'Total Revenue',
  colInvoices: 'Tagihan',
  colUnits: 'Pcs ditagih',
  colStatus: 'Status',
  colDetail: 'Detail',
  eventRowSummary: (orders, units) => `${orders} tagihan · ${units} pcs`,

  topProducts: 'Produk Terlaris',
  topProductsDesc: (count) => `${count} produk teratas pada periode ini.`,
  sortProducts: 'Urutkan produk',
  noProductsSold: 'Belum ada produk terjual pada periode ini.',
  colProduct: 'Produk',
  colContribution: 'Kontribusi',
  contributionDef:
    'Porsi revenue produk dari Total Revenue. Nilai tagihan dibagi ke produk di dalamnya sebanding qty × harga katalog, jadi diskon paket ikut terbagi.',
  sku: (sku) => `SKU ${sku}`,
  shareOfRevenue: (pct) => `${pct} dari revenue`,

  insightsTitle: 'Insight Bisnis',
  insightsDesc: 'Disusun otomatis dari data penjualan periode ini.',
  insightsEmpty: 'Belum cukup data untuk menarik kesimpulan pada periode ini.',
  insightCopy: INSIGHT_COPY_ID,

  howCalculated: 'Cara angka dihitung',
  defRevenueTerm: 'Revenue (Net Sales)',
  defRevenue:
    ' = total nilai tagihan ke jastiper. Nilai tagihan dikunci saat tagihan terbit, jadi tidak berubah walau harga katalog diubah.',
  defDiscountTerm: 'Diskon',
  defDiscount:
    ': harga paket sudah termasuk di Net Sales. Diskon belum tercatat terpisah, jadi Gross Sales dan Discounts belum ditampilkan sebagai angka sendiri.',
  defInvoicesTerm: 'Tagihan & Pcs ditagih',
  defInvoices:
    ' hanya dari tagihan yang sudah terbit. Pcs yang sudah disetujui saat dicek tapi belum ditagih belum masuk di sini; angka itu ada di Analisa Event sebagai “Pcs terjual”.',
  defCancelTerm: 'Pembatalan',
  defCancel:
    ': tagihan yang dibatalkan tidak dihitung sama sekali. Belum ada fitur retur/refund.',
  defExcludedTerm: 'Tidak termasuk',
  defExcluded:
    ': ongkir, biaya admin ALAKA, dan status pembayaran. Revenue bukan profit dan bukan dana yang sudah diterima. Profit belum dihitung karena biaya produk dan operasional belum tersedia.',
  defDateTerm: 'Tanggal',
  defDate:
    ' transaksi = tanggal tagihan terbit, dikelompokkan dalam WIB (GMT+7).',

  eventAnalysis: 'Analisa Event',
  analysisCrumb: 'Analisa',
  backToEvent: 'Kembali ke event',
  analysisLoadFailed: 'Gagal memuat analisa event.',
  loadingAnalysis: 'Memuat analisa',
  noJastiperTitle: 'Belum ada jastiper yang ikut',
  noJastiperBody:
    'Analisa akan muncul setelah jastiper bergabung dan mulai mengirim pesanan.',
  summary: 'Ringkasan',
  productsSold: (count) => `${count} produk laku`,
  billedSplit: (billed, notBilled) =>
    `${billed} sudah ditagih · ${notBilled} belum`,
  allBilled: 'Semua sudah ditagih',
  kpiBilled: 'Total ditagih',
  billedHint: (count, paidPct) => `${count} tagihan · ${paidPct}% sudah lunas`,
  noInvoices: 'Belum ada tagihan',
  kpiBilledDef:
    'Total nilai tagihan aktif ke jastiper di event ini, tidak termasuk tagihan yang dibatalkan. Sama dengan Total Revenue event ini di Dashboard. Bukan profit dan bukan dana yang sudah diterima.',
  kpiSold: 'Pcs terjual',
  kpiSoldDefSlot:
    'Pcs yang disetujui saat dicek, sudah ditagih maupun belum. Dashboard hanya menghitung pcs yang sudah ditagih. Isi paket dihitung per pcs.',
  kpiSoldDef:
    'Semua pcs yang dipesan lewat jastiper. Isi paket dihitung per pcs.',
  kpiJoined: 'Jastiper ikut',
  joinedSubmitted: (count) => `${count} sudah submit`,
  joinedActive: (count) => `${count} ada pesanan`,
  kpiJoinedDef: 'Jastiper yang menekan Ikut Event di event ini.',
  kpiRejected: 'Pcs ditolak',
  rejectedHint: 'Tidak tersedia saat dicek',
  allAvailable: 'Semua pesanan tersedia',
  kpiRejectedDef:
    'Pcs yang tidak bisa dipenuhi saat dicek (stok tidak tersedia). Tidak ditagih.',
  highlights: 'Sorotan event',
  highlightsDesc: 'Disusun otomatis dari data event ini.',
  highlightsEmpty: 'Belum cukup data untuk menarik kesimpulan dari event ini.',
  insightTopProduct: (name, pcs, jastiper) =>
    `${name} paling laku: ${pcs} pcs lewat ${jastiper} jastiper.`,
  insightTopJastiper: (name, pcs) =>
    `${name} menjual pcs terbanyak (${pcs} pcs).`,
  insightStockOutHot: (count, hot) =>
    `${count} varian habis, ${hot} di antaranya sempat dipesan. Pertimbangkan tambah stok untuk event berikutnya.`,
  insightStockOut: (count) => `${count} varian habis.`,
  insightRejected: (count) =>
    `${count} pcs ditolak karena tidak tersedia saat dicek.`,
  insightTopSize: (size, pcs) => `Ukuran ${size} paling dicari (${pcs} pcs).`,
  pcsRejectedTitle: (count) => `${count} pcs ditolak`,
  flowTitle: 'Alur pcs',
  flowDesc: (count) => `${count} pcs dipesan lewat jastiper di event ini.`,
  flowEmpty: 'Belum ada pesanan produk.',
  flowSold: 'Terjual',
  flowWaiting: 'Menunggu dicek',
  flowRejected: 'Ditolak',
  flowDraft: 'Belum disubmit',
  flowSingle: 'Satuan',
  flowBundle: 'Lewat paket',
  activityTitle: 'Aktivitas submit',
  activityDesc: (granularity) =>
    `Pcs yang dikirim jastiper per ${granularity} (WIB).`,
  activityEmpty: 'Belum ada submit pesanan.',
  activityPcsFrom: (submits) => `pcs dari ${submits} submit`,
  activityPeak: 'Paling ramai:',
  activityBarLabel: (label, pcs, submits) =>
    `${label}: ${pcs} pcs dari ${submits} submit`,
  bestProducts: 'Produk terlaris',
  bestProductsDesc: 'Urut pcs terjual. Klik produk untuk melihat per varian.',
  bestProductsEmpty: 'Belum ada produk yang terjual.',
  jastiperCount: (count) => `${count} jastiper`,
  rejectedCount: (count) => `${count} ditolak`,
  standardVariant: 'Standar',
  topJastiper: 'Jastiper teratas',
  topJastiperDesc: 'Urut pcs terjual. Klik untuk melihat detail jastiper.',
  colJastiper: 'Jastiper',
  colPcs: 'Pcs',
  colBilled: 'Ditagih',
  paid: 'Lunas',
  paidPct: (pct) => `${pct}% lunas`,
  stockTitle: 'Stok produk',
  stockDesc: 'Stok saat ini dari produk yang dibawa ke event.',
  stockFilter: 'Filter stok',
  stockOutTab: (count) => `Habis · ${count}`,
  stockLowTab: (count) => `Hampir habis · ${count}`,
  stockOutEmpty: 'Tidak ada varian yang habis.',
  stockLowEmpty: 'Tidak ada varian yang hampir habis.',
  soldWord: 'terjual',
  rejectedWord: 'ditolak',
  notOrderedHere: 'tidak dipesan di event ini',
  soldOut: 'Habis',
  stockLeft: (qty) => `Sisa ${qty}`,
  unmetTitle: 'Permintaan tak terpenuhi',
  unmetDesc: 'Pcs ditolak terbanyak, sinyal untuk menambah stok.',
  unmetEmpty: 'Semua pesanan tersedia. Tidak ada pcs yang ditolak.',
  sizesTitle: 'Ukuran terlaris',
  minOrderTitle: 'Minimal pembelian',
  minOrderDesc: (min: string | null) =>
    min
      ? `Minimal saat ini ${min}. Angka draft mengikuti pesanan saat ini.`
      : 'Event ini tanpa minimal pembelian.',
  minOrderJoined: 'Jastiper ikut',
  minOrderSubmitted: 'Sudah submit',
  minOrderStuck: 'Tertahan di bawah minimal',
  minOrderStuckAmount: 'Nilai draft tertahan',
  minOrderStuckNear: 'Tertahan, sudah 80% minimal atau lebih',
  minOrderBuckets: 'Nilai submit pertama',
  minOrderBucketsEmpty: 'Belum ada submit yang tercatat nilainya.',
  minOrderBelow: (v: string) => `Di bawah ${v}`,
  minOrderRange: (from: string, to: string) => `${from} sampai di bawah ${to}`,
  minOrderAbove: (v: string) => `${v} ke atas`,
  minOrderCount: (n: number) => `${n} jastiper`,
  sizesDesc: 'Pcs terjual per ukuran.',
  sizesEmpty: 'Produk di event ini belum memakai ukuran.',
}

export default { en, id }
