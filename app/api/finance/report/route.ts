// GET /api/finance/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Laporan laba (basis tagihan) dan arus kas (basis uang) per bulan, per kategori, dan per pesanan —
// dihitung database (fin_report, migration 013). Data sensitif manajemen: hanya yang berhak menyetujui
// (keuangan.edit) atau Super Admin.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad, isDate, todayWib } from "@/lib/finance/server";
import type { ReportData } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "edit");
  if (!guard.ok) return guard.response;

  const today = todayWib();
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? `${today.slice(0, 4)}-01-01`;
  const to = sp.get("to") ?? today;
  if (!isDate(from) || !isDate(to) || from > to) return bad("Rentang tanggal tidak valid");

  const { data, error } = await getSupabaseAdmin().rpc("fin_report", { p_from: from, p_to: to });
  if (error) return finFail(error);
  return NextResponse.json(data as ReportData);
}
