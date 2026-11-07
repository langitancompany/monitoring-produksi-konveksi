// POST /api/inventori/receipts/:id/verify   body: { lines: [{ sku_key, counted }], note? }
// Izin: Verifikasi stok masuk. Server menyusun `expected` sendiri dari rincian pesanan dan menolak
// sku_key yang tidak ada di hasil produksi; nilai `expected` dari klien tidak pernah dipakai.
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, verifyReceipt, isUuid } from "@/lib/inventory/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireInventori(req, "verify");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!isUuid(id) || !body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  return verifyReceipt(guard.actor, id, body as { lines?: unknown; note?: unknown });
}
