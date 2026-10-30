// lib/finance/payments.ts
//
// Pembayaran: pemeriksaan isian & pemetaan baris (fungsi MURNI, bisa diuji). Aturan uang yang
// sebenarnya (bukti wajib, kelebihan bayar, pencatat ≠ pemverifikasi, refund) ada di database
// (migration 011); ini lapis pertama supaya galat jelas dan path bukti TIDAK PERNAH bocor ke browser.

import type { PaymentRow, PaymentMethod } from "./types";
import { isDate, isMoney, isUuid } from "./validate";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["transfer", "tunai", "qris", "lainnya"];
export const PAYMENT_STATUSES = ["pending", "verified", "rejected", "void"] as const;

export const PAYMENT_COLUMNS =
  "id, order_id, invoice_id, kind, amount, paid_at, method, account_id, reference_no, payer_name, note, status, " +
  "proof_path, recorded_by_name, recorded_at, verified_by_name, verified_at, reject_reason, " +
  "void_by_name, void_at, void_reason";

export interface PaymentFields {
  orderId: string;
  accountId: string;
  method: PaymentMethod;
  paidAt: string;
  amount: number;
  /** null = jenis (DP/cicilan/pelunasan) ditentukan database */
  kind: "refund" | null;
  reference: string | null;
  payer: string | null;
  note: string | null;
}

export type ParsePaymentResult =
  | { ok: true; value: PaymentFields }
  | { ok: false; error: string; status: number };

/** Periksa isian form pencatatan pembayaran. `get` mengambil nilai teks per nama isian. */
export function parsePaymentFields(
  get: (key: string) => string,
  caps: { maker: boolean },
): ParsePaymentResult {
  const fail = (error: string, status = 400): ParsePaymentResult => ({ ok: false, error, status });
  const s = (k: string) => (get(k) ?? "").trim();

  const orderId = s("order_id");
  const accountId = s("account_id");
  const method = s("method");
  const paidAt = s("paid_at");
  const kind = s("kind") || null;
  const amountText = s("amount");

  if (!isUuid(orderId)) return fail("Order tidak valid");
  if (!isUuid(accountId)) return fail("Pilih akun kas/bank");
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) return fail("Metode pembayaran tidak valid");
  if (!isDate(paidAt)) return fail("Tanggal pembayaran tidak valid");
  if (!/^\d{1,12}$/.test(amountText) || !isMoney(Number(amountText)) || Number(amountText) <= 0) {
    return fail("Nominal tidak valid");
  }
  if (kind !== null && kind !== "refund") return fail("Jenis pembayaran tidak valid");
  // Refund = uang keluar ke pelanggan → dicatat oleh Maker, lalu tetap harus diverifikasi Approver.
  if (kind === "refund" && !caps.maker) return fail("Refund hanya dapat dicatat oleh Maker", 403);

  return {
    ok: true,
    value: {
      orderId,
      accountId,
      method: method as PaymentMethod,
      paidAt,
      amount: Number(amountText),
      kind: kind as "refund" | null,
      reference: s("reference_no").slice(0, 100) || null,
      payer: s("payer_name").slice(0, 100) || null,
      note: s("note").slice(0, 500) || null,
    },
  };
}

export interface PaymentLookups {
  accounts: Map<string, string>;
  orders: Map<string, { kode_produksi: string; nama_pemesan: string }>;
}

/**
 * Baris database → PaymentRow untuk browser. `proof_path` dibuang; browser hanya tahu `has_proof`
 * dan meminta signed URL berumur pendek bila perlu.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPaymentRow(r: any, lookups?: PaymentLookups): PaymentRow {
  const { proof_path, ...rest } = r;
  return {
    ...rest,
    has_proof: Boolean(proof_path),
    account_name: lookups?.accounts.get(r.account_id) ?? null,
    orders: lookups?.orders.get(r.order_id) ?? null,
  } as PaymentRow;
}
