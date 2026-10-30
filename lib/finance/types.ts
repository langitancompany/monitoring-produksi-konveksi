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
  caps: { view: boolean; maker: boolean; approver: boolean; delete: boolean; isSuperAdmin: boolean };
  /** jumlah pembayaran yang menunggu verifikasi (lencana tab Verifikasi) */
  pending_count: number;
  /** jumlah pengeluaran yang menunggu persetujuan (lencana tab Pengeluaran) */
  pending_expense_count: number;
  /** id pengguna yang sedang login (kunci centang tab Panduan agar tak tercampur antar pengguna) */
  user_id: string;
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

// ─── Pengeluaran (langkah 6.5) ──────────────────────────────────────────────────

export type ExpenseStatus = "pending" | "approved" | "rejected" | "void";
export type ExpenseSource = "manual" | "salary" | "purchase";

export interface FinanceVendor {
  id: string;
  name: string;
  phone: string | null;
}

export interface ExpenseRow {
  id: string;
  expense_no: string | null;
  category_id: string;
  account_id: string;
  vendor_id: string | null;
  order_id: string | null;
  source: ExpenseSource;
  source_ref: string | null;
  description: string;
  amount: number;
  spent_at: string;
  note: string | null;
  status: ExpenseStatus;
  /** true bila ada file bukti (path asli tidak pernah dikirim ke browser) */
  has_proof: boolean;
  recorded_by_name: string | null;
  recorded_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  void_by_name: string | null;
  void_at: string | null;
  void_reason: string | null;
  category_name: string | null;
  account_name: string | null;
  vendor_name: string | null;
  order_kode: string | null;
  order_nama: string | null;
}

/** Hasil pencarian pesanan untuk menautkan biaya langsung. */
export interface OrderLookupRow {
  id: string;
  kode_produksi: string;
  nama_pemesan: string;
}

export const EXPENSE_STATE_LABEL: Record<ExpenseStatus, string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  void: "Dibatalkan (void)",
};

// ─── Ringkasan, Laporan, Audit, Panduan (langkah 6.6) ───────────────────────────

export type AgingBucket = "belum_jatuh_tempo" | "telat_1_7" | "telat_8_30" | "telat_30_plus" | "tanpa_jatuh_tempo";

/** Respons GET /api/finance/overview (dihitung database oleh fin_overview). */
export interface OverviewData {
  period: { from: string; to: string };
  /** pembayaran terverifikasi pada rentang, sudah dikurangi refund */
  cash_in: number;
  /** nilai tagihan aktif pesanan yang masuk pada rentang (tanggal masuk pesanan) */
  tagihan_terbit: number;
  /** piutang = sisa tagihan aktif SAAT INI (tidak mengikuti rentang) */
  piutang_total: number;
  piutang_count: number;
  /** bagian piutang yang sudah lewat jatuh tempo (bucket telat_*) */
  piutang_overdue: number;
  /** pembayaran uang MASUK yang menunggu verifikasi (refund tidak dihitung) */
  pending_count: number;
  pending_amount: number;
  /** pengeluaran disetujui pada rentang */
  cash_out: number;
  expense_pending_count: number;
  expense_pending_amount: number;
  aging: { bucket: AgingBucket; count: number; amount: number }[];
  top_debtors: { order_id: string; kode_produksi: string; nama_pemesan: string; balance: number; days_overdue: number }[];
  /** saldo akun aktif SAAT INI */
  accounts: { id: string; code: string; name: string; type: FinanceAccount["type"]; balance: number }[];
}

export interface ReportMonth {
  /** "YYYY-MM" */
  month: string;
  /** Pendapatan = nilai tagihan pesanan yang masuk pada bulan itu (tanggal masuk pesanan) */
  revenue: number;
  /** pengeluaran disetujui pada bulan itu */
  expenses: number;
  /** revenue − expenses */
  profit: number;
  /** pembayaran terverifikasi bersih refund */
  cash_in: number;
  cash_out: number;
  cash_net: number;
}

export interface ReportOrder {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  tanggal_masuk: string | null;
  total: number;
  paid: number;
  /** semua pengeluaran disetujui yang ditautkan ke pesanan ini (seluruh waktu) */
  direct_cost: number;
  /** total − direct_cost */
  gross: number;
}

/** Respons GET /api/finance/report (dihitung database oleh fin_report). */
export interface ReportData {
  period: { from: string; to: string };
  totals: {
    revenue: number;
    expenses: number;
    profit: number;
    cash_in: number;
    cash_out: number;
    cash_net: number;
    /** sisa tagihan dari pesanan yang masuk pada periode ini */
    unpaid_billed: number;
    expenses_linked: number;
    expenses_unlinked: number;
  };
  months: ReportMonth[];
  by_category: { name: string; amount: number }[];
  /** maksimal 300 pesanan terbaru; jumlah seluruhnya di orders_total */
  orders: ReportOrder[];
  orders_total: number;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  order_id: string | null;
  order_kode: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Jenis catatan yang saat ini ditulis fungsi database (bertambah di langkah 6.7–6.8). */
export const AUDIT_ENTITIES = ["payment", "invoice", "expense", "vendor", "export", "settings"] as const;

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  payment: "Pembayaran",
  invoice: "Tagihan",
  expense: "Pengeluaran",
  vendor: "Vendor",
  export: "Ekspor data",
  settings: "Pengaturan",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "invoice.issue": "Terbitkan tagihan",
  "invoice.revise": "Revisi tagihan",
  "payment.record": "Catat pembayaran",
  "payment.verify": "Verifikasi pembayaran",
  "payment.reject": "Tolak pembayaran",
  "payment.void": "Void pembayaran",
  "expense.record": "Catat pengeluaran",
  "expense.approve": "Setujui pengeluaran",
  "expense.reject": "Tolak pengeluaran",
  "expense.void": "Void pengeluaran",
  "vendor.create": "Tambah vendor",
  "export.excel": "Ekspor Excel",
  "settings.invoice": "Ubah pengaturan invoice",
};

/** Respons GET /api/finance/todo (dihitung database oleh fin_todo). */
export interface TodoData {
  pending_payments: { count: number; amount: number; oldest_days: number | null };
  pending_expenses: { count: number; amount: number; oldest_days: number | null };
  /** tagihan yang sudah lewat jatuh tempo dan masih ada sisa */
  overdue: { count: number; amount: number };
  /** pesanan masuk 30 hari terakhir yang sudah punya rincian item tetapi belum ditagih */
  unbilled_recent: { count: number; since: string };
}
