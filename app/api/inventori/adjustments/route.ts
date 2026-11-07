// POST /api/inventori/adjustments   body: { kind, reason, lines }
//   kind: koreksi (lines: {sku_key, delta}) | rusak, hilang ({sku_key, qty}) | opname ({sku_key, counted})
// Izin: edit Stok Barang Jadi. Hasilnya baris tambah/kurang di buku besar; baris lama tidak diubah.
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, adjustStock } from "@/lib/inventory/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireInventori(req, "adjust");
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  return adjustStock(guard.actor, body as { kind?: unknown; lines?: unknown; reason?: unknown });
}
