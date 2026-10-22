// lib/finance/report.ts
//
// Logika tampilan untuk Ringkasan & Laporan (fungsi MURNI, bisa diuji). Semua angka uang dihitung database
// (fin_overview / fin_report); di sini hanya label, urutan, persentase, preset rentang, dan peringatan kelengkapan.

import type { AgingBucket, ReportData, ReportOrder } from "./types";

export const AGING_ORDER: readonly AgingBucket[] = [
  "belum_jatuh_tempo", "telat_1_7", "telat_8_30", "telat_30_plus", "tanpa_jatuh_tempo",
];

export const BUCKET_LABEL: Record<AgingBucket, string> = {
  belum_jatuh_tempo: "Belum jatuh tempo",
  telat_1_7: "Telat 1–7 hari",
  telat_8_30: "Telat 8–30 hari",
  telat_30_plus: "Telat > 30 hari",
  tanpa_jatuh_tempo: "Tanpa jatuh tempo",
};

/** Warna batang umur piutang: abu = aman/belum bertenggat, kuning = baru telat, merah = telat lama. */
export function bucketTone(b: AgingBucket): "neutral" | "amber" | "red" {
  if (b === "telat_1_7") return "amber";
  if (b === "telat_8_30" || b === "telat_30_plus") return "red";
  return "neutral";
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "2026-10" → "Okt 2026". Masukan tidak valid dikembalikan apa adanya. */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
}

/** Persentase a dari b dengan satu desimal; "-" bila b ≤ 0. */
export function pct(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-";
}

export type OrderSort = "newest" | "lowest" | "highest";

/** Urutkan pesanan di laporan: terbaru (bawaan dari server), laba kotor terendah, atau tertinggi. Tidak mengubah masukan. */
export function sortReportOrders(orders: ReportOrder[], sort: OrderSort): ReportOrder[] {
  const list = [...orders];
  if (sort === "lowest") list.sort((a, b) => a.gross - b.gross || a.kode_produksi.localeCompare(b.kode_produksi));
  else if (sort === "highest") list.sort((a, b) => b.gross - a.gross || a.kode_produksi.localeCompare(b.kode_produksi));
  return list;
}

/** Pesanan dengan laba kotor negatif (biaya langsung melebihi nilai tagihan). */
export const lossOrders = (orders: Pick<ReportOrder, "gross">[]): number => orders.filter((o) => o.gross < 0).length;

export type RangePreset = "month" | "3m" | "year";

/** Rentang cepat berdasarkan tanggal perangkat: bulan ini, 3 bulan terakhir (termasuk bulan ini), tahun ini. */
export function datePreset(kind: RangePreset, now: Date = new Date()): { from: string; to: string } {
  const start =
    kind === "month"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : kind === "3m"
        ? new Date(now.getFullYear(), now.getMonth() - 2, 1)
        : new Date(now.getFullYear(), 0, 1);
  return { from: ymd(start), to: ymd(now) };
}

export const isValidRange = (from: string, to: string): boolean => !!from && !!to && from <= to;

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Peringatan kelengkapan data laporan, supaya angka laba tidak dibaca lebih pasti dari kenyataannya.
 * Laba di sini adalah perkiraan manajemen: sepenuhnya bergantung pada pengeluaran yang SUDAH dicatat dan disetujui.
 */
export function reportWarnings(t: ReportData["totals"]): string[] {
  const out: string[] = [];
  if (t.revenue > 0 && t.expenses === 0) {
    out.push("Belum ada pengeluaran disetujui pada periode ini, jadi laba terlihat sama dengan pendapatan. Pastikan pengeluaran sudah dicatat dan disetujui.");
  }
  if (t.expenses > 0 && t.expenses_unlinked > 0) {
    out.push(
      `${rp(t.expenses_unlinked)} (${pct(t.expenses_unlinked, t.expenses)}) pengeluaran belum ditautkan ke pesanan, sehingga laba kotor per pesanan belum memperhitungkannya.`,
    );
  }
  if (t.profit < 0) out.push("Biaya melebihi pendapatan pada periode ini.");
  return out;
}
