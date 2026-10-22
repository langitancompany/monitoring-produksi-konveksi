// lib/finance/expenses.ts
//
// Pengeluaran: pemeriksaan isian, pemetaan baris, dan pembersih kata kunci (fungsi MURNI, bisa diuji).
// Aturan uang yang sebenarnya (bukti wajib di atas ambang, pencatat ≠ penyetuju, alasan, anti-dobel) ada di
// database (migration 012); ini lapis pertama supaya galat jelas dan path bukti TIDAK PERNAH bocor ke browser.

import type { ExpenseRow, ExpenseStatus } from "./types";
import { isDate, isMoney, isUuid } from "./validate";

export const EXPENSE_STATUSES: readonly ExpenseStatus[] = ["pending", "approved", "rejected", "void"];

export const EXPENSE_COLUMNS =
  "id, expense_no, category_id, account_id, vendor_id, order_id, source, source_ref, description, amount, spent_at, " +
  "note, status, proof_path, recorded_by_name, recorded_at, approved_by_name, approved_at, reject_reason, " +
  "void_by_name, void_at, void_reason";

export interface ExpenseFields {
  categoryId: string;
  accountId: string;
  vendorId: string | null;
  orderId: string | null;
  description: string;
  amount: number;
  spentAt: string;
  note: string | null;
}

export type ParseExpenseResult = { ok: true; value: ExpenseFields } | { ok: false; error: string; status: number };

/** Periksa isian form pencatatan pengeluaran. `get` mengambil nilai teks per nama isian. */
export function parseExpenseFields(get: (key: string) => string): ParseExpenseResult {
  const fail = (error: string): ParseExpenseResult => ({ ok: false, error, status: 400 });
  const s = (k: string) => (get(k) ?? "").trim();

  const categoryId = s("category_id");
  const accountId = s("account_id");
  const vendorId = s("vendor_id");
  const orderId = s("order_id");
  const description = s("description").replace(/\s+/g, " ");
  const spentAt = s("spent_at");
  const amountText = s("amount");

  if (!isUuid(categoryId)) return fail("Pilih kategori pengeluaran");
  if (!isUuid(accountId)) return fail("Pilih akun kas/bank");
  if (vendorId && !isUuid(vendorId)) return fail("Vendor tidak valid");
  if (orderId && !isUuid(orderId)) return fail("Order tidak valid");
  if (description.length < 3) return fail("Keterangan wajib diisi (minimal 3 karakter)");
  if (!isDate(spentAt)) return fail("Tanggal tidak valid");
  if (!/^\d{1,12}$/.test(amountText) || !isMoney(Number(amountText)) || Number(amountText) <= 0) {
    return fail("Nominal tidak valid");
  }

  return {
    ok: true,
    value: {
      categoryId,
      accountId,
      vendorId: vendorId || null,
      orderId: orderId || null,
      description: description.slice(0, 200),
      amount: Number(amountText),
      spentAt,
      note: s("note").slice(0, 500) || null,
    },
  };
}

export interface ExpenseLookups {
  categories: Map<string, string>;
  accounts: Map<string, string>;
  vendors: Map<string, string>;
  orders: Map<string, { kode_produksi: string; nama_pemesan: string }>;
}

/**
 * Baris database → ExpenseRow untuk browser. `proof_path` dibuang; browser hanya tahu `has_proof`
 * dan meminta signed URL berumur pendek bila perlu.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toExpenseRow(r: any, lookups?: ExpenseLookups): ExpenseRow {
  const { proof_path, ...rest } = r;
  const order = r.order_id ? lookups?.orders.get(r.order_id) : undefined;
  return {
    ...rest,
    has_proof: Boolean(proof_path),
    category_name: lookups?.categories.get(r.category_id) ?? null,
    account_name: lookups?.accounts.get(r.account_id) ?? null,
    vendor_name: r.vendor_id ? (lookups?.vendors.get(r.vendor_id) ?? null) : null,
    order_kode: order?.kode_produksi ?? null,
    order_nama: order?.nama_pemesan ?? null,
  } as ExpenseRow;
}

/**
 * Bersihkan kata kunci pencarian pesanan: buang karakter pola (% _ * \) agar tidak jadi wildcard,
 * rapikan spasi, batasi 60 karakter. Hasil kurang dari 2 karakter = jangan mencari ("").
 */
export function sanitizeLookupQuery(q: string | null | undefined): string {
  const cleaned = (q ?? "").replace(/[%_*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return cleaned.length >= 2 ? cleaned : "";
}
