// GET /api/finance/meta -> akun kas/bank, kategori pengeluaran, pengaturan, dan hak pengguna ini.
// Langkah 6.1 (fondasi). Jumlah transaksi menunggu verifikasi ditambah di langkah 6.3/6.5.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, loadSettings } from "@/lib/finance/server";
import type { FinanceMeta } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const admin = getSupabaseAdmin();
  const [acc, cat] = await Promise.all([
    admin.from("finance_accounts").select("id, code, name, type").eq("is_active", true).order("sort_order"),
    admin.from("finance_categories").select("id, code, name").eq("kind", "expense").eq("is_active", true).order("sort_order"),
  ]);
  const err = acc.error || cat.error;
  if (err) return finFail(err);

  const body: FinanceMeta = {
    accounts: acc.data ?? [],
    categories: cat.data ?? [],
    settings: await loadSettings(),
    caps: guard.actor.caps,
  };
  return NextResponse.json(body);
}
