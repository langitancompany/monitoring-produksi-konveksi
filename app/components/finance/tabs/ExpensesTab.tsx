// app/components/finance/tabs/ExpensesTab.tsx
//
// Buku pengeluaran: catat, setujui/tolak/void, filter status/kategori/periode. Antrean "Menunggu persetujuan"
// tidak dibatasi tanggal (yang menunggu harus selalu terlihat) dan diurutkan dari yang paling lama menunggu.
// Hak: lihat = keuangan.view, catat = create, setujui/tolak = edit, void = delete (dihitung server, meta.caps).
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpFromLine, Hourglass, Plus } from "lucide-react";
import { finFetch, errMsg, useVendors } from "@/hooks/useFinanceApi";
import { EXPENSE_STATE_LABEL, type ExpenseRow as Row, type ExpenseStatus, type FinanceMeta } from "@/lib/finance/types";
import { expensesByCategory, expenseTotals } from "@/lib/finance/view";
import { ExpenseRow } from "../ExpenseRow";
import { useExpenseActions } from "../ExpenseActions";
import RecordExpenseModal from "../RecordExpenseModal";
import { FilterField, filterInputCls, toolbarCls, cardCls, sectionLabelCls, PrimaryButton } from "../ui";
import { formatRupiah, monthStartYmd, todayYmd } from "../utils";

export default function ExpensesTab({
  meta,
  version,
  onChanged,
}: {
  meta: FinanceMeta;
  version: number;
  onChanged: () => void;
}) {
  const caps = meta.caps;
  const { vendors, addVendor } = useVendors();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | ExpenseStatus>("");
  const [categoryId, setCategoryId] = useState("");
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());
  const [showRecord, setShowRecord] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (categoryId) p.set("category_id", categoryId);
    // Antrean persetujuan tidak dibatasi tanggal: yang menunggu harus selalu terlihat.
    if (status !== "pending") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    try {
      const list = (await finFetch<{ rows: Row[] }>(`/api/finance/expenses?${p}`)).rows;
      setRows(status === "pending" ? [...list].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)) : list);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [status, categoryId, from, to]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const changed = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);
  const actions = useExpenseActions(changed);

  const totals = useMemo(() => expenseTotals(rows ?? []), [rows]);
  const byCat = useMemo(() => expensesByCategory(rows ?? []), [rows]);
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v));

  return (
    <div className="space-y-4 md:space-y-5">
      <div className={toolbarCls}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 md:gap-4">
          <FilterField label="Status" className="col-span-2 sm:col-span-1">
            <select value={status} onChange={(e) => setStatus(e.target.value as "" | ExpenseStatus)} className={filterInputCls}>
              <option value="">Semua</option>
              {(Object.keys(EXPENSE_STATE_LABEL) as ExpenseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EXPENSE_STATE_LABEL[s]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Kategori" className="col-span-2 sm:col-span-1">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={filterInputCls}>
              <option value="">Semua kategori</option>
              {meta.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Dari">
            <input
              type="date"
              value={from}
              max={to}
              disabled={status === "pending"}
              onChange={(e) => setFrom(e.target.value)}
              className={filterInputCls}
            />
          </FilterField>
          <FilterField label="Sampai">
            <input
              type="date"
              value={to}
              min={from}
              disabled={status === "pending"}
              onChange={(e) => setTo(e.target.value)}
              className={filterInputCls}
            />
          </FilterField>
          {caps.create && (
            <div className="col-span-2 sm:col-span-1 sm:ml-auto">
              <PrimaryButton onClick={() => setShowRecord(true)} className="w-full sm:w-auto h-10">
                <Plus className="w-4 h-4" /> Catat pengeluaran
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}

      {rows && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <div className={`${cardCls} p-4 flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                <ArrowUpFromLine className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className={sectionLabelCls}>Pengeluaran disetujui</p>
                <p className="text-base font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 truncate">
                  {formatRupiah(totals.approved)}
                </p>
              </div>
            </div>
            <div className={`${cardCls} p-4 flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                <Hourglass className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className={sectionLabelCls}>Menunggu persetujuan ({totals.pendingCount})</p>
                <p className="text-base font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 truncate">
                  {formatRupiah(totals.pending)}
                </p>
              </div>
            </div>
            {byCat.length > 0 && (
              <div className={`${cardCls} p-4 sm:col-span-2 lg:col-span-1`}>
                <p className={`${sectionLabelCls} mb-3`}>Per kategori (disetujui)</p>
                <div className="space-y-2">
                  {byCat.map(([name, v]) => (
                    <div key={name}>
                      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                        <span className="truncate pr-2">{name}</span>
                        <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{formatRupiah(v)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                        <div className="h-full bg-[#124540] dark:bg-[#49bfb4]" style={{ width: `${(v / maxCat) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{rows.length}</span> pengeluaran
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
              {status === "pending" ? "Tidak ada pengeluaran yang menunggu persetujuan." : "Tidak ada pengeluaran pada filter ini."}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {rows.map((x) => (
                <ExpenseRow key={x.id} x={x} caps={caps} actions={actions} />
              ))}
            </div>
          )}
          {rows.length >= 1000 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Menampilkan 1000 pengeluaran terbaru. Persempit rentang tanggal untuk melihat yang lain.
            </p>
          )}
        </>
      )}

      {actions.node}
      {showRecord && (
        <RecordExpenseModal
          meta={meta}
          vendors={vendors}
          onVendorAdded={addVendor}
          onClose={() => setShowRecord(false)}
          onDone={changed}
        />
      )}
    </div>
  );
}
