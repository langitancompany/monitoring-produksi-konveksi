// hooks/useInventoryApi.ts
// Pemanggil API Stok Barang Jadi. Semua tulis lewat /api/inventori/* (server), tidak langsung ke Supabase.
// Memakai pembungkus fetch yang sama dengan Keuangan (error dari server ditampilkan apa adanya).

import { useCallback, useEffect, useState } from "react";
import { finFetch, postJson, errMsg } from "@/hooks/useFinanceApi";
import type { InventoryMeta } from "@/lib/inventory/types";
import type { WarnaOption } from "@/lib/inventory/warna";

export { finFetch as invFetch, postJson as invPost, errMsg };

/** Hak pengguna + jumlah catatan menunggu verifikasi (GET /api/inventori/meta). */
export function useInventoryMeta() {
  const [meta, setMeta] = useState<InventoryMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setMeta(await finFetch<InventoryMeta>("/api/inventori/meta"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { meta, error, loading, reload };
}

// ─── Saran warna ──────────────────────────────────────────────────────────────
// Daftar warna yang sudah ada (stok + pesanan terbaru), dipakai isian warna di form pesanan.
// Disimpan di memori selama beberapa menit supaya membuka banyak blok/item tidak memanggil server berulang.
// Saran bersifat tambahan: bila gagal dimuat, isian tetap bisa diketik biasa (tanpa pesan error).

const WARNA_TTL_MS = 2 * 60 * 1000;
let warnaCache: { at: number; options: WarnaOption[] } | null = null;
let warnaInflight: Promise<WarnaOption[]> | null = null;

function loadWarnaOptions(): Promise<WarnaOption[]> {
  if (warnaCache && Date.now() - warnaCache.at < WARNA_TTL_MS) return Promise.resolve(warnaCache.options);
  if (!warnaInflight) {
    warnaInflight = finFetch<{ options: WarnaOption[] }>("/api/inventori/warna")
      .then((r) => {
        warnaCache = { at: Date.now(), options: r.options ?? [] };
        return warnaCache.options;
      })
      .catch(() => warnaCache?.options ?? [])
      .finally(() => {
        warnaInflight = null;
      });
  }
  return warnaInflight;
}

export function useWarnaOptions(): WarnaOption[] {
  const [options, setOptions] = useState<WarnaOption[]>(warnaCache?.options ?? []);
  useEffect(() => {
    let off = false;
    void loadWarnaOptions().then((o) => {
      if (!off) setOptions(o);
    });
    return () => {
      off = true;
    };
  }, []);
  return options;
}