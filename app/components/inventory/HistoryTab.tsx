// app/components/inventory/HistoryTab.tsx
// Tab Riwayat: pergerakan stok terbaru di atas (tanggal, barang, jumlah +/-, sumber, petugas, alasan).
// Pergerakan yang jumlahnya berbeda dari hasil produksi diberi penanda. (PRD-inventori §10.3)
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { invFetch, errMsg } from "@/hooks/useInventoryApi";
import type { MovementRow } from "@/lib/inventory/types";
import { skuLabel } from "@/lib/inventory/sku";
import { ADJUST_LABEL } from "@/lib/inventory/validate";
import { formatDateTime } from "@/lib/utils";
import { cardCls, filterInputCls, FilterField, SearchInput, sectionLabelCls, toolbarCls } from "@/app/components/finance/ui";
import { lg, tapCls } from "./responsive";

interface Props {
  version: number;
  /** filter barang tertentu (datang dari tab Stok) */
  sku: string | null;
  onClearSku: () => void;
  onOpenOrder?: (orderId: string) => void;
}

const PAGE = 100;
const MAX = 300;

export default function HistoryTab({ version, sku, onClearSku, onOpenOrder }: Props) {
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: String(limit) });
    if (sku) params.set("sku", sku);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    invFetch<{ movements: MovementRow[] }>(`/api/inventori/movements?${params.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setRows(r.movements);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errMsg(e)));
    return () => {
      cancelled = true;
    };
  }, [version, sku, from, to, limit]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows ?? [];
    return (rows ?? []).filter((m) => `${m.kode_produksi ?? ""} ${m.kind === "masuk" ? "" : ADJUST_LABEL[m.kind]} ${skuLabel(m)} ${m.by_name ?? ""}`.toLowerCase().includes(t));
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className={toolbarCls}>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <FilterField label="Cari" className="flex-1">
            <SearchInput value={q} onChange={setQ} placeholder="Kode produksi, jenis, barang, atau petugas" className="!h-11 !text-base sm:!h-10 sm:!text-sm" />
          </FilterField>
          <FilterField label="Dari tanggal">
            <input type="date" className={`${filterInputCls} !h-11 !text-base sm:!h-10 sm:!text-sm`} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setLimit(PAGE); }} />
          </FilterField>
          <FilterField label="Sampai tanggal">
            <input type="date" className={`${filterInputCls} !h-11 !text-base sm:!h-10 sm:!text-sm`} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setLimit(PAGE); }} />
          </FilterField>
        </div>
        {sku && (
          <button
            type="button"
            onClick={onClearSku}
            className="mt-3 inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 max-w-full text-xs font-semibold px-3 sm:px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
          >
            Barang: <span className="font-mono truncate">{sku.replace(/\|/g, " · ").replace(/( · )+$/, "")}</span> <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
      )}
      {!rows && !error && (
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat…
        </p>
      )}
      {rows && shown.length === 0 && (
        <div className={`${cardCls} px-6 py-12 text-center`}>
          <History className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Belum ada pergerakan stok</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Verifikasi dan penyesuaian stok tercatat di sini.</p>
        </div>
      )}

      {shown.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <table className={lg.table}>
            <thead className={lg.head}>
              <tr className="text-left bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <th className={`${sectionLabelCls} px-4 py-2.5`}>Tanggal</th>
                <th className={`${sectionLabelCls} px-4 py-2.5`}>Barang</th>
                <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Jumlah</th>
                <th className={`${sectionLabelCls} px-4 py-2.5`}>Sumber</th>
                <th className={`${sectionLabelCls} px-4 py-2.5`}>Petugas</th>
                <th className={`${sectionLabelCls} px-4 py-2.5`}>Keterangan</th>
              </tr>
            </thead>
            <tbody className={lg.body}>
              {shown.map((m) => (
                <tr key={m.id} className={`${lg.row} align-top`}>
                  <td className={`${lg.cell} max-lg:order-1 text-xs text-zinc-600 dark:text-zinc-300 lg:whitespace-nowrap`}>{formatDateTime(m.created_at)}</td>
                  <td className={`${lg.cell} max-lg:order-3 max-lg:col-span-full text-zinc-800 dark:text-zinc-200`}>{skuLabel(m)}</td>
                  <td className={`${lg.cell} max-lg:order-2 text-right max-lg:text-lg lg:font-semibold font-semibold tabular-nums ${m.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {m.delta > 0 ? "+" : "−"}{Math.abs(m.delta).toLocaleString("id-ID")}
                  </td>
                  <td data-label="Sumber" className={`${lg.cell} ${lg.caption} max-lg:order-4`}>
                    {m.kind !== "masuk" ? (
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{ADJUST_LABEL[m.kind]}</span>
                    ) : onOpenOrder && m.order_id ? (
                      <button type="button" onClick={() => onOpenOrder(m.order_id!)} className={`${tapCls} max-w-full break-all text-left font-mono tabular-nums text-xs text-[#124540] dark:text-[#49BFB4] hover:underline`}>
                        {m.kode_produksi}
                      </button>
                    ) : (
                      <span className="font-mono tabular-nums text-xs text-zinc-600 dark:text-zinc-300 break-all">{m.kode_produksi}</span>
                    )}
                  </td>
                  <td data-label="Petugas" className={`${lg.cell} ${lg.caption} max-lg:order-5 text-xs text-zinc-600 dark:text-zinc-300`}>{m.by_name ?? "-"}</td>
                  <td className={`${lg.cell} max-lg:order-6 max-lg:col-span-full text-xs`}>
                    {m.kind !== "masuk" ? (
                      <p className="text-zinc-600 dark:text-zinc-300 break-words">{m.note}</p>
                    ) : m.diff !== null && m.diff !== 0 ? (
                      <div>
                        <span className="inline-block font-semibold px-1.5 py-0.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
                          Selisih {m.diff > 0 ? "+" : "−"}{Math.abs(m.diff).toLocaleString("id-ID")}
                        </span>
                        {m.note && <p className="mt-1 text-zinc-600 dark:text-zinc-300 break-words">{m.note}</p>}
                      </div>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-500">Sesuai hasil produksi</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length >= limit && limit < MAX && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((l) => Math.min(l + PAGE, MAX))} className="px-4 h-11 sm:h-auto sm:py-2 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150">
            Tampilkan lebih banyak
          </button>
        </div>
      )}
    </div>
  );
}
