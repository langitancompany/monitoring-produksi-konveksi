// hooks/useOrders.ts
//
// Data pesanan: ambil, buat, ubah tahap, kendala, edit, hapus ke Sampah, catat log.
// (Diadopsi dari useOrders Sablon, disesuaikan ke model tahap konveksi.)
//
// Semua perubahan pesanan setelah dibuat lewat SATU pintu: commitOrder().
// Ia menghitung ulang status (deriveStatus), menyimpan, menulis log, mengirim
// notifikasi, lalu memuat ulang daftar. Bagian 3+ (Sampah, Pesanan Selesai, …)
// menambah fungsi di file ini.

import { useState, useCallback, useMemo, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { UserData } from "@/types";
import type {
  EditOrderInput,
  KendalaNote,
  NewOrderInput,
  Order,
  OrderItem,
  ProductionStep,
} from "@/types/order";
import { buildInitialSteps, deriveStatus } from "@/lib/steps";
import { triggerOrderNotifications } from "@/lib/orderLogic";
import { cleanItems, sumItems } from "@/lib/orderItems";
import { formatDate } from "@/lib/utils";

interface Props {
  supabase: SupabaseClient;
  currentUser: (UserData & { id: string }) | null;
  fetchNotifications: () => Promise<void>;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
}

export type LogCategory = "STATUS" | "FILE" | "KENDALA" | "QC" | "REVISI" | "SISTEM";

/** Catatan log untuk satu aksi (ditulis setelah perubahan berhasil disimpan). */
export interface ActionLog {
  category: LogCategory;
  event: string;
  ket?: string;
  meta?: Record<string, unknown>;
}

/** Kolom informasi pesanan yang boleh diubah lewat Edit Pesanan / Approval. */
export type OrderFields = Partial<
  Pick<
    Order,
    | "nama_pemesan"
    | "no_hp"
    | "alamat_pemesan"
    | "tanggal_masuk"
    | "deadline"
    | "catatan_pesanan"
    | "jumlah"
    | "jenis_produksi"
    | "items"
  >
>;

/** Isi jsonb dari database → bentuk yang aman dipakai UI (selalu array). */
const normalizeOrder = (o: any): Order => ({
  ...o,
  items: Array.isArray(o.items) ? o.items : [],
  steps: Array.isArray(o.steps) ? o.steps : [],
  kendala: Array.isArray(o.kendala) ? o.kendala : [],
});

export function useOrders({ supabase, currentUser, fetchNotifications, showAlert }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  // true sampai pemuatan pertama selesai (berhasil ATAU gagal)
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // true selama satu perubahan sedang disimpan (tombol di UI dinonaktifkan → tidak bisa dobel klik)
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

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
      setOrders(data.map(normalizeOrder));
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

        const order = normalizeOrder(created);

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

  // ─── Pintu tunggal perubahan pesanan ───────────────────────────────────────
  // Status SELALU dihitung ulang dari tahap & kendala (deriveStatus), tidak
  // pernah diisi manual. Pengaman dua-orang-sekaligus: update hanya berlaku
  // bila `updated_at` di database masih sama dengan yang dilihat pengguna;
  // kalau tidak (orang lain baru saja mengubah), perubahan DITOLAK dan data
  // dimuat ulang — supaya tahap yang baru diselesaikan orang lain tidak tertimpa.
  const commitOrder = useCallback(
    async (
      order: Order,
      change: { steps?: ProductionStep[]; kendala?: KendalaNote[]; fields?: OrderFields },
      log: ActionLog | null,
      opts: { forceDeadlineCheck?: boolean } = {},
    ): Promise<boolean> => {
      if (!currentUser || savingRef.current) return false;
      savingRef.current = true;
      setIsSaving(true);
      try {
        const steps = change.steps ?? order.steps;
        const kendala = change.kendala ?? order.kendala;
        const status = deriveStatus({ kategori: order.kategori, steps, kendala });
        const updates = { ...(change.fields ?? {}), steps, kendala, status };

        let q = supabase.from("orders").update(updates).eq("id", order.id);
        if (order.updated_at) q = q.eq("updated_at", order.updated_at);
        const { data, error } = await q.select();

        if (error) {
          showAlert("Gagal menyimpan", error.message, "error");
          return false;
        }
        if (!data || data.length === 0) {
          // 0 baris terubah: pesanan diubah orang lain barusan, atau tidak punya izin
          await fetchOrders();
          showAlert(
            "Perubahan tidak tersimpan",
            "Pesanan ini baru saja diubah oleh orang lain (atau Anda tidak punya izin untuk aksi ini). Data sudah dimuat ulang — periksa kondisi terbaru lalu ulangi.",
            "error",
          );
          return false;
        }

        const saved = normalizeOrder(data[0]);
        if (log) {
          await writeLog({
            order, // status LAMA tercatat sebagai old_value
            category: log.category,
            event: log.event,
            ket: log.ket,
            newVal: status,
            meta: log.meta,
          });
        }
        await triggerOrderNotifications(saved, order.status, {
          forceDeadlineCheck: opts.forceDeadlineCheck,
        });
        await Promise.all([fetchOrders(), fetchNotifications()]);
        return true;
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [currentUser, supabase, writeLog, fetchOrders, fetchNotifications, showAlert],
  );

  // ─── Ubah satu tahap ───────────────────────────────────────────────────────
  // `patch` digabung ke tahap `stepKey`. `also` mengubah tahap lain sekaligus
  // (mis. QC gagal membuka lagi Produksi Massal). `fields` ikut menyimpan
  // kolom pesanan (mis. Approval mengisi items & jenis_produksi).
  const applyStepUpdate = useCallback(
    (
      order: Order,
      stepKey: string,
      patch: Partial<ProductionStep>,
      options: {
        log?: ActionLog;
        fields?: OrderFields;
        also?: Record<string, Partial<ProductionStep>>;
      } = {},
    ) => {
      const steps = order.steps.map((s) => {
        if (s.key === stepKey) return { ...s, ...patch };
        const other = options.also?.[s.key];
        return other ? { ...s, ...other } : s;
      });
      return commitOrder(order, { steps, fields: options.fields }, options.log ?? null);
    },
    [commitOrder],
  );

  // ─── Kendala (tambah / selesaikan / hapus) ─────────────────────────────────
  const applyKendalaUpdate = useCallback(
    (order: Order, kendala: KendalaNote[], log: ActionLog) =>
      commitOrder(order, { kendala }, log),
    [commitOrder],
  );

  // ─── Edit data pesanan ─────────────────────────────────────────────────────
  const handleEditOrder = useCallback(
    async (order: Order, input: EditOrderInput): Promise<boolean> => {
      const approvalDone = order.steps.find((s) => s.key === "approval")?.isCompleted === true;
      const fields: OrderFields = {
        nama_pemesan: input.nama_pemesan.trim(),
        no_hp: input.no_hp.trim(),
        alamat_pemesan: input.alamat_pemesan.trim() || null,
        tanggal_masuk: input.tanggal_masuk,
        deadline: input.deadline,
        catatan_pesanan: input.catatan_pesanan.trim() || null,
        jumlah: input.jumlah,
      };

      if (order.kategori === "non_utama") {
        // satu item: kategori pemesanan + jumlah
        fields.jenis_produksi = input.jenis_produksi ?? order.jenis_produksi ?? null;
        fields.items = fields.jenis_produksi
          ? [{ id: order.items[0]?.id ?? "item-1", jenis_produksi: fields.jenis_produksi, jumlah: input.jumlah }]
          : [];
      } else if (approvalDone && input.items) {
        // utama setelah Approval: item jadi sumber jumlah & jenis produksi
        const items: OrderItem[] = cleanItems(input.items);
        fields.items = items;
        fields.jumlah = sumItems(items);
        fields.jenis_produksi = items[0]?.jenis_produksi ?? null;
      }

      // Catat apa saja yang berubah (lama → baru)
      const labels: Array<[keyof OrderFields, string, (v: any) => string]> = [
        ["nama_pemesan", "Nama pemesan", (v) => v || "-"],
        ["no_hp", "No. HP", (v) => v || "-"],
        ["alamat_pemesan", "Alamat", (v) => v || "-"],
        ["tanggal_masuk", "Tanggal masuk", (v) => formatDate(v)],
        ["deadline", "Deadline", (v) => formatDate(v)],
        ["catatan_pesanan", "Catatan", (v) => v || "-"],
        ["jumlah", "Jumlah", (v) => `${v ?? 0} pcs`],
        ["jenis_produksi", "Jenis produksi", (v) => v || "-"],
      ];
      const changes: string[] = [];
      for (const [key, label, fmt] of labels) {
        const before = (order as any)[key] ?? null;
        const after = (fields as any)[key] ?? null;
        if (key in fields && (before ?? "") !== (after ?? "")) {
          changes.push(`${label}: ${fmt(before)} → ${fmt(after)}`);
        }
      }
      const itemsChanged =
        fields.items !== undefined && JSON.stringify(fields.items) !== JSON.stringify(order.items);
      if (itemsChanged) changes.push("Item pesanan diubah");

      if (changes.length === 0) {
        showAlert("Tidak ada perubahan", "Data pesanan sama seperti sebelumnya.");
        return true;
      }

      const ok = await commitOrder(
        order,
        { fields },
        {
          category: "SISTEM",
          event: "Pesanan Diedit",
          ket: changes.join("; "),
          meta: { before: pickFields(order), after: fields },
        },
        { forceDeadlineCheck: fields.deadline !== order.deadline },
      );
      if (ok) showAlert("Sukses", "Perubahan pesanan disimpan");
      return ok;
    },
    [commitOrder, showAlert],
  );

  // ─── Hapus = pindah ke Sampah (soft delete; bisa dipulihkan di Bagian 3) ───
  const handleDeleteOrder = useCallback(
    async (order: Order): Promise<boolean> => {
      if (!currentUser || savingRef.current) return false;
      savingRef.current = true;
      setIsSaving(true);
      try {
        const { data, error } = await supabase
          .from("orders")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", order.id)
          .select("id");
        if (error) {
          showAlert("Gagal menghapus", error.message, "error");
          return false;
        }
        if (!data || data.length === 0) {
          showAlert("Gagal menghapus", "Anda tidak punya izin menghapus pesanan ini.", "error");
          return false;
        }
        await writeLog({
          order,
          category: "SISTEM",
          event: "Pesanan Dipindah ke Sampah",
          ket: `Pesanan ${order.kode_produksi} (${order.nama_pemesan}) dihapus`,
        });
        await fetchOrders();
        showAlert("Sukses", `Pesanan ${order.kode_produksi} dipindah ke Sampah`);
        return true;
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [currentUser, supabase, writeLog, fetchOrders, showAlert],
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
    isSaving,
    applyStepUpdate,
    applyKendalaUpdate,
    handleEditOrder,
    handleDeleteOrder,
  };
}

/** Ambil kolom informasi pesanan (untuk metadata log "sebelum"). */
function pickFields(o: Order): OrderFields {
  return {
    nama_pemesan: o.nama_pemesan,
    no_hp: o.no_hp,
    alamat_pemesan: o.alamat_pemesan,
    tanggal_masuk: o.tanggal_masuk,
    deadline: o.deadline,
    catatan_pesanan: o.catatan_pesanan,
    jumlah: o.jumlah,
    jenis_produksi: o.jenis_produksi,
    items: o.items,
  };
}
