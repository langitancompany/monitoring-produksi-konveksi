// GET  /api/pengeluaran/vendors -> vendor/pemasok aktif
// POST /api/pengeluaran/vendors  body: { name, phone? } -> tambah vendor (tercatat di audit atas nama pengguna)
import { NextRequest } from "next/server";
import { requireExpenseEntry } from "@/lib/finance/server";
import { listVendors, createVendorFromRequest } from "@/lib/finance/expenseEntry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireExpenseEntry(req);
  if (!guard.ok) return guard.response;
  return listVendors();
}

export async function POST(req: NextRequest) {
  const guard = await requireExpenseEntry(req);
  if (!guard.ok) return guard.response;
  return createVendorFromRequest(req, guard.actor);
}
