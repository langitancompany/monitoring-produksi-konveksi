// hooks/usePricing.ts
//
// Riwayat harga (tabel pricing_configs, migration 007) untuk menu Config Harga dan Gaji & Upah.
// Baris hanya DITAMBAH, tidak pernah diubah/dihapus (jangan menambah update/delete di sini —
// database juga menolaknya). Lihat docs/PRD.md §20.

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingConfig, PricingRowInput } from "@/types/salary";
import { pricingErrorMessage } from "@/lib/salary";

interface Props {
  supabase: SupabaseClient;
}

/** PostgREST membatasi satu permintaan (umumnya 1000 baris); riwayat dibaca per halaman supaya tidak terpotong diam-diam. */
const PAGE = 1000;

const normalize = (r: any): PricingConfig => ({
  ...r,
  id: Number(r.id),
  value_amount: Number(r.value_amount),
});

export function usePricing({ supabase }: Props) {
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const all: PricingConfig[] = [];
    let failure: string | null = null;
    for (let from = 0; ; from += PAGE) {
      const { data, error: err } = await supabase
        .from("pricing_configs")
        .select("*")
        .order("effective_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (err) {
        failure = pricingErrorMessage(err);
        break;
      }
      all.push(...(data ?? []).map(normalize));
      if (!data || data.length < PAGE) break;
    }
    if (failure) {
      setError(failure);
    } else {
      setConfigs(all);
      setError(null);
    }
    setLoading(false);
  }, [supabase]);

  /**
   * Simpan perubahan sebagai baris BARU berlaku mulai `effectiveDate` (YYYY-MM-DD).
   * Mengembalikan pesan galat, atau null bila berhasil.
   */
  const saveRates = useCallback(
    async (rows: PricingRowInput[], effectiveDate: string): Promise<string | null> => {
      if (rows.length === 0) return null;
      setSaving(true);
      try {
        const { error: err } = await supabase.from("pricing_configs").insert(
          rows.map((r) => ({
            category: r.category,
            key_name: r.key_name,
            display_name: r.display_name,
            unit: r.unit,
            value_amount: Math.max(0, Math.round(r.value_amount)),
            effective_date: effectiveDate,
          })),
        );
        if (err) return pricingErrorMessage(err);
        await fetchConfigs();
        return null;
      } finally {
        setSaving(false);
      }
    },
    [supabase, fetchConfigs],
  );

  return { configs, loading, error, saving, fetchConfigs, saveRates };
}
