// GET /api/pengeluaran/order-lookup?q=... -> cari pesanan (kode produksi / nama pemesan) untuk biaya langsung.
import { NextRequest } from "next/server";
import { requireExpenseEntry } from "@/lib/finance/server";
import { lookupOrders } from "@/lib/finance/expenseEntry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireExpenseEntry(req);
  if (!guard.ok) return guard.response;
  return lookupOrders(req);
}
