// GET /api/finance/tariff  -> kelompok ukuran + biaya tambahan varian (semua jenis)
// PUT /api/finance/tariff  -> simpan kelompok & biaya tambahan SATU jenis produksi (tercatat di log audit)
//
// Hak akses mengikuti menu Config Harga (Lihat / Edit), bukan menu Keuangan. Tab Harga ada di Config Harga.
//
// Body PUT: { jenis_produksi, tiers: [{ varian?, label, ukuran: string[] }], addons: [{ keyword, label, tambahan }] }
// Daftar jenis itu diganti seluruhnya dalam satu transaksi (fin_save_tariff). Kelompok tidak menyimpan harga: harga per kelompok diisi PER PESANAN di form tagihan.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireConfigHarga, finFail, bad } from "@/lib/finance/server";
import { loadTariff } from "@/lib/finance/tariffDb";
import { sanitizeTariffInput } from "@/lib/finance/tariff";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireConfigHarga(req, "view");
  if (!guard.ok) return guard.response;

  const { tariff, error, missing } = await loadTariff();
  if (error) return finFail(error);
  return NextResponse.json({ ...tariff, migration_missing: missing });
}

export async function PUT(req: NextRequest) {
  const guard = await requireConfigHarga(req, "edit");
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  const jenis = typeof body?.jenis_produksi === "string" ? body.jenis_produksi.trim() : "";
  if (!/^[a-z0-9_]{1,60}$/.test(jenis)) return bad("Jenis produksi tidak valid");
  const res = sanitizeTariffInput(body);
  if (!res.ok) return bad(res.error, 422);

  const { error } = await getSupabaseAdmin().rpc("fin_save_tariff", {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_jenis: jenis,
    p_tiers: res.tiers,
    p_addons: res.addons,
  });
  if (error) return finFail(error);

  const { tariff, error: loadErr } = await loadTariff();
  if (loadErr) return finFail(loadErr);
  return NextResponse.json(tariff);
}
