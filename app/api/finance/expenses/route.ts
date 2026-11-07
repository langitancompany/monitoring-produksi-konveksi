// GET  /api/finance/expenses?status=&from=&to=&category_id=&vendor_id=&order_id=  -> daftar pengeluaran
// POST /api/finance/expenses (multipart/form-data)                                -> catat pengeluaran (+ bukti)
//
// Semua pengeluaran masuk antrean persetujuan (pending). Langsung disetujui hanya bila pengaturan
// auto_approve_own_expense menyala, pencatat berhak menyetujui, dan require_separate_verifier mati —
// dan database memeriksa ulang ketiganya.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad, isUuid, isDate } from "@/lib/finance/server";
import { EXPENSE_COLUMNS, EXPENSE_STATUSES } from "@/lib/finance/expenses";
import { recordExpenseFromRequest } from "@/lib/finance/expenseEntry";
import { hydrateExpenses } from "@/lib/finance/expensesDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  const categoryId = sp.get("category_id");
  const vendorId = sp.get("vendor_id");
  const orderId = sp.get("order_id");
  if (status && !(EXPENSE_STATUSES as readonly string[]).includes(status)) return bad("Status tidak valid");
  if ((from && !isDate(from)) || (to && !isDate(to))) return bad("Tanggal tidak valid");
  for (const id of [categoryId, vendorId, orderId]) if (id && !isUuid(id)) return bad("Filter tidak valid");

  const admin = getSupabaseAdmin();
  let q = admin.from("finance_expenses").select(EXPENSE_COLUMNS);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("spent_at", from);
  if (to) q = q.lte("spent_at", to);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (vendorId) q = q.eq("vendor_id", vendorId);
  if (orderId) q = q.eq("order_id", orderId);

  const { data, error } = await q
    .order("spent_at", { ascending: false })
    .order("recorded_at", { ascending: false })
    .limit(1000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: await hydrateExpenses(admin, data ?? []) });
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, "maker");
  if (!guard.ok) return guard.response;
  return recordExpenseFromRequest(req, guard.actor);
}
