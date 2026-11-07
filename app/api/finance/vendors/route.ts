// GET  /api/finance/vendors                     -> daftar vendor/pemasok aktif
// POST /api/finance/vendors  body: { name, phone? } -> tambah vendor (izin Maker keuangan), tercatat di audit
import { NextRequest } from "next/server";
import { requireFinance } from "@/lib/finance/server";
import { listVendors, createVendorFromRequest } from "@/lib/finance/expenseEntry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;
  return listVendors();
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, "maker");
  if (!guard.ok) return guard.response;
  return createVendorFromRequest(req, guard.actor);
}
