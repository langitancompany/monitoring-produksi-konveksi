// lib/finance/expensesDb.ts  (SERVER ONLY)
// Melengkapi baris pengeluaran dengan nama kategori, akun, vendor, dan pesanan (tanpa embed PostgREST).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseRow } from "./types";
import { toExpenseRow, type ExpenseLookups } from "./expenses";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hydrateExpenses(admin: SupabaseClient, rows: any[]): Promise<ExpenseRow[]> {
  if (rows.length === 0) return [];
  const orderIds = [...new Set(rows.map((r) => r.order_id as string | null).filter((v): v is string => !!v))];

  const [cat, acc, ven, ord] = await Promise.all([
    admin.from("finance_categories").select("id, name"),
    admin.from("finance_accounts").select("id, name"),
    admin.from("finance_vendors").select("id, name"),
    orderIds.length
      ? admin.from("orders").select("id, kode_produksi, nama_pemesan").in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; kode_produksi: string; nama_pemesan: string }[] }),
  ]);
  const names = (d: { id: string; name: string }[] | null) => new Map((d ?? []).map((x) => [x.id, x.name]));
  const lookups: ExpenseLookups = {
    categories: names(cat.data),
    accounts: names(acc.data),
    vendors: names(ven.data),
    orders: new Map(
      (ord.data ?? []).map((o) => [o.id, { kode_produksi: o.kode_produksi, nama_pemesan: o.nama_pemesan }]),
    ),
  };
  return rows.map((r) => toExpenseRow(r, lookups));
}
