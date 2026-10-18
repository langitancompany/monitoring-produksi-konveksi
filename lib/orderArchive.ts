// lib/orderArchive.ts
//
// Helper untuk menu arsip & pemantauan (Bagian 3): Pesanan Selesai, Sampah,
// Kalender. Murni fungsi (tanpa akses database) supaya mudah diuji.

import type { Order, ProductionTypeData } from "@/types/order";
import { toLocalISODate, typeLabel } from "@/lib/utils";

/**
 * Kapan pesanan selesai? = waktu tahap TERAKHIR yang selesai (ISO).
 * Bukan deadline, bukan tanggal dibuat — supaya bulan "selesai" sama dengan
 * dasar bulan gaji (Bagian 5, mengikuti `completedAt`). Cadangan bila data
 * lama tidak punya completedAt: `updated_at`, lalu `deadline`.
 */
export function completionDate(order: Pick<Order, "steps" | "updated_at" | "deadline">): string {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const s of order.steps ?? []) {
    if (!s.completedAt) continue;
    const ms = Date.parse(s.completedAt);
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = s.completedAt;
    }
  }
  return best ?? order.updated_at ?? order.deadline;
}

/** Selesai pada atau sebelum deadline? (dibandingkan sebagai tanggal lokal) */
export function finishedOnTime(order: Pick<Order, "steps" | "updated_at" | "deadline">): boolean {
  const done = new Date(completionDate(order));
  if (Number.isNaN(done.getTime())) return false;
  return toLocalISODate(done) <= order.deadline;
}

/** Kunci bulan "YYYY-MM" (waktu lokal) dari tanggal/ISO, untuk filter & pengelompokan. */
export function monthKey(dateLike: string): string {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Ringkasan isi pesanan untuk tabel: "Seragam Sekolah, Celana Sekolah" (utama) atau kategorinya (non-utama). */
export function itemsSummary(order: Pick<Order, "items" | "jenis_produksi">, types: ProductionTypeData[]): string {
  if (order.items?.length) {
    return order.items.map((it) => typeLabel(it.jenis_produksi, types)).join(", ");
  }
  return typeLabel(order.jenis_produksi, types);
}

// ─── File storage milik pesanan (dipakai Hapus Permanen) ─────────────────────

/** Bucket storage bersama Sablon; semua file Konveksi di bawah awalan ini. */
export const KONVEKSI_STORAGE_PREFIX = "konveksi/";

/**
 * Kumpulkan path file storage yang dirujuk data pesanan (tahap, kendala, item),
 * dengan membaca semua teks berisi `/{bucket}/…` secara rekursif. Tautan luar
 * (mis. Google Drive pada Approval) TIDAK memuat nama bucket sehingga diabaikan.
 *
 * Pengaman: hanya path berawalan `konveksi/` yang dikembalikan — bucket ini
 * dipakai bersama Sablon, jangan sampai file milik Sablon ikut terhapus.
 */
export function collectStoragePaths(data: unknown, bucket: string): string[] {
  const marker = `/${bucket}/`;
  const found = new Set<string>();

  const visit = (value: unknown) => {
    if (typeof value === "string") {
      if (!value.includes(marker)) return;
      let path: string | undefined;
      try {
        path = decodeURIComponent(value).split(marker)[1]?.split("?")[0];
      } catch {
        path = value.split(marker)[1]?.split("?")[0];
      }
      if (path && path.startsWith(KONVEKSI_STORAGE_PREFIX) && !path.includes("..")) found.add(path);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };

  visit(data);
  return [...found];
}
