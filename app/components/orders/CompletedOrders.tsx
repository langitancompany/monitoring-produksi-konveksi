// app/components/orders/CompletedOrders.tsx
//
// Arsip pesanan yang sudah Selesai (diadopsi dari CompletedOrders Sablon).
// Beda dengan Sablon:
//  - "Tgl. Selesai" = waktu tahap terakhir selesai (bukan deadline) → lihat completionDate()
//  - filter bulan memakai bulan selesai LENGKAP dengan tahun (Sablon hanya nama bulan,
//    sehingga Oktober 2025 & 2026 tercampur)
//  - ada filter Utama / Non-Utama dan statistik "tepat waktu"
//  - tanpa grafik (recharts belum dipasang; masuk Bagian 7 — Dashboard)
"use client";

import React, { useMemo, useState } from "react";
import { Calendar, CheckCircle2, ChevronDown, Eye, Package, Scissors, Search, Shirt } from "lucide-react";
import type { Order, OrderKategori, ProductionTypeData } from "@/types/order";
import { MONTHS, formatDate } from "@/lib/utils";
import { completionDate, finishedOnTime, itemsSummary, monthKey } from "@/lib/orderArchive";
import TablePagination from "@/app/components/ui/TablePagination";

interface Props {
  /** pesanan berstatus Selesai & tidak di Sampah (sudah disaring pemanggil) */
  orders: Order[];
  productionTypes: ProductionTypeData[];
  onSelectOrder: (id: string) => void;
}

/** "2026-10" → "Oktober 2026" */
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};

const selectCls =
  "h-full w-full pl-9 pr-8 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 appearance-none cursor-pointer transition-colors duration-150";

export default function CompletedOrders({ orders, productionTypes, onSelectOrder }: Props) {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("all");
  const [kategori, setKategori] = useState<"all" | OrderKategori>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Sematkan waktu selesai sekali per pesanan (dipakai urut, filter, tampilan)
  const rows = useMemo(
    () => orders.map((o) => ({ order: o, doneAt: completionDate(o) })),
    [orders],
  );

  // Pilihan bulan = hanya bulan yang memang punya pesanan selesai, terbaru di atas
  const monthOptions = useMemo(
    () => [...new Set(rows.map((r) => monthKey(r.doneAt)).filter(Boolean))].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(({ order: o, doneAt }) => {
        if (kategori !== "all" && o.kategori !== kategori) return false;
        if (month !== "all" && monthKey(doneAt) !== month) return false;
        if (!q) return true;
        return (
          o.nama_pemesan.toLowerCase().includes(q) ||
          o.kode_produksi.toLowerCase().includes(q) ||
          (o.no_hp ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Date.parse(b.doneAt) - Date.parse(a.doneAt));
  }, [rows, search, month, kategori]);

  const stats = useMemo(() => {
    const onTime = filtered.filter((r) => finishedOnTime(r.order)).length;
    return {
      totalOrder: filtered.length,
      totalPcs: filtered.reduce((n, r) => n + (r.order.jumlah || 0), 0),
      onTime,
      onTimePct: filtered.length ? Math.round((onTime / filtered.length) * 100) : 0,
    };
  }, [filtered]);

  // Filter berubah → kembali ke halaman 1 (tanpa effect: dilakukan di handler)
  const resetPage = () => setPage(1);
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  const scopeLabel = month !== "all" ? monthLabel(month) : "Semua waktu";

  return (
    <div className="space-y-6 pb-10 transition-colors duration-150">
      {/* HEADER & KONTROL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="hidden md:block">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Pesanan Selesai</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Arsip pesanan yang sudah rampung dan diterima</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:flex md:flex-row w-full md:w-auto md:h-10">
          <div className="relative h-10 md:h-full w-full">
            <Shirt className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <select
              value={kategori}
              onChange={(e) => {
                setKategori(e.target.value as "all" | OrderKategori);
                resetPage();
              }}
              className={selectCls}
              aria-label="Filter kategori pesanan"
            >
              <option value="all">Semua kategori</option>
              <option value="utama">Utama</option>
              <option value="non_utama">Non-Utama</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative h-10 md:h-full w-full">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                resetPage();
              }}
              className={selectCls}
              aria-label="Filter bulan selesai"
            >
              <option value="all">Semua bulan</option>
              {monthOptions.map((k) => (
                <option key={k} value={k}>
                  {monthLabel(k)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative h-10 md:h-full w-full col-span-2 md:col-span-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Cari kode, pemesan, no. HP"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              className="h-full w-full pl-9 pr-4 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 transition-colors duration-150"
            />
          </div>
        </div>
      </div>

      {/* STATISTIK */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <StatCard label="Total Pesanan" value={stats.totalOrder.toLocaleString("id-ID")} chip={scopeLabel} />
        <StatCard label="Total Pakaian" value={stats.totalPcs.toLocaleString("id-ID")} chip="Pcs" />
        <div className="col-span-2 md:col-span-1">
          <StatCard
            label="Selesai Tepat Waktu"
            value={`${stats.onTimePct}%`}
            chip={`${stats.onTime} dari ${stats.totalOrder} pesanan`}
          />
        </div>
      </div>

      {/* TABEL */}
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] min-h-[300px] custom-scrollbar relative">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold tracking-[0.12em]">
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Kode</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Pemesan</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Jenis Produksi</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit text-center">Jml (Pcs)</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Deadline</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Selesai</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-center sticky right-0 bg-zinc-50 dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800">
                  Aksi
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-xs md:text-sm">
              {visible.length > 0 ? (
                visible.map(({ order, doneAt }) => {
                  const onTime = finishedOnTime(order);
                  const summary = itemsSummary(order, productionTypes);
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors duration-150 group"
                    >
                      <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-zinc-500 dark:text-zinc-400">
                        #{order.kode_produksi}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 font-semibold text-zinc-700 dark:text-zinc-200">
                        <span className="inline-flex items-center gap-1.5">
                          {order.kategori === "non_utama" ? (
                            <Scissors className="w-3 h-3 text-zinc-400 shrink-0" aria-label="Non-Utama" />
                          ) : (
                            <Shirt className="w-3 h-3 text-zinc-400 shrink-0" aria-label="Utama" />
                          )}
                          {order.nama_pemesan}
                        </span>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4">
                        <span
                          title={summary}
                          className="inline-block max-w-[240px] truncate align-middle px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-[9px] md:text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 uppercase"
                        >
                          {summary}
                        </span>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 text-center font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                        {order.jumlah}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-zinc-500 dark:text-zinc-400">
                        {formatDate(order.deadline)}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-zinc-500 dark:text-zinc-400">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 ${onTime ? "text-emerald-600" : "text-orange-500"}`}
                            aria-hidden
                          />
                          {formatDate(doneAt)}
                          {!onTime && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                              Telat
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 text-center sticky right-0 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50 border-l border-zinc-100 dark:border-zinc-900 transition-colors duration-150">
                        <button
                          onClick={() => onSelectOrder(order.id)}
                          className="p-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:border-[#124540] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 flex items-center justify-center gap-1.5 mx-auto"
                          title="Lihat detail pesanan"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden md:inline text-[10px] font-semibold">Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-0 border-none">
                    <div className="sticky left-0 w-[calc(100vw-3.5rem)] md:w-full min-h-[300px] flex flex-col items-center justify-center gap-3 px-4">
                      <Package className="w-12 h-12 opacity-20 text-zinc-500 dark:text-zinc-400" />
                      <p className="text-zinc-500 dark:text-zinc-400 font-medium text-center">
                        {orders.length === 0
                          ? "Belum ada pesanan yang selesai."
                          : "Tidak ada pesanan selesai yang cocok dengan filter."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          perPage={perPage}
          total={filtered.length}
          onPage={setPage}
          onPerPage={setPerPage}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, chip }: { label: string; value: string; chip: string }) {
  return (
    <div className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 h-full">
      <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
        {value}
      </h3>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 mt-2">
        {chip}
      </span>
    </div>
  );
}
