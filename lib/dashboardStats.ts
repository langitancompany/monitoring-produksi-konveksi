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

// ═════════════════════════════════════════════════════════════════════════════
// Tampilan Dashboard ala Sablon: HeroSection, grafik tren/donut, Perlu Tindakan
// ═════════════════════════════════════════════════════════════════════════════

// ─── Hero ────────────────────────────────────────────────────────────────────

export interface HeroStats {
  /** semua pesanan (di luar Sampah), sepanjang masa */
  totalOrders: number;
  totalPcs: number;
  /** belum selesai */
  berjalan: number;
  selesai: number;
  /** badge: pesanan dengan kendala / telat / deadline mepet */
  kendala: number;
  telat: number;
  urgent: number;
  /** bulan berjalan, dipisah menurut kategori pesanan */
  utamaMonthlyOrders: number;
  utamaMonthlyPcs: number;
  nonUtamaMonthlyOrders: number;
  nonUtamaMonthlyPcs: number;
}

// ─── Perlu Tindakan Segera ───────────────────────────────────────────────────

export type ActionItemType = "KENDALA" | "REVISI" | "TELAT" | "URGENT";

export interface ActionItem {
  uniqueKey: string;
  order: Order;
  type: ActionItemType;
  detail: string;
}

const ACTION_PRIORITY: Record<ActionItemType, number> = { KENDALA: 4, REVISI: 3, TELAT: 2, URGENT: 1 };

/** Satu pesanan bisa menghasilkan beberapa item (mis. Kendala + Telat). Urut: paling genting dulu. */
export function actionItems(orders: Order[], today: Date): ActionItem[] {
  const items: ActionItem[] = [];
  const daysOf = new Map<string, number>(); // uniqueKey → hari ke deadline, hanya untuk pengurutan
  for (const o of orders) {
    if (!isOpen(o)) continue;
    const days = daysUntil(o.deadline, today);

    const openKendala = (o.kendala ?? []).filter((k) => !k.isResolved);
    if (o.status === "Ada Kendala" || openKendala.length > 0) {
      const latest = [...openKendala].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
      items.push({
        uniqueKey: `${o.id}-kendala`,
        order: o,
        type: "KENDALA",
        detail: latest?.notes || "Ada kendala produksi",
      });
      daysOf.set(`${o.id}-kendala`, days);
    }

    if (o.status === "Revisi") {
      const qc = o.steps?.find((s) => s.key === "qc");
      items.push({
        uniqueKey: `${o.id}-revisi`,
        order: o,
        type: "REVISI",
        detail: qc?.qc?.notes || "Perbaikan QC diperlukan",
      });
      daysOf.set(`${o.id}-revisi`, days);
    }

    if (isOverdue(o, today)) {
      const n = Math.abs(days);
      items.push({
        uniqueKey: `${o.id}-telat`,
        order: o,
        type: "TELAT",
        detail: Number.isFinite(n) && n > 0 ? `Telat ${n} hari` : "Telat",
      });
      daysOf.set(`${o.id}-telat`, days);
    } else if (getDeadlineStatus(o.deadline, o.status, today) === "warning") {
      items.push({
        uniqueKey: `${o.id}-urgent`,
        order: o,
        type: "URGENT",
        detail: days === 0 ? "Deadline hari ini" : `Deadline ${days} hari lagi`,
      });
      daysOf.set(`${o.id}-urgent`, days);
    }
  }
  const d = (i: ActionItem) => daysOf.get(i.uniqueKey) ?? 0;
  return items.sort((a, b) => ACTION_PRIORITY[b.type] - ACTION_PRIORITY[a.type] || d(a) - d(b));
}

export function computeHeroStats(orders: Order[], today: Date): HeroStats {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const items = actionItems(orders, today);
  const count = (t: ActionItemType) => items.filter((i) => i.type === t).length;

  const s: HeroStats = {
    totalOrders: orders.length,
    totalPcs: 0,
    berjalan: 0,
    selesai: 0,
    kendala: count("KENDALA"),
    telat: count("TELAT"),
    urgent: count("URGENT"),
    utamaMonthlyOrders: 0,
    utamaMonthlyPcs: 0,
    nonUtamaMonthlyOrders: 0,
    nonUtamaMonthlyPcs: 0,
  };
  for (const o of orders) {
    const pcs = o.jumlah || 0;
    s.totalPcs += pcs;
    if (isOpen(o)) s.berjalan++;
    else s.selesai++;
    if (monthKey(o.tanggal_masuk) === thisMonth) {
      if (o.kategori === "non_utama") {
        s.nonUtamaMonthlyOrders++;
        s.nonUtamaMonthlyPcs += pcs;
      } else {
        s.utamaMonthlyOrders++;
        s.utamaMonthlyPcs += pcs;
      }
    }
  }
  return s;
}

// ─── Grafik per kategori (tren 6 bulan + donut jenis produksi) ───────────────

export interface MonthlyDataPoint {
  /** "Okt" */
  name: string;
  /** pcs masuk pada bulan itu (menurut tanggal masuk) */
  pcs: number;
  /** jumlah pesanan masuk */
  total: number;
  /** pcs per jenis produksi (p_<value>) — hanya terisi pada mode bertumpuk */
  [key: string]: unknown;
}

export interface ProductionTypeDataPoint {
  name: string;
  value: number;
  [key: string]: unknown; // diperlukan oleh Recharts v3 ChartDataInput
}

export interface TypeSeries {
  /** value jenis produksi ("" = belum ditentukan) */
  key: string;
  /** kunci di dalam MonthlyDataPoint */
  dataKey: string;
  label: string;
}

/** Pcs sebuah pesanan per jenis produksi (rincian item bila ada, jika tidak jumlah total). */
function typePcs(o: Order): { value: string; pcs: number }[] {
  if (o.items?.length) return o.items.map((it) => ({ value: it.jenis_produksi, pcs: it.jumlah || 0 }));
  return [{ value: o.jenis_produksi ?? "", pcs: o.jumlah || 0 }];
}

const seriesDataKey = (value: string) => `p_${value || "belum"}`;

/** Jenis produksi yang muncul, diurut dari pcs terbanyak (urutan dipakai bar & donut agar warnanya sama). */
export function typeSeries(orders: Order[], types: ProductionTypeData[]): TypeSeries[] {
  const totals = new Map<string, number>();
  for (const o of orders) for (const t of typePcs(o)) totals.set(t.value, (totals.get(t.value) ?? 0) + t.pcs);
  return [...totals.entries()]
    .map(([key, pcs]) => ({
      key,
      pcs,
      dataKey: seriesDataKey(key),
      label: key ? typeLabel(key, types) : UNASSIGNED_LABEL,
    }))
    .sort((a, b) => b.pcs - a.pcs || a.label.localeCompare(b.label, "id"))
    .map(({ key, dataKey, label }) => ({ key, dataKey, label }));
}

/** Data donut: pcs per jenis produksi, urutan sama dengan typeSeries. */
export function typePie(orders: Order[], series: TypeSeries[]): ProductionTypeDataPoint[] {
  const totals = new Map<string, number>();
  for (const o of orders) for (const t of typePcs(o)) totals.set(t.value, (totals.get(t.value) ?? 0) + t.pcs);
  return series
    .map((s) => ({ name: s.label.toUpperCase(), value: totals.get(s.key) ?? 0 }))
    .filter((d) => d.value > 0);
}

/** Tren `months` bulan terakhir. `stacked` memecah pcs per jenis produksi. */
export function monthlyVolume(orders: Order[], today: Date, stacked = false, months = 6): MonthlyDataPoint[] {
  const keys: string[] = [];
  const points: MonthlyDataPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    points.push({
      name: MONTHS[d.getMonth()].slice(0, 3),
      total: 0,
      pcs: 0,
    });
  }
  const index = new Map(keys.map((k, i) => [k, points[i]]));
  for (const o of orders) {
    const m = index.get(monthKey(o.tanggal_masuk));
    if (!m) continue;
    m.total += 1;
    m.pcs += o.jumlah || 0;
    if (stacked) {
      for (const t of typePcs(o)) {
        const k = seriesDataKey(t.value);
        m[k] = ((m[k] as number) || 0) + t.pcs;
      }
    }
  }
  return points;
}

export function categorySummary(orders: Order[]): { orders: number; pcs: number } {
  return { orders: orders.length, pcs: orders.reduce((a, o) => a + (o.jumlah || 0), 0) };
}
