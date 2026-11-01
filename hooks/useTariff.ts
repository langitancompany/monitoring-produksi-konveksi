// hooks/useTariff.ts
// Kelompok ukuran + biaya tambahan varian (GET/PUT /api/finance/tariff). Harga per kelompok TIDAK di sini: diisi saat menerbitkan tagihan.

import { useCallback, useEffect, useState } from "react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { Tariff } from "@/lib/finance/tariff";

export interface TariffSaveInput {
  jenis_produksi: string;
  tiers: { varian: string | null; label: string; ukuran: string[] }[];
  addons: { keyword: string; label: string; tambahan: number }[];
}

export function useTariff() {
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await finFetch<Tariff & { migration_missing?: boolean }>("/api/finance/tariff");
      setTariff({ tiers: r.tiers, addons: r.addons });
      setMigrationMissing(!!r.migration_missing);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: TariffSaveInput) => {
    const r = await finFetch<Tariff>("/api/finance/tariff", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    setTariff({ tiers: r.tiers, addons: r.addons });
    return r;
  }, []);

  return { tariff, error, migrationMissing, reload, save };
}
