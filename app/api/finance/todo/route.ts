// GET /api/finance/todo -> angka "perlu tindakan" untuk tab Panduan (antrean, piutang telat, pesanan belum ditagih).
// Dihitung database (fin_todo, migration 013).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail } from "@/lib/finance/server";
import type { TodoData } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const { data, error } = await getSupabaseAdmin().rpc("fin_todo");
  if (error) return finFail(error);
  return NextResponse.json(data as TodoData);
}
