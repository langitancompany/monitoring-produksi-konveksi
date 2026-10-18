// app/components/dashboard/Dashboard.tsx
//
// Dashboard ringkasan produksi dengan tampilan yang sama dengan aplikasi Sablon:
// HeroSection → grafik tren + donut per kelompok → Perlu Tindakan Segera.
//
// Semua angka dihitung di browser dari daftar pesanan yang SUDAH dimuat halaman
// utama (tanpa query tambahan) lewat lib/dashboardStats.ts.
//
// Sambutan ("Assalamu'alaikum, <nama>") sengaja TIDAK ada di sini — tampil di Header.
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Scissors, Package } from "lucide-react";
import type { Order, ProductionTypeData } from "@/types/order";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import AnnouncementBanner from "@/app/components/ui/AnnouncementBanner";
import UpdateBanner from "@/app/components/dashboard/UpdateBanner";
import HeroSection from "@/app/components/dashboard/HeroSection";
import ChartBar, { type BarSeries } from "@/app/components/dashboard/ChartBar";
import ChartPie from "@/app/components/dashboard/ChartPie";
import ActionList from "@/app/components/dashboard/ActionList";
import { parseLocalDate, toLocalISODate } from "@/lib/utils";
import {
  actionItems as buildActionItems,
  categorySummary,
  computeHeroStats,
  monthlyVolume,
  typePie,
  typeSeries,
} from "@/lib/dashboardStats";

// Palet pesanan utama (teal / oranye / kuning) — sama dengan palet Kaos di Sablon.
const UTAMA_COLORS = ["#49BFB4", "#ff6437", "#e4e596", "#6366f1", "#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b"];
// Palet non-utama — satu warna per jenis. Warna jenis SAMA di grafik tren & donut karena urutannya sama.
const NON_UTAMA_COLORS = ["#6366f1", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#06b6d4"];

interface DashboardProps {
  /** pesanan yang tidak di Sampah (semua status) */
  orders: Order[];
  productionTypes: ProductionTypeData[];
  /** true selama data pesanan belum selesai dimuat (tampilkan kerangka, bukan angka 0). */
  loading?: boolean;
  /** hanya yang boleh melihat pesanan yang diberi angka produksi */
  canViewOrders: boolean;
  onSelectOrder: (id: string) => void;
}

export default function Dashboard({
  orders,
  productionTypes,
  loading = false,
  canViewOrders,
  onSelectOrder,
}: DashboardProps) {
  const { hasUpdate, updateInfo, applyUpdate, dismissUpdate } = useUpdateCheck({
    enableServiceWorker: false,
  });

  // "Hari ini" diperbarui bila aplikasi dibiarkan terbuka melewati tengah malam.
  const [dayKey, setDayKey] = useState(() => toLocalISODate());
  useEffect(() => {
    const id = setInterval(() => setDayKey(toLocalISODate()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = useMemo(() => parseLocalDate(dayKey), [dayKey]);

  const stats = useMemo(() => computeHeroStats(orders, today), [orders, today]);
  const actionItems = useMemo(() => buildActionItems(orders, today), [orders, today]);

  // ── Pesanan Utama ──────────────────────────────────────────────────────────
  const utamaOrders = useMemo(() => orders.filter((o) => o.kategori !== "non_utama"), [orders]);
  const utamaSummary = useMemo(() => categorySummary(utamaOrders), [utamaOrders]);
  const utamaMonthly = useMemo(() => monthlyVolume(utamaOrders, today), [utamaOrders, today]);
  const utamaPie = useMemo(
    () => typePie(utamaOrders, typeSeries(utamaOrders, productionTypes)),
    [utamaOrders, productionTypes],
  );

  // ── Pesanan Non-Utama ──────────────────────────────────────────────────────
  const nonUtamaOrders = useMemo(() => orders.filter((o) => o.kategori === "non_utama"), [orders]);
  const nonUtamaSummary = useMemo(() => categorySummary(nonUtamaOrders), [nonUtamaOrders]);
  const nonUtamaSeries = useMemo(
    () => typeSeries(nonUtamaOrders, productionTypes),
    [nonUtamaOrders, productionTypes],
  );
  const nonUtamaMonthly = useMemo(
    () => monthlyVolume(nonUtamaOrders, today, true),
    [nonUtamaOrders, today],
  );
  const nonUtamaPie = useMemo(
    () => typePie(nonUtamaOrders, nonUtamaSeries),
    [nonUtamaOrders, nonUtamaSeries],
  );
  const nonUtamaBarSeries = useMemo<BarSeries[]>(
    () =>
      nonUtamaSeries.map((s, i) => ({
        dataKey: s.dataKey,
        label: s.label,
        color: NON_UTAMA_COLORS[i % NON_UTAMA_COLORS.length],
      })),
    [nonUtamaSeries],
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Announcement dari admin */}
      <AnnouncementBanner />

      {/* Notifikasi update versi baru — tampil hanya jika ada update */}
      {hasUpdate && updateInfo && (
        <UpdateBanner updateInfo={updateInfo} onUpdate={applyUpdate} onDismiss={dismissUpdate} />
      )}

      {!canViewOrders ? (
        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 text-sm text-zinc-500 dark:text-zinc-400">
          Akun Anda belum punya izin melihat pesanan, jadi ringkasan produksi tidak ditampilkan.
        </div>
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Hero stats */}
          <HeroSection stats={stats} />

          {/* ── Pesanan Utama ────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeader
              icon={<Scissors className="w-4 h-4" strokeWidth={2} />}
              title="Pesanan Utama"
              subtitle="Jahitan reguler: seragam, celana, kaos, dst."
              summary={utamaSummary}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="lg:col-span-3">
                <ChartBar
                  monthlyData={utamaMonthly}
                  title="Tren Volume Pesanan Utama"
                  subtitle="Jumlah pcs masuk · 6 bulan terakhir"
                  color={UTAMA_COLORS[0]}
                />
              </div>
              <div className="lg:col-span-2">
                <ChartPie
                  productionTypeData={utamaPie}
                  title="Jenis Produksi Utama"
                  subtitle="Distribusi pcs per jenis produksi"
                  totalLabel="Total pcs"
                  colors={UTAMA_COLORS}
                />
              </div>
            </div>
          </section>

          {/* ── Pesanan Non-Utama ────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeader
              icon={<Package className="w-4 h-4" strokeWidth={2} />}
              title="Pesanan Non-Utama"
              subtitle="Selempang wisuda, permak, dst."
              summary={nonUtamaSummary}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="lg:col-span-3">
                <ChartBar
                  monthlyData={nonUtamaMonthly}
                  title="Tren Volume Non-Utama"
                  subtitle="Jumlah pcs masuk per jenis · 6 bulan terakhir"
                  color={NON_UTAMA_COLORS[0]}
                  series={nonUtamaBarSeries}
                />
              </div>
              <div className="lg:col-span-2">
                <ChartPie
                  productionTypeData={nonUtamaPie}
                  title="Jenis Non-Utama"
                  subtitle="Distribusi pcs per jenis"
                  totalLabel="Total pcs"
                  colors={NON_UTAMA_COLORS}
                />
              </div>
            </div>
          </section>

          {/* Action items */}
          <ActionList actionItems={actionItems} onSelectOrder={onSelectOrder} />
        </>
      )}
    </div>
  );
}

/** Judul satu kelompok (Utama / Non-Utama) + ringkasan jumlah pesanan & pcs. */
function SectionHeader({
  icon,
  title,
  subtitle,
  summary,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  summary: { orders: number; pcs: number };
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-1">
      <div className="flex items-center gap-2.5">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
            {title}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono tabular-nums text-[11px]">
        <span className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300">
          {summary.orders.toLocaleString("id-ID")} pesanan
        </span>
        <span className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300">
          {summary.pcs.toLocaleString("id-ID")} pcs
        </span>
      </div>
    </div>
  );
}

/** Kerangka dashboard selama data dimuat: lebih jujur daripada menampilkan angka 0. */
function DashboardSkeleton() {
  const block = "rounded-md bg-zinc-200 dark:bg-zinc-800";
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-busy="true" aria-label="Memuat data">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-16`} />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
          <div className={`${block} h-64 lg:col-span-3`} />
          <div className={`${block} h-64 lg:col-span-2`} />
        </div>
      ))}
      <div className={`${block} h-40`} />
    </div>
  );
}
