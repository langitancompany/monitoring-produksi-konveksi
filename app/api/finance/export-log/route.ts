// POST /api/finance/export-log  body: { scope: string, row_count: number }
// Mencatat siapa mengekspor data keuangan (file dibuat di browser). ExportButton memanggil ini LEBIH DULU dan
// tidak membuat file bila pencatatan gagal, jadi setiap ekspor yang terjadi pasti punya jejak.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad } from "@/lib/finance/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  const scope = typeof body?.scope === "string" ? body.scope.trim().slice(0, 80) : "";
  if (!scope) return bad("Permintaan tidak valid");
  const rowCount = Number.isFinite(Number(body?.row_count)) ? Math.max(0, Math.min(1_000_000, Math.floor(Number(body.row_count)))) : 0;

  const { error } = await getSupabaseAdmin().rpc("fin_audit", {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_action: "export.excel",
    p_entity: "export",
    p_entity_id: null,
    p_order: null,
    p_before: null,
    p_after: { scope, row_count: rowCount },
    p_reason: null,
  });
  if (error) return finFail(error);
  return NextResponse.json({ ok: true });
}
