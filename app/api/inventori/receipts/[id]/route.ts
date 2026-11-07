// GET /api/inventori/receipts/:id -> satu catatan + barisnya.
// Menunggu: baris dihitung live dari rincian pesanan. Terverifikasi: dari snapshot yang dibekukan.
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, invFail, loadReceiptDetail, isUuid } from "@/lib/inventory/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireInventori(req, "view");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });

  try {
    const receipt = await loadReceiptDetail(id);
    if (!receipt) return NextResponse.json({ error: "Catatan stok tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ receipt });
  } catch (e) {
    return invFail(e as { message?: string; code?: string });
  }
}
