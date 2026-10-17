// app/components/orders/OrderList.tsx
// Daftar pesanan aktif (dipakai menu Pesanan Utama dan Pesanan Non-Utama).
// Filter status, bulan, dan pencarian — gaya sama dengan Sablon.
"use client";

import React, { useMemo, useState } from "react";
import { Plus, Search, CalendarClock, Phone } from "lucide-react";
import type { Order, ProductionTypeData } from "@/types/order";
import { activeStepName, stepProgress } from "@/lib/steps";
import { MONTHS, formatDate, getDeadlineStatus, getStatusColor, typeLabel } from "@/lib/utils";
import { inputCls } from "@/app/components/settings/settingsShared";

interface Props {
  orders: Order[];
  productionTypes: ProductionTypeData[];
  title: string;
  loading?: boolean;
  canCreate: boolean;
  onNewOrder: () => void;
  onSelectOrder: (id: string) => void;
}

const FILTERS = [
  { id: null, label: "Semua" },
  { id: "process", label: "Proses" },
  { id: "overdue", label: "Telat" },
  { id: "kendala", label: "Kendala" },
  { id: "ready", label: "Siap Kirim" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export default function OrderList({ orders, productionTypes, title, loading, canCreate, onNewOrder, onSelectOrder }: Props) {
  const [statusFilter, setStatusFilter] = useState<FilterId>(null);
  const [monthFilter, setMonthFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (o.status === "Selesai") return false; // arsip ada di menu Pesanan Selesai
        if (statusFilter === "process" && !["On Process", "Finishing", "Pesanan Masuk"].includes(o.status)) return false;
        if (statusFilter === "overdue" && !(o.status === "Telat" || getDeadlineStatus(o.deadline, o.status) === "overdue")) return false;
        if (statusFilter === "kendala" && !["Ada Kendala", "Revisi"].includes(o.status)) return false;
        if (statusFilter === "ready" && o.status !== "Kirim") return false;
        if (monthFilter !== "all" && new Date(o.tanggal_masuk).getMonth().toString() !== monthFilter) return false;
        if (q && !`${o.kode_produksi} ${o.nama_pemesan} ${o.no_hp}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()); // paling mepet di atas
  }, [orders, statusFilter, monthFilter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            <span className="font-mono tabular-nums">{filtered.length}</span> pesanan aktif
          </p>
        </div>
        {canCreate && (
          <button
            onClick={onNewOrder}
            className="flex items-center gap-1.5 bg-[#124540] hover:bg-[#0d332f] text-white px-3 py-2 rounded-md text-xs font-semibold transition-colors duration-150"
          >
            <Plus className="w-4 h-4" /> Pesanan baru
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => {
            const active = statusFilter === f.id;
            return (
              <button
                key={f.label}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border whitespace-nowrap transition-colors duration-150 ${
                  active
                    ? "bg-[#124540] text-white border-[#124540]"
                    : "bg-white dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className={`${inputCls} w-auto text-xs py-1.5 focus:ring-2 focus:ring-[#124540] focus:border-[#124540]`}
        >
          <option value="all">Semua Bulan</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-44">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode, nama, no. HP..."
            className={`${inputCls} pl-9 text-xs py-1.5 focus:ring-2 focus:ring-[#124540] focus:border-[#124540]`}
          />
        </div>
      </div>

      {loading && orders.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">Memuat data pesanan…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center text-sm text-zinc-400 dark:text-zinc-600">
          Tidak ada pesanan
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {filtered.map((o) => {
            const dl = getDeadlineStatus(o.deadline, o.status);
            const progress = stepProgress(o.steps);
            return (
              <button
                key={o.id}
                onClick={() => onSelectOrder(o.id)}
                className="text-left bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-[#124540] dark:hover:border-[#49BFB4] transition-colors duration-150"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">{o.kode_produksi}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(dl === "overdue" && o.status !== "Ada Kendala" ? "Telat" : o.status)}`}>
                    {dl === "overdue" && o.status !== "Ada Kendala" ? "Telat" : o.status}
                  </span>
                </div>
                <p className="mt-1.5 font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{o.nama_pemesan}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {o.jenis_produksi ? typeLabel(o.jenis_produksi, productionTypes) : "Jenis produksi belum dipilih"} ·{" "}
                  <span className="font-mono tabular-nums">{o.jumlah}</span> pcs
                </p>

                <div className="mt-3 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-[#124540] dark:bg-[#49BFB4]" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="truncate">Tahap: {activeStepName(o.steps)}</span>
                  <span className="font-mono tabular-nums">{progress}%</span>
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-between text-[11px]">
                  <span className={`flex items-center gap-1 font-semibold ${dl === "overdue" ? "text-red-600 dark:text-red-400" : dl === "warning" ? "text-orange-600 dark:text-orange-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                    <CalendarClock className="w-3.5 h-3.5" /> {formatDate(o.deadline)}
                  </span>
                  {o.no_hp && (
                    <span className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500 font-mono tabular-nums">
                      <Phone className="w-3 h-3" /> {o.no_hp}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
