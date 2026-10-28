// app/components/finance/tabs/ReportTab.tsx
//
// Laporan: laba (basis TAGIHAN) dan arus kas (basis UANG) berdampingan. Seluruh angka dihitung database (fin_report).
//   Pendapatan = nilai tagihan pesanan yang masuk pada periode (tanggal masuk pesanan)
//   Biaya      = pengeluaran DISETUJUI pada periode
//   Laba       = Pendapatan − Biaya  (perkiraan manajemen, bukan laba pembukuan)
// Ekspor Excel (4 lembar) sesuai rentang yang sedang tampil. Hanya untuk yang berhak menyetujui (keuangan.edit) atau Super Admin.
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TrendingUp, Wallet, ArrowUpFromLine, Hourglass, AlertTriangle } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { ReportData } from "@/lib/finance/types";
import {
  datePreset, isValidRange, lossOrders, monthLabel, pct, reportWarnings, sortReportOrders,
  type OrderSort, type RangePreset,
} from "@/lib/finance/report";
import { SummaryCard } from "../SummaryCard";
import { FilterField, filterInputCls, toolbarCls, cardCls, sectionLabelCls, smallGhostBtnCls } from "../ui";
import ExportButton from "../ExportButton";
import { exportFileName, reportSheets } from "@/lib/finance/excel";
import { formatRupiah, todayYmd } from "../utils";

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "month", label: "Bulan ini" },
  { id: "3m", label: "3 bulan" },
  { id: "year", label: "Tahun ini" },
];

export default function ReportTab({ version }: { version: number }) {
  const [from, setFrom] = useState(`${todayYmd().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayYmd());
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<OrderSort>("newest");

  const load = useCallback(async () => {
    if (!isValidRange(from, to)) return;
    try {
      setData(await finFetch<ReportData>(`/api/finance/report?from=${from}&to=${to}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const orders = useMemo(() => sortReportOrders(data?.orders ?? [], sort), [data, sort]);
  const warnings = data ? reportWarnings(data.totals) : [];
  const losers = data ? lossOrders(data.orders) : 0;
  const maxCat = Math.max(1, ...(data?.by_category.map((c) => c.amount) ?? [1]));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className={toolbarCls}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
          <FilterField label="Dari">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={filterInputCls} />
          </FilterField>
          <FilterField label="Sampai">
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={filterInputCls} />
          </FilterField>
          <div className="col-span-2 sm:col-span-1 flex gap-2 sm:ml-auto">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  const r = datePreset(p.id);
                  setFrom(r.from);
                  setTo(r.to);
                }}
                className={smallGhostBtnCls}
              >
                {p.label}
              </button>
            ))}
            <ExportButton
              scope={`Laporan ${from} s/d ${to}`}
              build={() =>
                data
                  ? { filename: exportFileName(`Laporan ${data.period.from} sd ${data.period.to}`, todayYmd()), sheets: reportSheets(data), rowCount: data.months.length + data.orders.length }
                  : null
              }
              disabled={!data}
            />
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          Laba = nilai tagihan pesanan yang masuk pada periode − pengeluaran yang disetujui. Ini perkiraan manajemen dari
          data yang tercatat, bukan pembukuan resmi. Rentang maksimal 60 bulan.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!data && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {data && (
        <>
          {warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-px" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{w}</p>
            </div>
          ))}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <SummaryCard label="Pendapatan (tagihan)" value={formatRupiah(data.totals.revenue)}
              icon={<TrendingUp className="w-5 h-5 text-[#124540] dark:text-[#49bfb4]" />} color="bg-[#124540]/10 dark:bg-[#49bfb4]/10" />
            <SummaryCard label="Biaya (disetujui)" value={formatRupiah(data.totals.expenses)}
              icon={<ArrowUpFromLine className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/30" />
            <SummaryCard label="Laba (perkiraan)" value={formatRupiah(data.totals.profit)}
              hint={`margin ${pct(data.totals.profit, data.totals.revenue)}`}
              icon={<TrendingUp className={`w-5 h-5 ${data.totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}`} />}
              color={data.totals.profit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"} />
            <SummaryCard label="Tagihan belum terbayar" value={formatRupiah(data.totals.unpaid_billed)} hint="dari pesanan pada periode ini"
              icon={<Hourglass className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/30" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <SummaryCard label="Kas masuk" value={formatRupiah(data.totals.cash_in)} hint="bersih refund"
              icon={<Wallet className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/30" />
            <SummaryCard label="Kas keluar" value={formatRupiah(data.totals.cash_out)}
              icon={<ArrowUpFromLine className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/30" />
            <SummaryCard label="Arus kas bersih" value={formatRupiah(data.totals.cash_net)}
              icon={<Wallet className={`w-5 h-5 ${data.totals.cash_net >= 0 ? "text-emerald-600" : "text-red-600"}`} />}
              color={data.totals.cash_net >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"} />
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <p className={sectionLabelCls}>Per bulan</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                  <tr>
                    {["Bulan", "Pendapatan", "Biaya", "Laba", "Kas masuk", "Kas keluar", "Kas bersih"].map((h, i) => (
                      <th key={h} className={`text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono tabular-nums">
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-3 py-2 font-sans font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{monthLabel(m.month)}</td>
                      <td className="px-3 py-2 text-right">{formatRupiah(m.revenue)}</td>
                      <td className="px-3 py-2 text-right">{formatRupiah(m.expenses)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${m.profit < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{formatRupiah(m.profit)}</td>
                      <td className="px-3 py-2 text-right">{formatRupiah(m.cash_in)}</td>
                      <td className="px-3 py-2 text-right">{formatRupiah(m.cash_out)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${m.cash_net < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{formatRupiah(m.cash_net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.by_category.length > 0 && (
            <div className={`${cardCls} p-4 md:p-5`}>
              <p className={`${sectionLabelCls} mb-3`}>Biaya per kategori</p>
              <div className="space-y-3">
                {data.by_category.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                      <span className="truncate pr-2">{c.name} <span className="text-zinc-400">({pct(c.amount, data.totals.expenses)})</span></span>
                      <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{formatRupiah(c.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                      <div className="h-full bg-[#124540] dark:bg-[#49bfb4]" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 md:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className={sectionLabelCls}>Laba kotor per pesanan</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {data.orders_total} pesanan ditagih pada periode
                  {data.orders_total > data.orders.length ? ` · menampilkan ${data.orders.length} terbaru` : ""}
                  {losers > 0 ? ` · ${losers} merugi` : ""}
                </p>
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value as OrderSort)} className={`${filterInputCls} !h-9 !min-w-0`} aria-label="Urutkan pesanan">
                <option value="newest">Terbaru</option>
                <option value="lowest">Laba kotor terendah</option>
                <option value="highest">Laba kotor tertinggi</option>
              </select>
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-10">Tidak ada pesanan ditagih pada periode ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["Pesanan", "Tagihan", "Terbayar", "Biaya langsung", "Laba kotor", "Margin"].map((h, i) => (
                        <th key={h} className={`text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono tabular-nums">
                    {orders.map((o) => (
                      <tr key={o.order_id}>
                        <td className="px-3 py-2 font-sans">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{o.kode_produksi}</p>
                          <p className="text-[10px] text-zinc-400 truncate max-w-[14rem]">{o.nama_pemesan}</p>
                        </td>
                        <td className="px-3 py-2 text-right">{formatRupiah(o.total)}</td>
                        <td className="px-3 py-2 text-right">{formatRupiah(o.paid)}</td>
                        <td className="px-3 py-2 text-right">{formatRupiah(o.direct_cost)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${o.gross < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{formatRupiah(o.gross)}</td>
                        <td className="px-3 py-2 text-right text-zinc-500">{pct(o.gross, o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-zinc-400 px-4 md:px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
              Biaya langsung = semua pengeluaran disetujui yang ditautkan ke pesanan itu (seluruh waktu, bukan hanya periode ini).
              Biaya umum yang tidak ditautkan tidak ikut dihitung di sini.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
