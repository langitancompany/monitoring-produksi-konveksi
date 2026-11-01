// lib/finance/tariffDb.ts
// Baca daftar harga dari database (SERVER ONLY — memakai service role).
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Tariff, TariffAddon, TariffTier } from "./tariff";

type DbError = { message?: string; code?: string };

/** Muat seluruh daftar harga. Bila tabelnya belum ada (migration 021/022 belum dijalankan), kembalikan daftar kosong
 *  supaya tagihan lama tetap bisa dibuat dengan harga manual. */
export async function loadTariff(): Promise<{ tariff: Tariff; error: DbError | null; missing: boolean }> {
  const admin = getSupabaseAdmin();
  const [t, a] = await Promise.all([
    admin.from("finance_price_tiers").select("id, jenis_produksi, varian, label, ukuran, sort_order").order("sort_order", { ascending: true }),
    admin.from("finance_price_addons").select("id, jenis_produksi, keyword, label, tambahan, sort_order").order("sort_order", { ascending: true }),
  ]);
  const err = t.error || a.error;
  if (err) {
    const missing = err.code === "42P01" || err.code === "PGRST205";
    return { tariff: { tiers: [], addons: [] }, error: missing ? null : err, missing };
  }
  return {
    tariff: {
      tiers: ((t.data ?? []) as TariffTier[]).map((r) => ({
        ...r,
        ukuran: Array.isArray(r.ukuran) ? r.ukuran.map(String) : [],
      })),
      addons: ((a.data ?? []) as (Omit<TariffAddon, "tambahan"> & { tambahan: number | string })[]).map((r) => ({
        ...r,
        tambahan: Number(r.tambahan),
      })),
    },
    error: null,
    missing: false,
  };
}
