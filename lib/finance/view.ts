// lib/finance/view.ts
//
// Logika MURNI untuk layar Keuangan (langkah 6.4): menyaring & menjumlah daftar tagihan, aturan
// isian form pembayaran, dan harga awal form tagihan. Tidak menyentuh React/Supabase, jadi bisa
// diuji (tests/finance.test.ts). Ini HANYA bantuan tampilan: angka resmi dan semua aturan uang
// tetap dihitung/ditegakkan database (fungsi fin_*) — jangan dijadikan sumber kebenaran.

import type { OrderItem } from "@/types/order";
import type { InvoiceLine } from "./pricing";
import type { ExpenseRow, OrderFinanceRow, PaymentMethod, PaymentRow } from "./types";
import { daysUntil } from "../utils";

export const INVOICE_FILTERS = ["Semua", "Belum Ditagih", "Belum Bayar", "DP", "Lunas", "Kelebihan Bayar"] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

/** Saring baris posisi keuangan menurut status & kata kunci (kode produksi / nama pemesan). */
export function filterFinanceRows(rows: OrderFinanceRow[], q: string, filter: InvoiceFilter): OrderFinanceRow[] {
  const s = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (filter === "Semua" || r.payment_status === filter) &&
      (!s || (r.kode_produksi ?? "").toLowerCase().includes(s) || (r.nama_pemesan ?? "").toLowerCase().includes(s)),
  );
}

/** Jumlah baris per status (kunci "Semua" = seluruhnya). Semua filter selalu ada, minimal 0. */
export function countByFilter(rows: OrderFinanceRow[]): Record<InvoiceFilter, number> {
  const c = Object.fromEntries(INVOICE_FILTERS.map((f) => [f, 0])) as Record<InvoiceFilter, number>;
  c.Semua = rows.length;
  for (const r of rows) {
    if (r.payment_status in c) c[r.payment_status as InvoiceFilter] += 1;
  }
  return c;
}

export interface FinanceTotals {
  total: number;
  paid: number;
  pending: number;
  balance: number;
}

export function totalsOf(rows: OrderFinanceRow[]): FinanceTotals {
  return rows.reduce<FinanceTotals>(
    (t, r) => ({
      total: t.total + (r.total ?? 0),
      paid: t.paid + (r.paid_verified ?? 0),
      pending: t.pending + (r.paid_pending ?? 0),
      balance: t.balance + (r.balance ?? 0),
    }),
    { total: 0, paid: 0, pending: 0, balance: 0 },
  );
}

/** Tagihan aktif yang masih punya sisa dan jatuh temponya sudah lewat (hari ini belum dihitung lewat). */
export function isOverdue(
  r: Pick<OrderFinanceRow, "invoice_id" | "balance" | "due_date">,
  today: Date = new Date(),
): boolean {
  if (!r.invoice_id || !(r.balance > 0) || !r.due_date) return false;
  const d = daysUntil(r.due_date, today);
  return Number.isFinite(d) && d < 0;
}

/**
 * Harga awal form tagihan: harga per pcs dari tagihan aktif untuk item yang MASIH ada
 * (cocok menurut id item). Item baru / tanpa riwayat = 0 (harus diisi). Tanpa tagihan aktif = semua 0.
 */
export function initialPrices(items: OrderItem[], active: InvoiceLine[] | null | undefined): Record<string, number> {
  const byId = new Map((active ?? []).map((l) => [l.item_id, l.harga_per_pcs]));
  return Object.fromEntries(items.map((it) => [it.id, byId.get(it.id) ?? 0]));
}

/** Jumlah uang kas masuk bersih dari transaksi TERVERIFIKASI (refund mengurangi). */
export function netVerified(rows: Pick<PaymentRow, "status" | "kind" | "amount">[]): number {
  return rows
    .filter((r) => r.status === "verified")
    .reduce((n, r) => n + (r.kind === "refund" ? -r.amount : r.amount), 0);
}

export interface PaymentFormInput {
  amount: number;
  /** sisa tagihan menurut database (total − terverifikasi) */
  balance: number;
  /** pembayaran yang masih menunggu verifikasi — ikut dihitung database terhadap sisa tagihan */
  paidPending: number;
  paidVerified: number;
  isRefund: boolean;
  allowOverpayment: boolean;
  method: PaymentMethod;
  requireProofNonCash: boolean;
  hasAccount: boolean;
  hasDate: boolean;
  hasFile: boolean;
}

export interface PaymentFormState {
  /** bukti wajib diunggah (non-tunai + pengaturan menyala) */
  needProof: boolean;
  /** batas nominal yang boleh dicatat (pembayaran: sisa − menunggu verifikasi; refund: uang terverifikasi).
   *  Refund yang masih menunggu verifikasi juga mengurangi batas di database — tidak terlihat di sini. */
  maxAmount: number;
  overLimit: boolean;
  canSubmit: boolean;
}

/**
 * Aturan tombol "Simpan" form pembayaran — mencerminkan fin_record_payment (migration 011) supaya
 * galat tampil sebelum dikirim. Database tetap memeriksa ulang semuanya.
 */
export function paymentFormState(i: PaymentFormInput): PaymentFormState {
  const needProof = i.method !== "tunai" && i.requireProofNonCash;
  const maxAmount = i.isRefund ? Math.max(0, i.paidVerified) : Math.max(0, i.balance - i.paidPending);
  // Refund selalu dibatasi uang terverifikasi (tak ikut pengaturan kelebihan bayar, sama dengan 011).
  const overLimit = (i.isRefund || !i.allowOverpayment) && i.amount > maxAmount;
  const canSubmit =
    Number.isSafeInteger(i.amount) &&
    i.amount > 0 &&
    i.hasAccount &&
    i.hasDate &&
    (!needProof || i.hasFile) &&
    !overLimit;
  return { needProof, maxAmount, overLimit, canSubmit };
}

// ─── Pengeluaran (langkah 6.5) ──────────────────────────────────────────────────

/** Bukti pengeluaran wajib bila ambang > 0 dan nominal mencapai ambang (sama dengan fin_record_expense, 012). */
export function expenseProofRequired(amount: number, threshold: number): boolean {
  return threshold > 0 && amount >= threshold;
}

export interface ExpenseFormInput {
  amount: number;
  /** pengaturan expense_proof_required_above (0 = tidak wajib) */
  threshold: number;
  hasCategory: boolean;
  hasAccount: boolean;
  hasDate: boolean;
  description: string;
  hasFile: boolean;
}

/** Aturan tombol "Simpan" form pengeluaran — mencerminkan fin_record_expense; database memeriksa ulang. */
export function expenseFormState(i: ExpenseFormInput): { needProof: boolean; canSubmit: boolean } {
  const needProof = expenseProofRequired(i.amount, i.threshold);
  const canSubmit =
    Number.isSafeInteger(i.amount) &&
    i.amount > 0 &&
    i.hasCategory &&
    i.hasAccount &&
    i.hasDate &&
    i.description.trim().length >= 3 &&
    (!needProof || i.hasFile);
  return { needProof, canSubmit };
}

export interface ExpenseTotals {
  approved: number;
  pending: number;
  pendingCount: number;
}

/** Jumlah uang keluar DISETUJUI dan yang masih menunggu persetujuan (ditolak/void tidak dihitung). */
export function expenseTotals(rows: Pick<ExpenseRow, "status" | "amount">[]): ExpenseTotals {
  const t: ExpenseTotals = { approved: 0, pending: 0, pendingCount: 0 };
  for (const r of rows) {
    if (r.status === "approved") t.approved += r.amount;
    else if (r.status === "pending") {
      t.pending += r.amount;
      t.pendingCount += 1;
    }
  }
  return t;
}

/** Total per kategori (hanya yang DISETUJUI), terbesar dulu, dibatasi `top`. */
export function expensesByCategory(
  rows: Pick<ExpenseRow, "status" | "amount" | "category_name">[],
  top = 6,
): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "approved") continue;
    const k = r.category_name ?? "Tanpa kategori";
    m.set(k, (m.get(k) ?? 0) + r.amount);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
}
