// lib/dashboardStats.ts
//
// Angka-angka untuk Dashboard (Bagian 7). Murni fungsi (tanpa akses database,
// `today` bisa disuntikkan) supaya mudah diuji. Aturan "Telat"/"Mepet" memakai
// getDeadlineStatus yang sama dengan Daftar Pesanan, jadi angkanya selalu cocok.

import type { Order, ProductionTypeData } from "@/types/order";
import { currentPhase } from "@/lib/steps";
import { completionDate, monthKey } from "@/lib/orderArchive";
import { MONTHS, daysUntil, getDeadlineStatus, typeLabel } from "@/lib/utils";

/** Pesanan yang masih berjalan (belum Selesai). Pemanggil sudah membuang yang di Sampah. */
export const isOpen = (o: Pick<Order, "status">) => o.status !== "Selesai";

/** Telat = lewat deadline & belum Kirim/Selesai (sama dengan filter "Telat" di Daftar Pesanan). */
export const isOverdue = (o: Pick<Order, "status" | "deadline">, today: Date) =>
  o.status === "Telat" || getDeadlineStatus(o.deadline, o.status, today) === "overdue";

const isTroubled = (o: Pick<Order, "status">) => o.status === "Ada Kendala" || o.status === "Revisi";

// ─── Kartu ringkasan ─────────────────────────────────────────────────────────

export interface DashboardSummary {
  /** pesanan belum selesai */
  aktif: number;
  telat: number;
  /** deadline ≤ 2 hari lagi dan belum telat */
  mepet: number;
  /** status Ada Kendala atau Revisi */
  kendala: number;
  /** status Kirim (siap/sedang dikirim) */
  siapKirim: number;
  /** pesanan Selesai yang tahap terakhirnya selesai di bulan berjalan */
  selesaiBulanIni: number;
  /** total pcs pada pesanan yang belum selesai */
  pcsAktif: number;
}

export function computeSummary(orders: Order[], today: Date): DashboardSummary {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const s: DashboardSummary = { aktif: 0, telat: 0, mepet: 0, kendala: 0, siapKirim: 0, selesaiBulanIni: 0, pcsAktif: 0 };
  for (const o of orders) {
    if (!isOpen(o)) {
      if (monthKey(completionDate(o)) === thisMonth) s.selesaiBulanIni++;
      continue;
    }
    s.aktif++;
    s.pcsAktif += o.jumlah || 0;
    if (isOverdue(o, today)) s.telat++;
    else if (getDeadlineStatus(o.deadline, o.status, today) === "warning") s.mepet++;
    if (isTroubled(o)) s.kendala++;
    if (o.status === "Kirim") s.siapKirim++;
  }
  return s;
}

// ─── Posisi pesanan per fase (sama dengan kolom Kanban) ──────────────────────

export interface PhaseCount {
  key: "masuk" | "produksi" | "finishing" | "pengiriman";
  label: string;
  count: number;
}

/** Kolom ditentukan fase tahap aktif (currentPhase), BUKAN status — lihat PRD §14. */
export function phaseCounts(orders: Order[]): PhaseCount[] {
  const out: PhaseCount[] = [
    { key: "masuk", label: "Pesanan Masuk", count: 0 },
    { key: "produksi", label: "Produksi", count: 0 },
    { key: "finishing", label: "Finishing", count: 0 },
    { key: "pengiriman", label: "Pengiriman", count: 0 },
  ];
  for (const o of orders) {
    if (!isOpen(o)) continue;
    switch (currentPhase(o)) {
      case "Pesanan Masuk": out[0].count++; break;
      case "On Process": out[1].count++; break;
      case "Finishing": out[2].count++; break;
      case "Kirim": out[3].count++; break;
      default: break; // Selesai: tidak ditampilkan
    }
  }
  return out;
}

// ─── Pcs per jenis produksi (pesanan yang masih berjalan) ────────────────────

export interface TypeBreakdown {
  /** value jenis produksi; "" = belum ditentukan (utama sebelum Approval) */
  value: string;
  label: string;
  pcs: number;
  orders: number;
}

export const UNASSIGNED_LABEL = "Belum Approval";

export function pcsByType(orders: Order[], types: ProductionTypeData[]): TypeBreakdown[] {
  const map = new Map<string, { pcs: number; orderIds: Set<string> }>();
  const add = (value: string, pcs: number, id: string) => {
    const cur = map.get(value) ?? { pcs: 0, orderIds: new Set<string>() };
    cur.pcs += pcs;
    cur.orderIds.add(id);
    map.set(value, cur);
  };
  for (const o of orders) {
    if (!isOpen(o)) continue;
    if (o.items?.length) {
      for (const it of o.items) add(it.jenis_produksi, it.jumlah || 0, o.id);
    } else {
      // utama sebelum Approval: hanya ada jumlah total, belum ada jenis
      add(o.jenis_produksi ?? "", o.jumlah || 0, o.id);
    }
  }
  return [...map.entries()]
    .map(([value, v]) => ({
      value,
      label: value ? typeLabel(value, types) : UNASSIGNED_LABEL,
      pcs: v.pcs,
      orders: v.orderIds.size,
    }))
    .sort((a, b) => b.pcs - a.pcs || a.label.localeCompare(b.label, "id"));
}

// ─── Grafik bulanan ──────────────────────────────────────────────────────────

export interface MonthPoint {
  /** "2026-10" */
  key: string;
  /** "Okt" */
  label: string;
  /** "Oktober 2026" */
  fullLabel: string;
  /** pesanan masuk (menurut tanggal masuk) */
  masuk: number;
  /** pesanan selesai (menurut waktu tahap terakhir selesai) */
  selesai: number;
}

/** `months` bulan terakhir, berakhir di bulan `today`. Urut dari yang paling lama. */
export function monthlySeries(orders: Order[], today: Date, months = 6): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    points.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS[d.getMonth()].slice(0, 3),
      fullLabel: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      masuk: 0,
      selesai: 0,
    });
  }
  const index = new Map(points.map((p) => [p.key, p]));
  for (const o of orders) {
    const m = index.get(monthKey(o.tanggal_masuk));
    if (m) m.masuk++;
    if (!isOpen(o)) {
      const f = index.get(monthKey(completionDate(o)));
      if (f) f.selesai++;
    }
  }
  return points;
}

// ─── Perlu perhatian ─────────────────────────────────────────────────────────

export type AttentionLevel = "telat" | "kendala" | "mepet";

export interface AttentionItem {
  order: Order;
  level: AttentionLevel;
  /** teks pendek, mis. "Telat 3 hari" */
  reason: string;
  /** hari ke deadline (negatif = telat) */
  days: number;
}

const LEVEL_RANK: Record<AttentionLevel, number> = { telat: 0, kendala: 1, mepet: 2 };

/**
 * Pesanan yang butuh tindakan: telat, ada kendala/revisi, atau deadline ≤ 2 hari.
 * Urut: telat (paling lama dulu) → kendala/revisi → mepet (paling dekat dulu).
 */
export function attentionList(orders: Order[], today: Date, limit = 6): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const o of orders) {
    if (!isOpen(o)) continue;
    const days = daysUntil(o.deadline, today);
    if (isOverdue(o, today)) {
      const n = Math.abs(days);
      items.push({ order: o, level: "telat", days, reason: Number.isFinite(n) && n > 0 ? `Telat ${n} hari` : "Telat" });
    } else if (isTroubled(o)) {
      items.push({ order: o, level: "kendala", days, reason: o.status });
    } else if (getDeadlineStatus(o.deadline, o.status, today) === "warning") {
      items.push({ order: o, level: "mepet", days, reason: days === 0 ? "Deadline hari ini" : `Deadline ${days} hari lagi` });
    }
  }
  return items
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.days - b.days)
    .slice(0, limit);
}
