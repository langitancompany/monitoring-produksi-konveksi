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
//
// Tampilan di Detail Pesanan dikelompokkan jadi 4 kartu seperti Sablon
// (`section`): 1 Approval · 2 Produksi · 3 QC & Packing · 4 Pengiriman.
// Semua tahap dikerjakan dengan UPLOAD FOTO (kecuali Approval = form, QC = lolos/revisi);
// pengunggah + waktunya tercatat di step.uploadedBy / step.timestamp.

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
  /** kartu di Detail Pesanan: 1 Approval · 2 Produksi · 3 QC & Packing · 4 Pengiriman */
  section: 1 | 2 | 3 | 4;
}

export type StepSection = 1 | 2 | 3 | 4;

export const STEP_TEMPLATES: Record<OrderKategori, StepTemplate[]> = {
  utama: [
    { key: "approval", name: "Approval & Jenis Produksi", type: "form", phase: "Pesanan Masuk", section: 1 },
    { key: "potong_kain", name: "Potong Kain", type: "upload_image", phase: "On Process", section: 2 },
    { key: "produksi_massal", name: "Produksi Massal (Jahit)", type: "upload_image", phase: "On Process", section: 2 },
    { key: "qc", name: "QC", type: "qc", phase: "Finishing", section: 3 },
    { key: "packing", name: "Packing", type: "upload_image", phase: "Finishing", section: 3 },
    { key: "pengiriman", name: "Bukti Kirim (Resi)", type: "upload_image", phase: "Kirim", section: 4 },
    { key: "penerimaan", name: "Bukti Terima (User)", type: "upload_image", phase: "Kirim", section: 4 },
  ],
  non_utama: [
    { key: "detail", name: "Detail Pesanan", type: "form", phase: "Pesanan Masuk", section: 1 },
    { key: "mockup", name: "Upload Mockup", type: "upload_image", phase: "On Process", section: 1 },
    { key: "produksi_massal", name: "Produksi Massal", type: "upload_image", phase: "On Process", section: 2 },
    { key: "qc", name: "QC", type: "qc", phase: "Finishing", section: 3 },
    { key: "pengiriman", name: "Bukti Kirim (Resi)", type: "upload_image", phase: "Kirim", section: 4 },
    { key: "penerimaan", name: "Bukti Terima (User)", type: "upload_image", phase: "Kirim", section: 4 },
  ],
};

/** Kartu (bagian) tempat sebuah tahap ditampilkan. */
export function sectionOf(kategori: OrderKategori, key: string): StepSection {
  return STEP_TEMPLATES[kategori].find((t) => t.key === key)?.section ?? 2;
}

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
 *  - QC gagal + perbaikan jahit belum selesai → Revisi
 *  - selain itu                     → status tahap aktif pertama yang belum selesai
 * "Telat" TIDAK disimpan; ditampilkan dari deadline (lihat getDeadlineStatus).
 */
export function deriveStatus(
  order: Pick<Order, "kategori" | "steps" | "kendala">,
): OrderStatus {
  if (order.kendala?.some((k) => !k.isResolved)) return "Ada Kendala";

  const steps = order.steps ?? [];
  if (steps.length > 0 && steps.every((s) => s.isCompleted)) return "Selesai";

  // Revisi = QC gagal dan perbaikan di Produksi Massal belum selesai.
  // Begitu Produksi Massal diselesaikan lagi, status kembali ke Finishing
  // (menunggu QC diulang), bukan terus-menerus "Revisi".
  const qc = steps.find((s) => s.key === "qc");
  const produksi = steps.find((s) => s.key === "produksi_massal");
  if (qc && qc.qc?.passed === false && qc.qc.notes && produksi && !produksi.isCompleted) {
    return "Revisi";
  }

  const active = steps.find((s) => !s.isCompleted);
  return active ? phaseOf(order.kategori, active.key) : "Pesanan Masuk";
}

/**
 * Fase pesanan menurut tahap aktifnya (dipakai kolom Kanban & progress bar daftar):
 * Pesanan Masuk → On Process (Produksi) → Finishing → Kirim (Pengiriman) → Selesai.
 * Berbeda dengan `status`, fase TIDAK tertimpa "Ada Kendala"/"Revisi", jadi
 * pesanan bermasalah tetap tampil di kolom tahap yang sebenarnya.
 */
export function currentPhase(
  order: Pick<Order, "kategori" | "steps">,
): OrderStatus {
  const active = (order.steps ?? []).find((s) => !s.isCompleted);
  return active ? phaseOf(order.kategori, active.key) : "Selesai";
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

// ─── Aturan aksi tahap (Bagian 2) ────────────────────────────────────────────

/** Modul hak akses yang boleh mengerjakan suatu tahap (salah satu cukup). Supervisor selalu boleh. */
export type StepPerm = [module: "orders" | "produksi" | "finishing", action: "create" | "edit" | "delete"];

/**
 * Siapa boleh mengerjakan tahap apa (lihat PRD bagian 7 & 8):
 *  - produksi  : potong, jahit/produksi, mockup (+ Approval, bersama admin)
 *  - finishing : QC, packing, kirim, terima
 * Approval juga boleh oleh yang punya `orders.edit` (admin membuat approval).
 */
const STEP_WORK_PERMS: Record<string, StepPerm[]> = {
  approval: [["produksi", "create"], ["orders", "edit"]],
  mockup: [["produksi", "edit"]],
  potong_kain: [["produksi", "edit"]],
  produksi_massal: [["produksi", "edit"]],
  qc: [["finishing", "edit"]],
  packing: [["finishing", "edit"]],
  pengiriman: [["finishing", "edit"]],
  penerimaan: [["finishing", "edit"]],
};

/** Izin untuk MEMBATALKAN tahap yang sudah selesai (hapus file / buka lagi). */
const STEP_UNDO_PERMS: Record<string, StepPerm[]> = {
  approval: [["produksi", "delete"], ["orders", "delete"]],
  mockup: [["produksi", "delete"]],
  potong_kain: [["produksi", "delete"]],
  produksi_massal: [["produksi", "delete"]],
  qc: [["finishing", "delete"]],
  packing: [["finishing", "delete"]],
  pengiriman: [["finishing", "delete"]],
  penerimaan: [["finishing", "delete"]],
  // detail (pesanan non-utama) terisi otomatis saat pesanan dibuat → tidak bisa dibatalkan
};

export const stepWorkPerms = (key: string): StepPerm[] => STEP_WORK_PERMS[key] ?? [];
export const stepUndoPerms = (key: string): StepPerm[] => STEP_UNDO_PERMS[key] ?? [];

/**
 * Posisi tahap di alur:
 *  - done   : sudah selesai
 *  - active : tahap yang sedang dikerjakan (tahap pertama yang belum selesai)
 *  - locked : menunggu tahap sebelumnya
 * Tahap hanya bisa dikerjakan berurutan.
 */
export function stepPosition(
  steps: ProductionStep[],
  index: number,
): "done" | "active" | "locked" {
  if (steps[index]?.isCompleted) return "done";
  const firstOpen = steps.findIndex((s) => !s.isCompleted);
  return firstOpen === index ? "active" : "locked";
}

/** Tahap selesai boleh dibatalkan hanya bila tidak ada tahap sesudahnya yang selesai. */
export function canUndoStep(steps: ProductionStep[], index: number): boolean {
  const s = steps[index];
  if (!s || !s.isCompleted) return false;
  if (stepUndoPerms(s.key).length === 0) return false;
  return !steps.slice(index + 1).some((n) => n.isCompleted);
}

/** Salinan tahap dalam kondisi "belum dikerjakan" (dipakai untuk batal & revisi QC). */
export function resetStep(step: ProductionStep): ProductionStep {
  return {
    ...step,
    isCompleted: false,
    completedAt: null,
    timestamp: undefined,
    fileUrl: null,
    note: undefined,
    uploadedBy: undefined,
    doneBy: undefined,
    ...(step.type === "qc" ? { qc: { passed: null, notes: "" } } : {}),
  };
}
