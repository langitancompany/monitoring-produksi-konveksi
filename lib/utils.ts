// lib/utils.ts
// Helper umum yang dipakai banyak halaman (diadopsi dari aplikasi Sablon).

import type { OrderStatus, ProductionTypeData } from "@/types/order";

export const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Tanggal lokal (bukan UTC) format YYYY-MM-DD untuk <input type="date"> */
export function toLocalISODate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const getDeadlineStatus = (
  deadlineStr: string,
  status: OrderStatus,
): "safe" | "warning" | "overdue" => {
  if (status === "Selesai" || status === "Kirim") return "safe";
  const deadline = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "warning";
  return "safe";
};

/** Class warna badge status (mendukung dark mode). */
export const getStatusColor = (status: OrderStatus | string) => {
  switch (status) {
    case "Pesanan Masuk":
      return "bg-gray-100 text-gray-800 border-gray-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    case "On Process":
      return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800";
    case "Finishing":
      return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800";
    case "Revisi":
      return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800";
    case "Ada Kendala":
      return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800";
    case "Kirim":
      return "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800";
    case "Selesai":
      return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800";
    case "Telat":
      return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-300";
  }
};

export const openWA = (hp: string) => {
  if (!hp) return;
  let formatted = hp.replace(/\D/g, "");
  if (formatted.startsWith("0")) formatted = "62" + formatted.slice(1);
  window.open(`https://wa.me/${formatted}`, "_blank");
};

/** "Seragam Sekolah" → "seragam_sekolah" (dipakai sebagai `value` jenis produksi) */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
}

/** Nama tampil dari value jenis produksi; kalau master-nya sudah dihapus, tampilkan value apa adanya. */
export function typeLabel(
  value: string | null | undefined,
  types: ProductionTypeData[],
): string {
  if (!value) return "-";
  return types.find((t) => t.value === value)?.name ?? value;
}

/** Tanggal + jam lokal, mis. "17 Okt 2026, 14.05" (ISO dari database → tampilan). */
export const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr; // data lama yang bukan ISO: tampilkan apa adanya
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── Penamaan file bukti (storage) ───────────────────────────────────────────
// Pola sama dengan Sablon: YYYY-MM-DD_KodeProduksi_JenisDokumen.ext

/** "Selesai Potong" → "SelesaiPotong" (buang karakter khusus & spasi) */
export function sanitizeFilenamePart(str: string): string {
  return str
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "");
}

/** Label dokumen untuk nama file, dari key tahap (mis. "packing" → "Packing"). */
export function getDocumentLabel(stepKey: string): string {
  switch (stepKey) {
    case "approval":
      return "ApprovalDesain";
    case "mockup":
      return "Mockup";
    case "packing":
      return "Packing";
    case "pengiriman":
      return "BuktiKirim";
    case "penerimaan":
      return "BuktiTerima";
    case "kendala":
      return "BuktiKendala";
    default:
      return sanitizeFilenamePart(stepKey) || "Dokumen";
  }
}

/** YYYY-MM-DD_KodeProduksi_JenisDokumen (tanpa ekstensi). */
export function generateStorageFilename(
  jenisDokumen: string,
  kodeProduksi: string,
  tanggal: Date = new Date(),
): string {
  const kode = kodeProduksi.replace(/[#/\\]/g, "").replace(/\s+/g, "-").trim();
  return `${toLocalISODate(tanggal)}_${kode}_${jenisDokumen}`;
}
