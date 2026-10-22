// GET /api/finance/meta -> akun kas/bank, kategori pengeluaran, pengaturan, dan hak pengguna ini.
// Langkah 6.1 (fondasi) + 6.4: jumlah pembayaran yang menunggu verifikasi (lencana tab Verifikasi)
// + 6.5: jumlah pengeluaran yang menunggu persetujuan (lencana tab Pengeluaran).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, loadSettings } from "@/lib/finance/server";
import type { FinanceMeta } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const admin = getSupabaseAdmin();
  const [acc, cat, pend, pendExp] = await Promise.all([
    admin.from("finance_accounts").select("id, code, name, type").eq("is_active", true).order("sort_order"),
    admin.from("finance_categories").select("id, code, name").eq("kind", "expense").eq("is_active", true).order("sort_order"),
    admin.from("order_payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("finance_expenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const err = acc.error || cat.error || pend.error || pendExp.error;
  if (err) return finFail(err);

  const body: FinanceMeta = {
    accounts: acc.data ?? [],
    categories: cat.data ?? [],
    settings: await loadSettings(),
    caps: guard.actor.caps,
    pending_count: pend.count ?? 0,
    pending_expense_count: pendExp.count ?? 0,
  };
  return NextResponse.json(body);
}
