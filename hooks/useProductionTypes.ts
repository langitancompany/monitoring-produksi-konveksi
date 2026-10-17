// hooks/useProductionTypes.ts
//
// Master data jenis produksi (utama & non-utama). Dikelola di Pengaturan →
// Jenis Produksi; dipakai form pesanan, Approval, Config Harga, dan Gaji.

import { useState, useCallback, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { OrderKategori, ProductionTypeData } from "@/types/order";
import { slugify } from "@/lib/utils";

interface Props {
  supabase: SupabaseClient;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export function useProductionTypes({ supabase, showAlert, showConfirm }: Props) {
  const [productionTypes, setProductionTypes] = useState<ProductionTypeData[]>([]);

  const fetchProductionTypes = useCallback(async () => {
    const { data } = await supabase
      .from("production_types")
      .select("*")
      .order("sort_order")
      .order("name");
    if (data) setProductionTypes(data as ProductionTypeData[]);
  }, [supabase]);

  /** Tambah (tanpa id) atau ubah nama (dengan id). `value` dibuat otomatis & tidak berubah. */
  const handleSaveType = useCallback(
    async (t: { id?: string; name: string; kategori: OrderKategori }) => {
      const name = t.name.trim();
      if (!name) {
        showAlert("Gagal", "Nama wajib diisi", "error");
        return;
      }
      if (t.id) {
        const { error } = await supabase.from("production_types").update({ name }).eq("id", t.id);
        if (error) return showAlert("Gagal", error.message, "error");
      } else {
        let value = slugify(name) || "jenis";
        if (productionTypes.some((p) => p.value === value)) {
          value = `${value}_${Date.now().toString(36).slice(-4)}`;
        }
        const maxSort = Math.max(
          0,
          ...productionTypes.filter((p) => p.kategori === t.kategori).map((p) => p.sort_order ?? 0),
        );
        const { error } = await supabase.from("production_types").insert([
          { name, value, kategori: t.kategori, sort_order: maxSort + 1 },
        ]);
        if (error) return showAlert("Gagal", error.message, "error");
      }
      await fetchProductionTypes();
      showAlert("Sukses", "Jenis produksi tersimpan");
    },
    [supabase, productionTypes, fetchProductionTypes, showAlert],
  );

  const handleToggleType = useCallback(
    async (t: ProductionTypeData) => {
      const { error } = await supabase
        .from("production_types")
        .update({ is_active: !t.is_active })
        .eq("id", t.id);
      if (error) return showAlert("Gagal", error.message, "error");
      await fetchProductionTypes();
    },
    [supabase, fetchProductionTypes, showAlert],
  );

  const handleDeleteType = useCallback(
    (id: string) => {
      showConfirm(
        "Hapus Jenis Produksi?",
        "Pesanan lama tetap menyimpan kodenya. Kalau hanya ingin menyembunyikan dari pilihan, gunakan tombol Nonaktifkan.",
        async () => {
          const { error } = await supabase.from("production_types").delete().eq("id", id);
          if (error) return showAlert("Gagal", error.message, "error");
          await fetchProductionTypes();
          showAlert("Sukses", "Dihapus");
        },
      );
    },
    [supabase, fetchProductionTypes, showAlert, showConfirm],
  );

  const activeUtama = useMemo(
    () => productionTypes.filter((t) => t.kategori === "utama" && t.is_active),
    [productionTypes],
  );
  const activeNonUtama = useMemo(
    () => productionTypes.filter((t) => t.kategori === "non_utama" && t.is_active),
    [productionTypes],
  );

  return {
    productionTypes,
    activeUtama,
    activeNonUtama,
    fetchProductionTypes,
    handleSaveType,
    handleToggleType,
    handleDeleteType,
  };
}
