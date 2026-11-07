// GET /api/pengeluaran/meta -> kategori, akun kas/bank, dan ambang bukti untuk form Catat Pengeluaran.
// Aplikasi terpisah /pengeluaran. TIDAK memberi akses ke menu Keuangan: hanya data yang dibutuhkan form.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireExpenseEntry, finFail, loadSettings } from "@/lib/finance/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireExpenseEntry(req);
  if (!guard.ok) return guard.response;

  const admin = getSupabaseAdmin();
  const [acc, cat] = await Promise.all([
    admin.from("finance_accounts").select("id, code, name, type").eq("is_active", true).order("sort_order"),
    admin.from("finance_categories").select("id, code, name").eq("kind", "expense").eq("is_active", true).order("sort_order"),
  ]);
  const err = acc.error || cat.error;
  if (err) return finFail(err);

  const settings = await loadSettings();
  return NextResponse.json({
    accounts: acc.data ?? [],
    categories: cat.data ?? [],
    settings: { expense_proof_required_above: settings.expense_proof_required_above },
    user_name: guard.actor.name,
  });
}
