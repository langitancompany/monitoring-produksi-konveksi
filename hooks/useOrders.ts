// hooks/useOrders.ts
//
// Data pesanan: ambil, buat, catat log. (Diadopsi dari useOrders Sablon.)
// Bagian berikutnya (lihat docs/PRD.md) menambah: edit, hapus ke sampah,
// update tahap produksi, kendala.

import { useState, useCallback, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { UserData } from "@/types";
import type { NewOrderInput, Order } from "@/types/order";
import { buildInitialSteps, deriveStatus } from "@/lib/steps";
import { triggerOrderNotifications } from "@/lib/orderLogic";

interface Props {
  supabase: SupabaseClient;
  currentUser: (UserData & { id: string }) | null;
  fetchNotifications: () => Promise<void>;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
}

export type LogCategory = "STATUS" | "FILE" | "KENDALA" | "QC" | "REVISI" | "SISTEM";

export function useOrders({ supabase, currentUser, fetchNotifications, showAlert }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  // true sampai pemuatan pertama selesai (berhasil ATAU gagal)
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    const attempt = () => {
      const q = supabase.from("orders").select("*").order("created_at", { ascending: false });
      return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? q.abortSignal(AbortSignal.timeout(20000))
        : q;
    };

    let data: any[] | null = null;
    try {
      let res = await attempt();
      if (res.error) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await attempt(); // satu kali coba ulang
      }
      data = res.error ? null : (res.data as any[] | null);
    } catch {
      data = null;
    }

    if (data) {
      setOrders(
        data.map((o: any) => ({
          ...o,
          items: Array.isArray(o.items) ? o.items : [],
          steps: Array.isArray(o.steps) ? o.steps : [],
          kendala: Array.isArray(o.kendala) ? o.kendala : [],
        })),
      );
      setOrdersError(null);
    } else {
      setOrdersError("Data pesanan belum berhasil dimuat. Periksa koneksi internet, lalu coba lagi.");
    }
    setOrdersLoading(false);
  }, [supabase]);

  const activeOrders = useMemo(() => orders.filter((o) => !o.deleted_at), [orders]);
  const utamaOrders = useMemo(() => activeOrders.filter((o) => o.kategori === "utama"), [activeOrders]);
  const nonUtamaOrders = useMemo(() => activeOrders.filter((o) => o.kategori === "non_utama"), [activeOrders]);

  // ─── Log aktivitas ────────────────────────────────────────────────────────
  const writeLog = useCallback(
    async ({
      order,
      category,
      event,
      ket = "-",
      newVal = "",
      isSystem = false,
      meta = {},
    }: {
      order: Pick<Order, "id" | "kode_produksi" | "status">;
      category: LogCategory;
      event: string;
      ket?: string;
      newVal?: string;
      isSystem?: boolean;
      meta?: Record<string, unknown>;
    }) => {
      if (!currentUser && !isSystem) return;
      const { error } = await supabase.from("order_logs").insert([
        {
          order_id: order.id,
          kode_produksi: order.kode_produksi,
          category,
          event_name: event,
          description: ket,
          old_value: order.status,
          new_value: newVal || order.status,
          oleh: isSystem ? "Sistem" : currentUser?.name || "Unknown",
          metadata: meta,
        },
      ]);
      if (error) console.error("Gagal mencatat log:", error);
    },
    [currentUser, supabase],
  );

  // ─── Kode produksi: KNV-10/26-0001 (nomor urut per bulan, dari database) ───
  const generateProductionCode = useCallback(async () => {
    const now = new Date();
    const prefix = `KNV-${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getFullYear()).slice(-2)}-`;
    const { data } = await supabase
      .from("orders")
      .select("kode_produksi")
      .like("kode_produksi", `${prefix}%`)
      .order("kode_produksi", { ascending: false })
      .limit(1);
    const last = data?.[0]?.kode_produksi as string | undefined;
    const max = last ? parseInt(last.split("-").pop()!, 10) || 0 : 0;
    return `${prefix}${String(max + 1).padStart(4, "0")}`;
  }, [supabase]);

  // ─── Buat pesanan (close order) ───────────────────────────────────────────
  // utama     : tahap "Approval" menunggu admin (jenis produksi dipilih di sana)
  // non_utama : detail sudah diisi di form → tahap "Detail Pesanan" langsung selesai
  const handleCreateOrder = useCallback(
    async (input: NewOrderInput): Promise<Order | null> => {
      if (!currentUser) return null;
      setIsCreating(true);
      try {
        const isNon = input.kategori === "non_utama";
        const steps = buildInitialSteps(input.kategori, isNon ? ["detail"] : [], currentUser.name);
        const items = isNon && input.jenis_produksi
          ? [{ id: "item-1", jenis_produksi: input.jenis_produksi, jumlah: input.jumlah }]
          : [];
        const base = {
          kategori: input.kategori,
          nama_pemesan: input.nama_pemesan.trim(),
          no_hp: input.no_hp.trim(),
          alamat_pemesan: input.alamat_pemesan.trim() || null,
          jumlah: input.jumlah,
          tanggal_masuk: input.tanggal_masuk,
          deadline: input.deadline,
          jenis_produksi: isNon ? input.jenis_produksi ?? null : null,
          items,
          catatan_pesanan: input.catatan_pesanan.trim() || null,
          steps,
          kendala: [],
          created_by: currentUser.id,
        };
        const status = deriveStatus({ kategori: input.kategori, steps, kendala: [] });

        // Dua kali coba: kalau nomor urut bentrok (dua admin menyimpan bersamaan), ambil nomor baru.
        let created: any = null;
        let lastError: any = null;
        for (let i = 0; i < 2 && !created; i++) {
          const kode_produksi = await generateProductionCode();
          const { data, error } = await supabase
            .from("orders")
            .insert([{ ...base, kode_produksi, status }])
            .select()
            .single();
          if (error) lastError = error;
          else created = data;
        }

        if (!created) {
          showAlert("Gagal", lastError?.message ?? "Pesanan gagal disimpan", "error");
          return null;
        }

        const order = {
          ...created,
          items: created.items ?? [],
          steps: created.steps ?? [],
          kendala: created.kendala ?? [],
        } as Order;

        await writeLog({
          order,
          category: "STATUS",
          event: "Pesanan Dibuat",
          ket: `Pesanan ${order.kode_produksi} (${input.kategori === "utama" ? "utama" : "non-utama"}) dibuat`,
        });
        await triggerOrderNotifications(order);
        await Promise.all([fetchOrders(), fetchNotifications()]);
        showAlert("Sukses", `Pesanan ${order.kode_produksi} dibuat`);
        return order;
      } finally {
        setIsCreating(false);
      }
    },
    [currentUser, supabase, generateProductionCode, writeLog, fetchOrders, fetchNotifications, showAlert],
  );

  return {
    orders,
    activeOrders,
    utamaOrders,
    nonUtamaOrders,
    ordersLoading,
    ordersError,
    fetchOrders,
    writeLog,
    isCreating,
    handleCreateOrder,
  };
}
