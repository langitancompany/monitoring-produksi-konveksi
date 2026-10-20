// app/components/finance/tabs/InvoicesTab.tsx
//
// Daftar posisi keuangan semua pesanan (tagihan · terbayar · sisa · status). Status dihitung database
// (view v_order_finance). Dari sini: lihat rincian (modal OrderFinancePanel), terbitkan tagihan,
// atau catat pembayaran. Ekspor Excel & invoice cetak menyusul di langkah 6.7.
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinanceMeta, OrderFinanceRow } from "@/lib/finance/types";
import { INVOICE_FILTERS, countByFilter, filterFinanceRows, isOverdue, totalsOf, type InvoiceFilter } from "@/lib/finance/view";
import type { ProductionTypeData } from "@/types/order";
import { usePagedList } from "@/hooks/usePagedList";
import { StatusBadge } from "../StatusBadge";
import OrderFinancePanel from "../OrderFinancePanel";
import RecordPaymentModal from "../RecordPaymentModal";
import { ModalShell, SearchInput, sectionLabelCls, smallGhostBtnCls, smallPrimaryBtnCls, toolbarCls } from "../ui";
import { formatDateShort, formatRupiah } from "../utils";

export default function InvoicesTab({
  meta,
  productionTypes,
  version,
  onChanged,
}: {
  meta: FinanceMeta;
  productionTypes: ProductionTypeData[];
  version: number;
  onChanged: () => void;
}) {
  const caps = meta.caps;
  const [rows, setRows] = useState<OrderFinanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("Semua");
  /** pesanan yang rinciannya dibuka; `issue` = langsung buka form tagihan */
  const [detail, setDetail] = useState<{ id: string; issue: boolean } | null>(null);
  const [recordRow, setRecordRow] = useState<OrderFinanceRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await finFetch<{ rows: OrderFinanceRow[] }>("/api/finance/invoices")).rows);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const filtered = useMemo(() => filterFinanceRows(rows ?? [], q, filter), [rows, q, filter]);
  const counts = useMemo(() => countByFilter(rows ?? []), [rows]);
  const totals = useMemo(() => totalsOf(filtered), [filtered]);
  const paged = usePagedList(filtered, 30, `${filter}|${q}`);

  return (
    <div className="space-y-4 md:space-y-5">
      <div className={`${toolbarCls} space-y-4`}>
        <SearchInput value={q} onChange={setQ} placeholder="Cari kode produksi / pemesan…" />
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {INVOICE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors duration-150 ${
                filter === f
                  ? "bg-[#124540] text-white border-[#124540]"
                  : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
            >
              {f}
              <span className="ml-1.5 text-[10px] opacity-70 font-mono tabular-nums">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {rows && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{filtered.length}</span> pesanan · tagihan{" "}
            <b className="text-zinc-900 dark:text-zinc-100 font-mono tabular-nums">{formatRupiah(totals.total)}</b> ·
            terbayar{" "}
            <b className="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{formatRupiah(totals.paid)}</b> ·
            sisa <b className="text-red-600 dark:text-red-400 font-mono tabular-nums">{formatRupiah(totals.balance)}</b>
            {totals.pending > 0 && (
              <>
                {" "}
                · menunggu verifikasi{" "}
                <b className="text-amber-600 dark:text-amber-400 font-mono tabular-nums">{formatRupiah(totals.pending)}</b>
              </>
            )}
          </p>

          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">Tidak ada data.</p>
          ) : (
            <ul className="space-y-2 md:space-y-3">
              {paged.visible.map((r) => {
                const overdue = isOverdue(r);
                const canPay = caps.create && !!r.invoice_id && r.balance - r.paid_pending > 0;
                return (
                  <li
                    key={r.order_id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 sm:p-4 flex flex-col md:flex-row md:items-center gap-3"
                  >
                    <div className="min-w-0 md:w-1/3">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{r.kode_produksi}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {r.nama_pemesan} · {r.jumlah} pcs
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Masuk {formatDateShort(r.tanggal_masuk)}
                        {r.invoice_id && r.due_date && r.balance > 0 ? ` · jatuh tempo ${formatDateShort(r.due_date)}` : ""}
                      </p>
                      {overdue && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" /> Lewat jatuh tempo
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-right md:flex-1">
                      {(
                        [
                          ["Tagihan", r.total, "text-zinc-900 dark:text-zinc-100"],
                          ["Terbayar", r.paid_verified, "text-emerald-600 dark:text-emerald-400"],
                          ["Sisa", r.balance, r.balance > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-400 dark:text-zinc-500"],
                        ] as const
                      ).map(([l, v, c]) => (
                        <div key={l}>
                          <p className={sectionLabelCls}>{l}</p>
                          <p className={`text-xs font-semibold font-mono tabular-nums ${c}`}>{formatRupiah(v)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <StatusBadge status={r.payment_status} />
                      <button onClick={() => setDetail({ id: r.order_id, issue: false })} className={smallGhostBtnCls}>
                        Rincian
                      </button>
                      {caps.create && !r.invoice_id && (
                        <button onClick={() => setDetail({ id: r.order_id, issue: true })} className={smallPrimaryBtnCls}>
                          Terbitkan
                        </button>
                      )}
                      {canPay && (
                        <button onClick={() => setRecordRow(r)} className={smallPrimaryBtnCls}>
                          Catat bayar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {paged.hasMore && (
            <button
              onClick={paged.showMore}
              className="w-full text-xs font-semibold py-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              Tampilkan lebih banyak ({paged.remaining} lagi)
            </button>
          )}
        </>
      )}

      {detail && (
        <ModalShell title="Rincian keuangan pesanan" onClose={() => setDetail(null)} wide>
          <OrderFinancePanel
            orderId={detail.id}
            meta={meta}
            productionTypes={productionTypes}
            version={version}
            onChanged={onChanged}
            autoOpenInvoice={detail.issue}
          />
        </ModalShell>
      )}
      {recordRow && (
        <RecordPaymentModal target={recordRow} meta={meta} onClose={() => setRecordRow(null)} onDone={onChanged} />
      )}
    </div>
  );
}
