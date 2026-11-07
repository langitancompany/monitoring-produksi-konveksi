// GET /api/finance/order-lookup?q=...  -> pesanan (kode produksi / nama pemesan) untuk menautkan biaya langsung.
// Kata kunci dibersihkan (tanpa wildcard); dua pencarian terpisah, bukan string filter .or() yang rawan disisipi.
import { NextRequest } from "next/server";
import { requireFinance } from "@/lib/finance/server";
import { lookupOrders } from "@/lib/finance/expenseEntry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;
  return lookupOrders(req);
}
