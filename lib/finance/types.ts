// lib/finance/types.ts
// Tipe Keuangan yang dipakai bersama API route (server) dan komponen (client).
// Ditambah bertahap per langkah — lihat docs/PRD.md §21.

import type { FinanceSettings } from "./validate";
import type { InvoiceLine } from "./pricing";
import type { OrderItem } from "@/types/order";
export type { FinanceSettings } from "./validate";

export interface FinanceAccount {
  id: string;
  code: string;
  name: string;
  type: "cash" | "bank" | "ewallet";
}

export interface FinanceCategory {
  id: string;
  code: string;
  name: string;
}

/** Respons GET /api/finance/meta. */
export interface FinanceMeta {
  accounts: FinanceAccount[];
  /** kategori pengeluaran aktif */
  categories: FinanceCategory[];
  settings: FinanceSettings;
  /** hak pengguna yang sedang login (hasil hitung server) */
  caps: { view: boolean; create: boolean; edit: boolean; delete: boolean; isSupervisor: boolean };
}

export const ACCOUNT_TYPE_LABEL: Record<FinanceAccount["type"], string> = {
  cash: "Kas tunai",
  bank: "Bank",
  ewallet: "E-wallet",
};

// ─── Tagihan (langkah 6.2) ──────────────────────────────────────────────────────

/** Status tagihan pesanan. DIHITUNG di database (view v_order_finance), bukan diinput. */
export type OrderPaymentStatus = "Belum Ditagih" | "Belum Bayar" | "DP" | "Lunas" | "Kelebihan Bayar";

export interface OrderFinanceRow {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  jenis_produksi: string | null;
  jumlah: number;
  tanggal_masuk: string | null;
  deadline: string | null;
  order_status: string;
  invoice_id: string | null;
  invoice_version: number | null;
  due_date: string | null;
  total: number;
  paid_verified: number;
  paid_pending: number;
  balance: number;
  overpaid: number;
  payment_status: OrderPaymentStatus;
  kategori: "utama" | "non_utama";
}

export interface InvoiceRow {
  id: string;
  order_id: string;
  version: number;
  status: "active" | "superseded";
  pricing_snapshot: InvoiceLine[];
  total_pcs: number;
  subtotal: number;
  discount: number;
  total: number;
  reason: string | null;
  due_date: string | null;
  issued_by_name: string | null;
  issued_at: string;
}

/** Respons GET /api/finance/orders/[orderId]. */
export interface OrderFinanceDetail {
  finance: OrderFinanceRow;
  order: {
    id: string;
    kode_produksi: string;
    nama_pemesan: string;
    no_hp: string | null;
    alamat_pemesan: string | null;
    jumlah: number;
    jenis_produksi: string | null;
    tanggal_masuk: string | null;
    kategori: "utama" | "non_utama";
    items: OrderItem[];
  };
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  /** true bila item pesanan berubah setelah tagihan aktif terbit → sarankan revisi */
  invoice_stale: boolean;
}

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  "Belum Ditagih": "Belum ditagih",
  "Belum Bayar": "Belum bayar",
  DP: "DP",
  Lunas: "Lunas",
  "Kelebihan Bayar": "Kelebihan bayar",
};

// ─── Pembayaran (langkah 6.3) ───────────────────────────────────────────────────

export type PaymentStatus = "pending" | "verified" | "rejected" | "void";
export type PaymentKind = "dp" | "cicilan" | "pelunasan" | "refund";
export type PaymentMethod = "transfer" | "tunai" | "qris" | "lainnya";

export interface PaymentRow {
  id: string;
  order_id: string;
  invoice_id: string | null;
  kind: PaymentKind;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  account_id: string;
  reference_no: string | null;
  payer_name: string | null;
  note: string | null;
  status: PaymentStatus;
  /** true bila ada file bukti (path asli tidak pernah dikirim ke browser) */
  has_proof: boolean;
  recorded_by_name: string | null;
  recorded_at: string;
  verified_by_name: string | null;
  verified_at: string | null;
  reject_reason: string | null;
  void_by_name: string | null;
  void_at: string | null;
  void_reason: string | null;
  account_name: string | null;
  orders?: { kode_produksi: string; nama_pemesan: string } | null;
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "Transfer",
  tunai: "Tunai",
  qris: "QRIS",
  lainnya: "Lainnya",
};

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  dp: "DP",
  cicilan: "Cicilan",
  pelunasan: "Pelunasan",
  refund: "Refund",
};

export const PAYMENT_STATE_LABEL: Record<PaymentStatus, string> = {
  pending: "Menunggu verifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  void: "Dibatalkan (void)",
};
