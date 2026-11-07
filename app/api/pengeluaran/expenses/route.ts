// GET  /api/pengeluaran/expenses -> pengeluaran yang DICATAT OLEH PENGGUNA INI SAJA (200 terbaru)
// POST /api/pengeluaran/expenses (multipart/form-data) -> catat pengeluaran (+ bukti)
//
// Daftar dikunci ke recorded_by = pengguna ini di server, bukan di browser: user yang hanya punya izin
// Catat Pengeluaran tidak bisa melihat pengeluaran orang lain. Persetujuan tetap lewat Approver di menu Keuangan.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireExpenseEntry, finFail } from "@/lib/finance/server";
import { EXPENSE_COLUMNS } from "@/lib/finance/expenses";
import { recordExpenseFromRequest } from "@/lib/finance/expenseEntry";
import { hydrateExpenses } from "@/lib/finance/expensesDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireExpenseEntry(req);
  if (!guard.ok) return guard.response;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_expenses")
    .select(EXPENSE_COLUMNS)
    .eq("recorded_by", guard.actor.userId)
    .order("spent_at", { ascending: false })
    .order("recorded_at", { ascending: false })
    .limit(200);
  if (error) return finFail(error);
  return NextResponse.json({ rows: await hydrateExpenses(admin, data ?? []) });
}

export async function POST(req: NextRequest) {
  const guard = await requireExpenseEntry(req);
  if (!guard.ok) return guard.response;
  return recordExpenseFromRequest(req, guard.actor);
}
