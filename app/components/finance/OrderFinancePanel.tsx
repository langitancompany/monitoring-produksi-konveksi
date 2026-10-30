// app/components/finance/OrderFinancePanel.tsx
//
// Posisi keuangan SATU pesanan: tagihan (rincian item), terbayar, sisa, riwayat pembayaran, dan
// tombol terbit/revisi tagihan + catat pembayaran. Dipakai di tab Tagihan (dalam modal) dan di
// Detail Pesanan. Semua angka berasal dari server; komponen ini tidak menghitung uang sendiri.
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus, History, Send } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinanceMeta, OrderFinanceDetail } from "@/lib/finance/types";
import type { ProductionTypeData } from "@/types/order";
import { StatusBadge } from "./StatusBadge";
import { PaymentRow } from "./PaymentRow";
import { usePaymentActions } from "./PaymentActions";
import RecordPaymentModal from "./RecordPaymentModal";
import InvoiceModal from "./InvoiceModal";
import InvoiceShareModal from "./InvoiceShareModal";
import { sectionLabelCls, smallPrimaryBtnCls } from "./ui";
import { formatDateShort, formatDateTime, formatRupiah } from "./utils";

export default function OrderFinancePanel({
  orderId,
  meta,
  productionTypes,
  version = 0,
  onChanged,
  autoOpenInvoice = false,
}: {
  orderId: string;
  meta: FinanceMeta;
  productionTypes: ProductionTypeData[];
  /** naikkan angkanya untuk memuat ulang dari luar */
  version?: number;
  onChanged?: () => void;
  /** buka form tagihan otomatis setelah data termuat (dari tombol "Terbitkan" di daftar) */
  autoOpenInvoice?: boolean;
}) {
  const caps = meta.caps;
  const [detail, setDetail] = useState<OrderFinanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showInvoiceDoc, setShowInvoiceDoc] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const autoOpened = useRef(false);

  const load = useCallback(async () => {
    try {
      setDetail(await finFetch<OrderFinanceDetail>(`/api/finance/orders/${orderId}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    if (autoOpenInvoice && detail && caps.maker && !autoOpened.current) {
      autoOpened.current = true;
      setShowInvoice(true);
    }
  }, [autoOpenInvoice, detail, caps.maker]);

  const changed = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  const actions = usePaymentActions(changed);

  if (error) return <p className="text-xs text-red-600 dark:text-red-400 p-4">{error}</p>;
  if (!detail) return <p className="text-xs text-zinc-400 p-4">Memuat data keuangan…</p>;

  const f = detail.finance;
  const active = detail.invoices.find((i) => i.status === "active") ?? null;
  const hasInvoice = !!f.invoice_id;
  const progress = f.total > 0 ? Math.min(100, Math.round((f.paid_verified / f.total) * 100)) : 0;

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={sectionLabelCls}>Harga &amp; Pembayaran</h3>
          {hasInvoice && (
            <p className="text-[11px] text-zinc-400">
              Tagihan v{f.invoice_version}
              {f.due_date ? ` · jatuh tempo ${formatDateShort(f.due_date)}` : ""}
            </p>
          )}
        </div>
        <StatusBadge status={f.payment_status} />
      </div>

      {detail.invoice_stale && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md px-3 py-2">
          Rincian item pesanan berubah sejak tagihan terbit, jadi tagihan ini mungkin tidak sesuai lagi.
          {caps.maker ? " Terbitkan revisi tagihan." : " Minta bagian keuangan merevisinya."}
        </p>
      )}

      {hasInvoice ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Tagihan", f.total, "text-zinc-900 dark:text-zinc-100"],
              ["Terbayar", f.paid_verified, "text-emerald-600 dark:text-emerald-400"],
              [
                f.overpaid > 0 ? "Lebih bayar" : "Sisa",
                f.overpaid > 0 ? f.overpaid : f.balance,
                f.balance > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500",
              ],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-md bg-zinc-50 dark:bg-zinc-900 py-2.5">
                <p className={sectionLabelCls}>{l}</p>
                <p className={`text-sm font-semibold font-mono tabular-nums ${c}`}>{formatRupiah(v as number)}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-[#124540] dark:bg-[#49bfb4] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {f.paid_pending > 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                {formatRupiah(f.paid_pending)} menunggu verifikasi (belum dihitung sebagai terbayar)
              </p>
            )}
          </div>

          {active && (
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                {active.pricing_snapshot.map((l) => (
                  <li key={l.item_id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0 text-zinc-700 dark:text-zinc-200">
                      {l.nama}
                      <span className="block text-[10px] text-zinc-400 font-mono tabular-nums">
                        {l.jumlah} pcs × {formatRupiah(l.harga_per_pcs)}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">{formatRupiah(l.subtotal)}</span>
                  </li>
                ))}
                {active.discount > 0 && (
                  <li className="px-3 py-2 flex justify-between text-zinc-500">
                    <span>Diskon</span>
                    <span className="font-mono tabular-nums">− {formatRupiah(active.discount)}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pesanan ini belum ditagih.{" "}
          {caps.maker ? "Terbitkan tagihan untuk mulai mencatat pembayaran." : "Hubungi bagian keuangan."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {caps.maker && (
          <button
            onClick={() => setShowInvoice(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
          >
            <FileText className="w-3.5 h-3.5" />
            {hasInvoice ? "Revisi tagihan" : "Terbitkan tagihan"}
          </button>
        )}
        {caps.maker && hasInvoice && (
          <button
            onClick={() => setShowRecord(true)}
            className={`${smallPrimaryBtnCls} !text-xs !px-3 !py-2 !gap-1.5`}
          >
            <Plus className="w-3.5 h-3.5" /> Catat pembayaran
          </button>
        )}
        {hasInvoice && (
          <button
            onClick={() => setShowInvoiceDoc(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
          >
            <Send className="w-3.5 h-3.5" /> Invoice pelanggan
          </button>
        )}
        {detail.invoices.length > 1 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 ml-auto"
          >
            <History className="w-3.5 h-3.5" /> Riwayat tagihan ({detail.invoices.length})
          </button>
        )}
      </div>

      {showHistory && (
        <ul className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
          {detail.invoices.map((i) => (
            <li key={i.id} className="px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  v{i.version}{" "}
                  {i.status === "active" && <span className="text-emerald-600 dark:text-emerald-400 font-normal">· aktif</span>}
                </p>
                <p className="text-[10px] text-zinc-400">
                  {i.issued_by_name ?? "-"} · {formatDateTime(i.issued_at)}
                  {i.reason ? ` · ${i.reason}` : ""}
                </p>
              </div>
              <span className="font-mono tabular-nums font-semibold text-zinc-600 dark:text-zinc-300">
                {formatRupiah(i.total)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {detail.payments.length > 0 && (
        <div className="space-y-2">
          <p className={sectionLabelCls}>Riwayat pembayaran</p>
          {detail.payments.map((p) => (
            <PaymentRow key={p.id} p={p} caps={caps} actions={actions} />
          ))}
        </div>
      )}

      {actions.node}
      {showRecord && hasInvoice && (
        <RecordPaymentModal target={f} meta={meta} onClose={() => setShowRecord(false)} onDone={changed} />
      )}
      {showInvoiceDoc && <InvoiceShareModal orderId={detail.order.id} onClose={() => setShowInvoiceDoc(false)} />}
      {showInvoice && (
        <InvoiceModal
          detail={detail}
          productionTypes={productionTypes}
          onClose={() => setShowInvoice(false)}
          onDone={changed}
        />
      )}
    </section>
  );
}
