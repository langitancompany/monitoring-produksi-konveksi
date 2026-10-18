// app/components/apps/ActivityLogView.tsx
//
// Log Aktivitas: rekam jejak semua kejadian pesanan (tabel order_logs).
// Diadopsi dari ActivityLogView Sablon. Beda: memakai client Supabase dari
// kerangka (PRD aturan no. 4, bukan membuat client sendiri), ada kategori
// SISTEM, dan kode pesanan bisa diklik untuk membuka detailnya.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, Clock, Filter, RefreshCw, Search } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import TablePagination from "@/app/components/ui/TablePagination";

interface LogRow {
  id: string;
  created_at: string;
  order_id: string | null;
  kode_produksi: string | null;
  category: string | null;
  event_name: string | null;
  description: string | null;
  oleh: string | null;
}

interface Props {
  supabase: SupabaseClient;
  /** buka detail pesanan dari baris log (hanya bila pesanannya masih ada) */
  onSelectOrder: (orderId: string) => void;
}

// Hanya kolom yang ditampilkan (metadata/old_value/new_value tidak dimuat)
const LOG_COLUMNS = "id, created_at, order_id, kode_produksi, category, event_name, description, oleh";
// Batas muat: 1000 log terbaru (filter & cari bekerja di data ini)
const LOG_LIMIT = 1000;

const CATEGORIES = [
  { value: "STATUS", label: "Status" },
  { value: "FILE", label: "File" },
  { value: "KENDALA", label: "Kendala" },
  { value: "QC", label: "QC" },
  { value: "REVISI", label: "Revisi" },
  { value: "SISTEM", label: "Sistem" },
];

// Teks berwarna (bukan kotak/badge besar) — sama seperti Sablon
const categoryColor = (cat: string | null) => {
  switch (cat) {
    case "STATUS":
      return "text-zinc-600 dark:text-zinc-400";
    case "FILE":
      return "text-[#2589ff]";
    case "KENDALA":
      return "text-purple-600 dark:text-purple-400";
    case "QC":
      return "text-amber-600 dark:text-amber-400";
    case "REVISI":
      return "text-rose-600 dark:text-rose-400";
    default:
      return "text-zinc-400";
  }
};

export default function ActivityLogView({ supabase, onSelectOrder }: Props) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // `reloadToken` dinaikkan untuk memuat ulang; sedang memuat = token yang diminta ≠ token yang sudah termuat
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedToken, setLoadedToken] = useState<number | null>(null);
  const loading = loadedToken !== reloadToken;

  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Batas waktu 20 dtk + 1x coba ulang, supaya koneksi macet tidak membuat spinner berputar lama
      const attempt = () => {
        const q = supabase
          .from("order_logs")
          .select(LOG_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(LOG_LIMIT);
        return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? q.abortSignal(AbortSignal.timeout(20000))
          : q;
      };

      let rows: LogRow[] | null = null;
      try {
        let res = await attempt();
        if (res.error) {
          await new Promise((r) => setTimeout(r, 1000));
          res = await attempt();
        }
        rows = res.error ? null : (res.data as LogRow[] | null);
      } catch {
        rows = null;
      }
      if (cancelled) return;

      if (rows) {
        setLogs(rows);
        setLoadError(null);
      } else {
        setLoadError("Log belum berhasil dimuat. Periksa koneksi internet (atau izin Log Aktivitas), lalu coba lagi.");
      }
      setLoadedToken(reloadToken);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, reloadToken]);

  // Muat ulang atas permintaan pengguna (tombol refresh / Coba lagi)
  const refresh = () => setReloadToken((t) => t + 1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (category !== "ALL" && log.category !== category) return false;
      if (!q) return true;
      return (
        (log.kode_produksi ?? "").toLowerCase().includes(q) ||
        (log.event_name ?? "").toLowerCase().includes(q) ||
        (log.description ?? "").toLowerCase().includes(q) ||
        (log.oleh ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, category, search]);

  const stats = useMemo(
    () => ({
      total: logs.length,
      kendala: logs.filter((l) => l.category === "KENDALA").length,
      revisi: logs.filter((l) => l.category === "REVISI").length,
      files: logs.filter((l) => l.category === "FILE").length,
    }),
    [logs],
  );

  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-6 pb-10 transition-colors duration-150">
      {/* HEADER & KONTROL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="hidden md:block">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Log Aktivitas</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Rekam jejak seluruh aktivitas produksi</p>
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 md:flex md:flex-row w-full md:w-auto md:h-10">
          <div className="relative h-10 md:h-full w-full">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              aria-label="Filter kategori log"
              className="h-full w-full pl-9 pr-8 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 appearance-none cursor-pointer transition-colors duration-150"
            >
              <option value="ALL">Semua kategori</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative h-10 md:h-full w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Cari kode, kejadian, oleh"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-full w-full pl-9 pr-4 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 transition-colors duration-150"
            />
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            title="Muat ulang log"
            aria-label="Muat ulang log"
            className="h-10 md:h-full px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors duration-150 flex items-center justify-center"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          <span>{loadError}</span>
          <button onClick={refresh} className="font-semibold underline shrink-0">
            Coba lagi
          </button>
        </div>
      )}

      {/* STATISTIK */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Total Log", value: stats.total },
          { label: "Kendala", value: stats.kendala },
          { label: "Revisi", value: stats.revisi },
          { label: "File Upload", value: stats.files },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-zinc-950 p-3 md:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800"
          >
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              {s.label}
            </p>
            <h3 className="text-xl md:text-3xl font-mono tabular-nums font-semibold text-zinc-900 dark:text-white mt-1">
              {s.value.toLocaleString("id-ID")}
            </h3>
          </div>
        ))}
      </div>

      {/* TABEL */}
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] min-h-[300px] custom-scrollbar relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold tracking-[0.12em] whitespace-nowrap">
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Waktu</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Kode</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Kategori</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Kejadian</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Keterangan</th>
                <th className="px-4 py-3 md:px-6 md:py-4 bg-inherit">Oleh</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-xs md:text-sm">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0 border-none">
                    <div className="sticky left-0 w-[calc(100vw-2rem)] md:w-full min-h-[300px] flex flex-col items-center justify-center gap-3 px-4">
                      <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#124540] dark:border-t-[#49BFB4] rounded-full animate-spin" />
                      <p className="text-zinc-500 dark:text-zinc-400 font-medium">Memuat log…</p>
                    </div>
                  </td>
                </tr>
              ) : visible.length > 0 ? (
                visible.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors duration-150">
                    <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <Clock size={14} className="opacity-70 shrink-0" />
                        {formatDateTime(log.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-mono whitespace-nowrap">
                      {log.order_id && log.kode_produksi ? (
                        <button
                          onClick={() => onSelectOrder(log.order_id!)}
                          className="text-[#124540] dark:text-[#49BFB4] font-semibold underline-offset-2 hover:underline"
                          title="Buka detail pesanan"
                        >
                          #{log.kode_produksi}
                        </button>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400" title={log.order_id ? undefined : "Pesanan sudah dihapus permanen"}>
                          {log.kode_produksi ? `#${log.kode_produksi}` : "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                      <span className={`text-[10px] md:text-xs font-semibold uppercase tracking-wide ${categoryColor(log.category)}`}>
                        {log.category ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                      {log.event_name ?? "-"}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-zinc-500 dark:text-zinc-400 min-w-[240px] max-w-md break-words">
                      {log.description && log.description !== "-" ? log.description : "-"}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                      {log.oleh ?? "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-0 border-none">
                    <div className="sticky left-0 w-[calc(100vw-2rem)] md:w-full min-h-[300px] flex flex-col items-center justify-center gap-2 px-4">
                      <p className="text-zinc-500 dark:text-zinc-400 font-medium text-center">
                        {logs.length === 0 ? "Belum ada log aktivitas." : "Tidak ada log yang cocok dengan filter."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination page={page} perPage={perPage} total={filtered.length} onPage={setPage} onPerPage={setPerPage} />
      </div>

      {logs.length >= LOG_LIMIT && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center">
          Menampilkan {LOG_LIMIT.toLocaleString("id-ID")} log terbaru. Log yang lebih lama tetap tersimpan di database.
        </p>
      )}
    </div>
  );
}
