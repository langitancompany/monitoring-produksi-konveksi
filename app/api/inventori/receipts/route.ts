// GET /api/inventori/receipts?status=pending|verified|all&order=<id pesanan>&limit=  -> daftar catatan hasil produksi stok.
// Catatan menunggu milik pesanan di Sampah tidak ikut (muncul lagi bila pesanan dipulihkan).
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, invFail, loadReceipts, isUuid } from "@/lib/inventory/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireInventori(req, "view");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "pending";
  if (!["pending", "verified", "all"].includes(status)) {
    return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
  }
  const order = sp.get("order");
  if (order && !isUuid(order)) return NextResponse.json({ error: "Pesanan tidak valid" }, { status: 400 });
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "100", 10) || 100, 1), 200);

  try {
    const receipts = await loadReceipts(status as "pending" | "verified" | "all", limit, order);
    return NextResponse.json({ receipts });
  } catch (e) {
    return invFail(e as { message?: string; code?: string });
  }
}
