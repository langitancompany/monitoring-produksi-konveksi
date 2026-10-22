// GET /api/finance/order-lookup?q=...  -> pesanan (kode produksi / nama pemesan) untuk menautkan biaya langsung.
// Kata kunci dibersihkan (tanpa wildcard); dua pencarian terpisah, bukan string filter .or() yang rawan disisipi.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail } from "@/lib/finance/server";
import { sanitizeLookupQuery } from "@/lib/finance/expenses";
import type { OrderLookupRow } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const q = sanitizeLookupQuery(req.nextUrl.searchParams.get("q"));
  if (!q) return NextResponse.json({ rows: [] });

  const admin = getSupabaseAdmin();
  const base = () =>
    admin.from("orders").select("id, kode_produksi, nama_pemesan").is("deleted_at", null).limit(10);
  const [byKode, byNama] = await Promise.all([
    base().ilike("kode_produksi", `%${q}%`),
    base().ilike("nama_pemesan", `%${q}%`),
  ]);
  const err = byKode.error || byNama.error;
  if (err) return finFail(err);

  const seen = new Map<string, OrderLookupRow>();
  for (const r of [...(byKode.data ?? []), ...(byNama.data ?? [])]) seen.set(r.id, r as OrderLookupRow);
  const rows = [...seen.values()].sort((a, b) => a.kode_produksi.localeCompare(b.kode_produksi)).slice(0, 10);
  return NextResponse.json({ rows });
}
