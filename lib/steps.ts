// lib/steps.ts
//
// Template tahapan produksi + logika status otomatis.
// SATU-SATUNYA tempat urutan tahap didefinisikan. Mau ubah/tambah tahap?
// Edit STEP_TEMPLATES (pesanan yang sudah berjalan tidak ikut berubah —
// tahapnya sudah tersalin ke kolom orders.steps saat pesanan dibuat).
//
// Alur (sesuai kebutuhan Konveksi):
//  utama     : Approval → Potong Kain → Produksi Massal (Jahit) → QC → Packing → Pengiriman → Penerimaan
//  non_utama : Detail Pesanan → Mockup → Produksi Massal → QC → Pengiriman → Penerimaan

import type {
  Order,
  OrderKategori,
  OrderStatus,
  ProductionStep,
  StepType,
} from "@/types/order";

interface StepTemplate {
  key: string;
  name: string;
  type: StepType;
  actionLabel?: string;
  /** status pesanan selama tahap ini adalah tahap aktif (belum selesai) */
  phase: OrderStatus;
}

export const STEP_TEMPLATES: Record<OrderKategori, StepTemplate[]> = {
  utama: [
    { key: "approval", name: "Approval & Jenis Produksi", type: "form", phase: "Pesanan Masuk" },
    { key: "potong_kain", name: "Potong Kain", type: "status_update", actionLabel: "Selesai Potong", phase: "On Process" },
    { key: "produksi_massal", name: "Produksi Massal (Jahit)", type: "status_update", actionLabel: "Selesai Jahit", phase: "On Process" },
    { key: "qc", name: "QC", type: "qc", phase: "Finishing" },
    { key: "packing", name: "Packing", type: "upload_image", phase: "Finishing" },
    { key: "pengiriman", name: "Pengiriman", type: "upload_image", phase: "Kirim" },
    { key: "penerimaan", name: "Penerimaan", type: "upload_image", phase: "Kirim" },
  ],
  non_utama: [
    { key: "detail", name: "Detail Pesanan", type: "form", phase: "Pesanan Masuk" },
    { key: "mockup", name: "Upload Mockup", type: "upload_image", phase: "On Process" },
    { key: "produksi_massal", name: "Produksi Massal", type: "status_update", actionLabel: "Selesai Produksi", phase: "On Process" },
    { key: "qc", name: "QC", type: "qc", phase: "Finishing" },
    { key: "pengiriman", name: "Pengiriman", type: "upload_image", phase: "Kirim" },
    { key: "penerimaan", name: "Penerimaan", type: "upload_image", phase: "Kirim" },
  ],
};

/** Buat daftar tahap awal untuk pesanan baru. `completeKeys` = tahap yang langsung selesai. */
export function buildInitialSteps(
  kategori: OrderKategori,
  completeKeys: string[] = [],
  by?: string,
): ProductionStep[] {
  const now = new Date().toISOString();
  return STEP_TEMPLATES[kategori].map((t) => {
    const done = completeKeys.includes(t.key);
    return {
      id: `${t.key}`,
      key: t.key,
      name: t.name,
      type: t.type,
      actionLabel: t.actionLabel,
      isCompleted: done,
      completedAt: done ? now : null,
      timestamp: done ? now : undefined,
      uploadedBy: done ? by : undefined,
      ...(t.type === "qc" ? { qc: { passed: null, notes: "" } } : {}),
    };
  });
}

/** Template tahap milik pesanan (untuk membaca `phase`). */
function phaseOf(kategori: OrderKategori, key: string): OrderStatus {
  return (
    STEP_TEMPLATES[kategori].find((t) => t.key === key)?.phase ?? "On Process"
  );
}

/**
 * Status pesanan dihitung dari tahapnya (bukan diisi manual):
 *  - ada kendala yang belum selesai → Ada Kendala
 *  - semua tahap selesai            → Selesai
 *  - QC gagal + ada catatan         → Revisi
 *  - selain itu                     → status tahap aktif pertama yang belum selesai
 * "Telat" TIDAK disimpan; ditampilkan dari deadline (lihat getDeadlineStatus).
 */
export function deriveStatus(
  order: Pick<Order, "kategori" | "steps" | "kendala">,
): OrderStatus {
  if (order.kendala?.some((k) => !k.isResolved)) return "Ada Kendala";

  const steps = order.steps ?? [];
  if (steps.length > 0 && steps.every((s) => s.isCompleted)) return "Selesai";

  const qc = steps.find((s) => s.key === "qc");
  if (qc && qc.qc?.passed === false && qc.qc.notes) return "Revisi";

  const active = steps.find((s) => !s.isCompleted);
  return active ? phaseOf(order.kategori, active.key) : "Pesanan Masuk";
}

/** Persentase tahap selesai (untuk progress bar). */
export function stepProgress(steps: ProductionStep[] | undefined): number {
  if (!steps || steps.length === 0) return 0;
  return Math.round(
    (steps.filter((s) => s.isCompleted).length / steps.length) * 100,
  );
}

export function activeStepName(steps: ProductionStep[] | undefined): string {
  return steps?.find((s) => !s.isCompleted)?.name ?? "Selesai";
}
