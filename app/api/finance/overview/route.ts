// GET /api/finance/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
// Angka kartu Ringkasan; seluruhnya dihitung database (fin_overview, migration 013) — tanpa batas baris.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad, isDate, todayWib } from "@/lib/finance/server";
import type { OverviewData } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const today = todayWib();
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? `${today.slice(0, 8)}01`;
  const to = sp.get("to") ?? today;
  if (!isDate(from) || !isDate(to) || from > to) return bad("Rentang tanggal tidak valid");

  const { data, error } = await getSupabaseAdmin().rpc("fin_overview", { p_from: from, p_to: to });
  if (error) return finFail(error);
  return NextResponse.json(data as OverviewData);
}
