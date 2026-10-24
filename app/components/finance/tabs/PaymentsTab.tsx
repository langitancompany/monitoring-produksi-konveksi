// app/components/finance/tabs/PaymentsTab.tsx
//
// mode "all"     = buku transaksi (semua status, filter tanggal).
// mode "pending" = antrean verifikasi (hanya yang menunggu; hanya untuk pemegang keuangan.edit).
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinCaps } from "@/lib/finance/caps";
import { PAYMENT_STATE_LABEL, type PaymentRow as Row, type PaymentStatus } from "@/lib/finance/types";
import { netVerified } from "@/lib/finance/view";
import { PaymentRow } from "../PaymentRow";
import { usePaymentActions } from "../PaymentActions";
import { FilterField, filterInputCls, toolbarCls } from "../ui";
import ExportButton from "../ExportButton";
import { exportFileName, paymentsSheet } from "@/lib/finance/excel";
import { formatRupiah, monthStartYmd, todayYmd } from "../utils";

export default function PaymentsTab({
  mode,
  caps,
  version,
  onChanged,
}: {
  mode: "all" | "pending";
  caps: FinCaps;
  version: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | PaymentStatus>("");
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (mode === "pending") p.set("status", "pending");
    else {
      if (status) p.set("status", status);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    try {
      const list = (await finFetch<{ rows: Row[] }>(`/api/finance/payments?${p}`)).rows;
      // Antrean verifikasi: yang paling lama menunggu di atas (buku transaksi: terbaru di atas).
      setRows(mode === "pending" ? [...list].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)) : list);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [mode, status, from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const changed = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);
  const actions = usePaymentActions(changed);

  return (
    <div className="space-y-4 md:space-y-5">
      {mode === "all" && (
        <div className={toolbarCls}>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
            <FilterField label="Status" className="col-span-2 sm:col-span-1">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "" | PaymentStatus)}
                className={filterInputCls}
              >
                <option value="">Semua</option>
                {(Object.keys(PAYMENT_STATE_LABEL) as PaymentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PAYMENT_STATE_LABEL[s]}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Dari">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={filterInputCls} />
            </FilterField>
            <FilterField label="Sampai">
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={filterInputCls} />
            </FilterField>
            <div className="col-span-2 sm:col-span-1 sm:ml-auto">
              <ExportButton
                scope="Pembayaran"
                build={() => ({
                  filename: exportFileName("Pembayaran", todayYmd()),
                  sheets: [paymentsSheet(rows ?? [])],
                  rowCount: rows?.length ?? 0,
                })}
                disabled={!rows}
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {rows && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{rows.length}</span> transaksi
            {mode === "all" && (
              <>
                {" "}
                · kas masuk terverifikasi{" "}
                <b className="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  {formatRupiah(netVerified(rows))}
                </b>
              </>
            )}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
              {mode === "pending"
                ? "Tidak ada pembayaran yang menunggu verifikasi."
                : "Tidak ada transaksi pada filter ini."}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {rows.map((p) => (
                <PaymentRow key={p.id} p={p} caps={caps} actions={actions} showOrder />
              ))}
            </div>
          )}
          {rows.length >= 1000 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Menampilkan 1000 transaksi terbaru. Persempit rentang tanggal untuk melihat yang lain.
            </p>
          )}
        </>
      )}
      {actions.node}
    </div>
  );
}
