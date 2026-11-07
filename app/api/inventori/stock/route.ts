// GET /api/inventori/stock?jenis=&q=  -> saldo stok per SKU (jenis + varian + warna + ukuran) dan total pcs.
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, invFail, loadStock } from "@/lib/inventory/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireInventori(req, "view");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const jenis = sp.get("jenis");
  if (jenis && !/^[a-z0-9_]{1,80}$/.test(jenis)) return NextResponse.json({ error: "Filter jenis tidak valid" }, { status: 400 });

  try {
    return NextResponse.json(await loadStock({ jenis, q: sp.get("q") }));
  } catch (e) {
    return invFail(e as { message?: string; code?: string });
  }
}
