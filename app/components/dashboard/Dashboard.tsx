// app/components/dashboard/Dashboard.tsx
//
// Dashboard ringkasan produksi (Bagian 7). Semua angka dihitung di browser dari
// daftar pesanan yang SUDAH dimuat halaman utama (tanpa query tambahan) lewat
// lib/dashboardStats.ts. Grafik memakai CSS biasa (tanpa library), jadi tidak
// menambah paket dan ikut tema terang/gelap.
//
// Dua bagian lama sengaja dipertahankan karena berlaku untuk semua unit:
// banner pengumuman dan banner "ada pembaruan".
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Package,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { UserData } from "@/types";
import type { Order, ProductionTypeData } from "@/types/order";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateBanner from "@/app/components/dashboard/UpdateBanner";
import AnnouncementBanner from "@/app/components/ui/AnnouncementBanner";
import { activeStepName } from "@/lib/steps";
import { formatDate, parseLocalDate, toLocalISODate } from "@/lib/utils";
import {
  attentionList,
  computeSummary,
  monthlySeries,
  pcsByType,
  phaseCounts,
  type AttentionLevel,
} from "@/lib/dashboardStats";

interface DashboardProps {
  currentUser: UserData;
  /** pesanan yang tidak di Sampah (semua status) */
  orders: Order[];
  productionTypes: ProductionTypeData[];
  loading: boolean;
  /** hanya yang boleh melihat pesanan yang diberi angka produksi */
  canViewOrders: boolean;
  onSelectOrder: (id: string) => void;
}

const cardCls =
  "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";
const eyebrowCls =
  "text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]";

// ─── Kartu angka ─────────────────────────────────────────────────────────────

type Tone = "neutral" | "red" | "amber" | "orange" | "cyan" | "emerald";

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  // Angka 0 tidak perlu diwarnai alarm; warna hanya muncul bila ada yang perlu dilihat.
  const active = value > 0 ? tone : "neutral";
  return (
    <div className={`${cardCls} p-4 flex items-start justify-between gap-3`}>
      <div className="min-w-0">
        <p className={eyebrowCls}>{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{hint}</p>
        )}
      </div>
      <span
        className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${TONE_ICON[active]}`}
      >
        <Icon className="w-4 h-4" />
      </span>
    </div>
  );
}

// ─── Posisi pesanan per fase ─────────────────────────────────────────────────

const PHASE_COLOR: Record<string, string> = {
  masuk: "bg-zinc-400 dark:bg-zinc-600",
  produksi: "bg-blue-500",
  finishing: "bg-purple-500",
  pengiriman: "bg-cyan-500",
};

function PhaseCard({ orders }: { orders: Order[] }) {
  const phases = useMemo(() => phaseCounts(orders), [orders]);
  const total = phases.reduce((a, p) => a + p.count, 0);

  return (
    <div className={`${cardCls} p-5`}>
      <p className={eyebrowCls}>Posisi pesanan berjalan</p>
      {total === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Tidak ada pesanan yang sedang berjalan.
        </p>
      ) : (
        <>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
            {phases
              .filter((p) => p.count > 0)
              .map((p) => (
                <div
                  key={p.key}
                  className={`${PHASE_COLOR[p.key]} h-full transition-all duration-150`}
                  style={{ width: `${(p.count / total) * 100}%` }}
                  title={`${p.label}: ${p.count}`}
                />
              ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {phases.map((p) => (
              <li key={p.key} className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${PHASE_COLOR[p.key]}`} />
                <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{p.label}</span>
                <span className="ml-auto text-sm font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {p.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Perlu perhatian ─────────────────────────────────────────────────────────

const LEVEL_BADGE: Record<AttentionLevel, string> = {
  telat:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  kendala:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  mepet:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
};

function AttentionCard({
  orders,
  today,
  onSelectOrder,
}: {
  orders: Order[];
  today: Date;
  onSelectOrder: (id: string) => void;
}) {
  const items = useMemo(() => attentionList(orders, today, 6), [orders, today]);

  return (
    <div className={`${cardCls} p-5`}>
      <p className={eyebrowCls}>Perlu perhatian</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Tidak ada pesanan telat, bermasalah, atau mepet deadline.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
          {items.map(({ order, level, reason }) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => onSelectOrder(order.id)}
                className="w-full flex items-center gap-3 py-2.5 text-left rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors duration-150 px-1.5 -mx-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 truncate">
                    {order.kode_produksi}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {order.nama_pemesan} · {activeStepName(order.steps)} · {formatDate(order.deadline)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-md border ${LEVEL_BADGE[level]}`}
                >
                  {reason}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-zinc-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Pcs per jenis produksi ──────────────────────────────────────────────────

function TypeCard({
  orders,
  productionTypes,
}: {
  orders: Order[];
  productionTypes: ProductionTypeData[];
}) {
  const rows = useMemo(() => pcsByType(orders, productionTypes), [orders, productionTypes]);
  const max = Math.max(1, ...rows.map((r) => r.pcs));

  return (
    <div className={`${cardCls} p-5`}>
      <p className={eyebrowCls}>Pcs dalam produksi menurut jenis</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Belum ada pesanan berjalan.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.value || "_belum"}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-zinc-700 dark:text-zinc-300">{r.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{r.pcs}</span> pcs ·{" "}
                  {r.orders} pesanan
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#124540] dark:bg-[#49BFB4] transition-all duration-150"
                  style={{ width: `${(r.pcs / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Grafik bulanan ──────────────────────────────────────────────────────────

function Bar({ value, max, cls, label }: { value: number; max: number; cls: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-end h-full flex-1 max-w-[22px]" title={label}>
      <span className="mb-0.5 text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
        {value > 0 ? value : ""}
      </span>
      <div
        className={`w-full rounded-t-sm ${cls} transition-all duration-150`}
        // tinggi minimal 3px supaya nilai kecil tetap terlihat; nol = tanpa batang
        style={{ height: value > 0 ? `max(3px, ${(value / max) * 85}%)` : 0 }}
      />
    </div>
  );
}

function MonthlyCard({ orders, today }: { orders: Order[]; today: Date }) {
  const series = useMemo(() => monthlySeries(orders, today, 6), [orders, today]);
  const max = Math.max(1, ...series.flatMap((p) => [p.masuk, p.selesai]));
  const empty = series.every((p) => p.masuk === 0 && p.selesai === 0);

  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={eyebrowCls}>6 bulan terakhir</p>
        <div className="flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-300 dark:bg-zinc-600" /> Pesanan masuk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#124540] dark:bg-[#49BFB4]" /> Selesai
          </span>
        </div>
      </div>

      {empty ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Belum ada data pesanan.</p>
      ) : (
        <div className="mt-4 grid grid-cols-6 gap-2">
          {series.map((p) => (
            <div key={p.key} className="flex flex-col items-center min-w-0" title={p.fullLabel}>
              <div className="flex items-end justify-center gap-1 h-36 w-full">
                <Bar
                  value={p.masuk}
                  max={max}
                  cls="bg-zinc-300 dark:bg-zinc-600"
                  label={`${p.fullLabel}: ${p.masuk} pesanan masuk`}
                />
                <Bar
                  value={p.selesai}
                  max={max}
                  cls="bg-[#124540] dark:bg-[#49BFB4]"
                  label={`${p.fullLabel}: ${p.selesai} selesai`}
                />
              </div>
              <span className="mt-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                {p.label}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        Masuk = menurut tanggal masuk. Selesai = menurut kapan tahap terakhir selesai.
      </p>
    </div>
  );
}

// ─── Halaman ─────────────────────────────────────────────────────────────────

export default function Dashboard({
  currentUser,
  orders,
  productionTypes,
  loading,
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

  const summary = useMemo(() => computeSummary(orders, today), [orders, today]);

  const todayLabel = today.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4 md:space-y-5">
      {hasUpdate && updateInfo && (
        <UpdateBanner updateInfo={updateInfo} onUpdate={applyUpdate} onDismiss={dismissUpdate} />
      )}

      <AnnouncementBanner />

      <div className={`${cardCls} p-6 md:p-8`}>
        <p className={eyebrowCls}>Konveksi · {todayLabel}</p>
        <h2 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Selamat datang, {currentUser.name}
        </h2>
        {canViewOrders && !loading && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {summary.aktif === 0
              ? "Tidak ada pesanan yang sedang berjalan."
              : `${summary.aktif} pesanan berjalan (${summary.pcsAktif} pcs)` +
                (summary.telat > 0 ? `, ${summary.telat} di antaranya telat.` : ".")}
          </p>
        )}
      </div>

      {!canViewOrders ? (
        <div className={`${cardCls} p-5 text-sm text-zinc-500 dark:text-zinc-400`}>
          Akun Anda belum punya izin melihat pesanan, jadi ringkasan produksi tidak ditampilkan.
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${cardCls} h-[84px] animate-pulse`} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            <StatCard label="Berjalan" value={summary.aktif} hint={`${summary.pcsAktif} pcs`} icon={Package} tone="neutral" />
            <StatCard label="Telat" value={summary.telat} hint="lewat deadline" icon={AlertCircle} tone="red" />
            <StatCard label="Mepet" value={summary.mepet} hint="deadline ≤ 2 hari" icon={Clock} tone="amber" />
            <StatCard label="Kendala / Revisi" value={summary.kendala} icon={AlertTriangle} tone="orange" />
            <StatCard label="Siap Kirim" value={summary.siapKirim} icon={Truck} tone="cyan" />
            <StatCard label="Selesai bulan ini" value={summary.selesaiBulanIni} icon={CheckCircle2} tone="emerald" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            <AttentionCard orders={orders} today={today} onSelectOrder={onSelectOrder} />
            <PhaseCard orders={orders} />
            <TypeCard orders={orders} productionTypes={productionTypes} />
            <MonthlyCard orders={orders} today={today} />
          </div>
        </>
      )}
    </div>
  );
}
