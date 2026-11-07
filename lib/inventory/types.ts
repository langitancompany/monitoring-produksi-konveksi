// lib/inventory/types.ts
//
// Bentuk data Stok Barang Jadi (PRD-inventori). Dipakai server (API) dan browser.

export type ReceiptStatus = "pending" | "verified" | "cancelled";

/** Satu baris stok = jenis produksi + varian + warna + ukuran (PRD §5.1). */
export interface SkuParts {
  jenis_produksi: string;
  varian?: string | null;
  warna?: string | null;
  ukuran?: string | null;
}

/** Baris hasil produksi yang diharapkan dari sebuah pesanan (hasil expectedLines). */
export interface ExpectedLine {
  sku_key: string;
  jenis_produksi: string;
  jenis_name: string;
  /** label tampilan ("Lainnya: Hijau" bila varian bebas) */
  varian: string;
  warna: string;
  ukuran: string;
  expected: number;
}

/** Baris verifikasi: hasil produksi + hitungan fisik petugas. Inilah yang dibekukan ke `lines`. */
export interface VerifiedLine extends ExpectedLine {
  counted: number;
}

/** Isi yang dikirim klien saat verifikasi: HANYA kunci + hitungan (expected dihitung server). */
export interface CountInput {
  sku_key: string;
  counted: number;
}

/** Alasan sebuah pergerakan: masuk dari produksi, atau salah satu penyesuaian. */
export type AdjustKind = "koreksi" | "rusak" | "hilang" | "opname";
export type MovementKind = "masuk" | AdjustKind;

export interface InventoryCaps {
  view: boolean;
  verify: boolean;
  /** izin edit yang sama dengan verify; dipisah supaya tombolnya jelas di UI */
  adjust: boolean;
  isSuperAdmin: boolean;
}

export interface InventoryMeta {
  caps: InventoryCaps;
  /** jumlah catatan menunggu verifikasi (lencana menu); 0 bila bukan pemegang izin Verifikasi */
  pending_count: number;
  user_id: string;
}

export interface StockRow {
  sku_key: string;
  jenis_produksi: string;
  jenis_name: string;
  varian: string;
  warna: string;
  ukuran: string;
  qty: number;
  last_in_at: string | null;
}

export interface StockResponse {
  rows: StockRow[];
  total_pcs: number;
}

export interface ReceiptListItem {
  id: string;
  order_id: string;
  kode_produksi: string;
  status: ReceiptStatus;
  qc_done_at: string;
  pj_name: string | null;
  /** pending: hasil produksi dari rincian pesanan · verified: hitungan fisik */
  total_pcs: number;
  total_expected: number | null;
  total_counted: number | null;
  has_diff: boolean;
  verified_by_name: string | null;
  verified_at: string | null;
}

export interface ReceiptDetail extends ReceiptListItem {
  note: string | null;
  deadline: string | null;
  /** pending: dihitung live dari orders.items · verified: snapshot · cancelled: kosong */
  lines: Array<ExpectedLine & { counted?: number }>;
}

export interface MovementRow {
  id: string;
  created_at: string;
  kind: MovementKind;
  /** kosong untuk penyesuaian */
  receipt_id: string | null;
  order_id: string | null;
  kode_produksi: string | null;
  sku_key: string;
  jenis_name: string;
  varian: string;
  warna: string;
  ukuran: string;
  delta: number;
  /** alasan selisih (masuk) atau alasan penyesuaian */
  note: string | null;
  by_name: string | null;
  /** hasil produksi baris ini menurut snapshot verifikasi; null bila tidak diketahui */
  expected: number | null;
  /** delta - expected; 0 = cocok */
  diff: number | null;
}

/** Isi yang dikirim klien saat penyesuaian; field yang dipakai bergantung pada jenisnya. */
export interface AdjustLineInput {
  sku_key: string;
  /** koreksi: bertanda, tidak nol */
  delta?: number;
  /** rusak, hilang: jumlah positif yang dikurangi */
  qty?: number;
  /** opname: hitungan fisik */
  counted?: number;
}
