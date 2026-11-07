// app/components/inventory/StockTab.tsx
// Tab Stok: saldo dikelompokkan per jenis produksi, tiap kelompok menampilkan varian · warna · ukuran
// dan jumlahnya beserta subtotal. Pencarian dan filter jenis. (PRD-inventori §10.1)
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Boxes, History, Loader2 } from "lucide-react";
import { invFetch, errMsg } from "@/hooks/useInventoryApi";
import type { StockResponse, StockRow } from "@/lib/inventory/types";
import { skuLabel } from "@/lib/inventory/sku";
import { cardCls, filterInputCls, FilterField, SearchInput, sectionLabelCls, toolbarCls } from "@/app/components/finance/ui";
import { md } from "./responsive";

interface Props {
  version: number;
  onShowHistory: (sku: string) => void;
}

const nf = (n: number) => n.toLocaleString("id-ID");

export default function StockTab({ version, onShowHistory }: Props) {
  const [data, setData] = useState<StockResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [jenis, setJenis] = useState("");
  // Daftar jenis untuk filter diambil dari data tanpa filter, supaya pilihan tidak menyusut saat memfilter.
  const [jenisOptions, setJenisOptions] = useState<{ value: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (jenis) params.set("jenis", jenis);
        if (q.trim()) params.set("q", q.trim());
        const res = await invFetch<StockResponse>(`/api/inventori/stock?${params.toString()}`);
        if (cancelled) return;
        setData(res);
        setError(null);
        if (!jenis && !q.trim()) {
          const seen = new Map<string, string>();
          for (const r of res.rows) if (!seen.has(r.jenis_produksi)) seen.set(r.jenis_produksi, r.jenis_name);
          setJenisOptions([...seen].map(([value, name]) => ({ value, name })));
        }
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [version, jenis, q]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: StockRow[]; total: number }>();
    for (const r of data?.rows ?? []) {
      const g = map.get(r.jenis_produksi) ?? { name: r.jenis_name, rows: [], total: 0 };
      g.rows.push(r);
      g.total += r.qty;
      map.set(r.jenis_produksi, g);
    }
    return [...map.entries()].map(([value, g]) => ({ value, ...g }));
  }, [data]);

  const filtering = !!jenis || !!q.trim();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={`${cardCls} p-3 sm:p-4`}>
          <p className={sectionLabelCls}>Total stok</p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {data ? nf(data.total_pcs) : "-"} <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">pcs</span>
          </p>
        </div>
        <div className={`${cardCls} p-3 sm:p-4`}>
          <p className={sectionLabelCls}>Jenis barang</p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {data ? nf(groups.length) : "-"}{" "}
            <span className="block sm:inline text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400">
              dari {data ? nf(data.rows.length) : "-"} baris stok
            </span>
          </p>
        </div>
      </div>

      <div className={toolbarCls}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <FilterField label="Cari barang" className="flex-1">
            <SearchInput value={q} onChange={setQ} placeholder="Jenis, varian, warna, atau ukuran" className="!h-11 !text-base sm:!h-10 sm:!text-sm" />
          </FilterField>
          <FilterField label="Jenis produksi">
            <select className={`${filterInputCls} !h-11 !text-base sm:!h-10 sm:!text-sm`} value={jenis} onChange={(e) => setJenis(e.target.value)}>
              <option value="">Semua jenis</option>
              {jenisOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.name}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat stok…
        </p>
      )}

      {data && groups.length === 0 && !error && (
        <div className={`${cardCls} px-6 py-12 text-center`}>
          <Boxes className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {filtering ? "Tidak ada stok yang cocok" : "Belum ada stok"}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            {filtering
              ? "Ubah kata kunci atau pilih jenis lain."
              : "Belum ada stok. Stok bertambah setelah hasil produksi stok diverifikasi."}
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.value} className={`${cardCls} overflow-hidden`}>
          <header className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{g.name}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Subtotal{" "}
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{nf(g.total)} pcs</span>
            </p>
          </header>
          <table className={md.table}>
            <thead className={md.head}>
              <tr className="text-left">
                <th className={`${sectionLabelCls} px-4 py-2 font-semibold`}>Varian</th>
                <th className={`${sectionLabelCls} px-4 py-2 font-semibold`}>Warna</th>
                <th className={`${sectionLabelCls} px-4 py-2 font-semibold`}>Ukuran</th>
                <th className={`${sectionLabelCls} px-4 py-2 font-semibold text-right`}>Jumlah</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody className={md.body}>
              {g.rows.map((r) => (
                <tr key={r.sku_key} className={`${md.row} max-md:grid-cols-[1fr_auto_auto] max-md:items-center`}>
                  <td className="md:hidden text-sm text-zinc-800 dark:text-zinc-200">{skuLabel({ jenis_name: "", varian: r.varian, warna: r.warna, ukuran: r.ukuran })}</td>
                  <td className={`${md.cell} max-md:hidden text-zinc-700 dark:text-zinc-300`}>{r.varian || "-"}</td>
                  <td className={`${md.cell} max-md:hidden text-zinc-700 dark:text-zinc-300`}>{r.warna || "-"}</td>
                  <td className={`${md.cell} max-md:hidden font-mono tabular-nums text-zinc-700 dark:text-zinc-300`}>{r.ukuran || "-"}</td>
                  <td className={`${md.cell} text-right text-base md:text-sm font-semibold tabular-nums ${r.qty === 0 ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}>
                    {nf(r.qty)}
                  </td>
                  <td className="md:px-2 md:py-1 text-right">
                    <button
                      type="button"
                      onClick={() => onShowHistory(r.sku_key)}
                      aria-label={`Riwayat ${r.jenis_name} ${r.varian} ${r.warna} ${r.ukuran}`}
                      title="Lihat riwayat"
                      className="inline-flex items-center justify-center w-11 h-11 md:w-9 md:h-9 rounded-md text-zinc-400 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:bg-zinc-100 dark:hover:bg-zinc-900 active:bg-zinc-100 dark:active:bg-zinc-900 transition-colors duration-150"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
