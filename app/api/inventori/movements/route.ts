// GET /api/inventori/movements?sku=&from=&to=&limit=  -> riwayat pergerakan stok (terbaru di atas).
// from/to berformat YYYY-MM-DD dan dibaca sebagai hari WIB.
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, invFail, loadMovements, isDate } from "@/lib/inventory/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireInventori(req, "view");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const sku = sp.get("sku");
  const from = sp.get("from");
  const to = sp.get("to");
  if (sku && sku.length > 400) return NextResponse.json({ error: "Kunci stok tidak valid" }, { status: 400 });
  if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to)) {
    return NextResponse.json({ error: "Rentang tanggal tidak valid" }, { status: 400 });
  }
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "100", 10) || 100, 1), 300);

  try {
    return NextResponse.json({ movements: await loadMovements({ sku, from, to, limit }) });
  } catch (e) {
    return invFail(e as { message?: string; code?: string });
  }
}
