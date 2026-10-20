// lib/finance/paymentsDb.ts  (SERVER ONLY)
// Melengkapi baris pembayaran dengan nama akun & pesanan (tanpa embed PostgREST, lebih tahan galat).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentRow } from "./types";
import { toPaymentRow, type PaymentLookups } from "./payments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hydratePayments(admin: SupabaseClient, rows: any[]): Promise<PaymentRow[]> {
  if (rows.length === 0) return [];
  const orderIds = [...new Set(rows.map((r) => r.order_id as string))];

  const [acc, ord] = await Promise.all([
    admin.from("finance_accounts").select("id, name"),
    admin.from("orders").select("id, kode_produksi, nama_pemesan").in("id", orderIds),
  ]);
  const lookups: PaymentLookups = {
    accounts: new Map((acc.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name])),
    orders: new Map(
      (ord.data ?? []).map((o: { id: string; kode_produksi: string; nama_pemesan: string }) => [
        o.id,
        { kode_produksi: o.kode_produksi, nama_pemesan: o.nama_pemesan },
      ]),
    ),
  };
  return rows.map((r) => toPaymentRow(r, lookups));
}
