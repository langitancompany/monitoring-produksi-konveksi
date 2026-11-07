// app/pengeluaran/page.tsx
//
// Aplikasi terpisah "Catat Pengeluaran" (dipasang ke layar utama lewat manifest sendiri).
// Hanya: login → catat pengeluaran → daftar pengeluaran SAYA. Tidak ada menu Keuangan, tagihan, atau laporan.
// Hak akses dicek server (/api/pengeluaran/*): izin modul `catat_pengeluaran` atau Maker Keuangan.
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, Paperclip, Plus, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import LoginScreen from "@/app/components/auth/LoginScreen";
import ThemedLogo from "@/app/components/ui/ThemedLogo";
import { useDialog } from "@/app/components/ui/DialogProvider";
import RecordExpenseModal, { type ExpenseFormApi, type ExpenseFormMeta } from "@/app/components/finance/RecordExpenseModal";
import { ExpenseStatusBadge } from "@/app/components/finance/StatusBadge";
import { PrimaryButton, GhostButton, cardCls, sectionLabelCls } from "@/app/components/finance/ui";
import { formatDateShort, formatRupiah } from "@/app/components/finance/utils";
import { finFetch, errMsg, useVendors, FinanceApiError } from "@/hooks/useFinanceApi";
import type { ExpenseRow } from "@/lib/finance/types";

const API: ExpenseFormApi = {
  expenses: "/api/pengeluaran/expenses",
  vendors: "/api/pengeluaran/vendors",
  orderLookup: "/api/pengeluaran/order-lookup",
};

type EntryMeta = ExpenseFormMeta & { user_name: string };
type Phase = "loading" | "login" | "denied" | "error" | "ready";

export default function PengeluaranPage() {
  const supabase = useMemo(() => createClient(), []);
  const { confirmAsync } = useDialog();

  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<EntryMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { vendors, addVendor } = useVendors(API.vendors);

  const loadRows = useCallback(async () => {
    try {
      setRows((await finFetch<{ rows: ExpenseRow[] }>(API.expenses)).rows);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  // 1) sesi login  2) izin + data form dari server  3) daftar milik sendiri
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return setPhase("login");
      try {
        const m = await finFetch<EntryMeta>("/api/pengeluaran/meta");
        if (cancelled) return;
        setMeta(m);
        setPhase("ready");
        void loadRows();
      } catch (e) {
        if (cancelled) return;
        if (e instanceof FinanceApiError && e.status === 401) return setPhase("login");
        if (e instanceof FinanceApiError && e.status === 403) return setPhase("denied");
        setError(errMsg(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, loadRows]);

  const logout = async () => {
    if (!(await confirmAsync("Keluar dari aplikasi?"))) return;
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-10 h-10 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (phase === "login") return <LoginScreen />;

  if (phase === "denied" || phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <div className={`${cardCls} max-w-sm w-full p-6 text-center space-y-4`}>
          <ThemedLogo className="h-8 mx-auto" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {phase === "denied" ? "Akun ini belum punya akses Catat Pengeluaran" : "Gagal memuat"}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {phase === "denied" ? "Minta admin mengaktifkan izin \"Catat Pengeluaran\" untuk akun Anda." : error}
          </p>
          <GhostButton onClick={logout} className="w-full">
            Keluar
          </GhostButton>
        </div>
      </div>
    );
  }

  // Ringkasan hari ini (tanpa pengeluaran yang ditolak / dibatalkan)
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayTotal = (rows ?? [])
    .filter((r) => r.spent_at === ymd && r.status !== "rejected" && r.status !== "void")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ThemedLogo className="h-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Catat Pengeluaran</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate leading-tight">{meta?.user_name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Keluar"
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-5" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <PrimaryButton onClick={() => setShowForm(true)} className="w-full !py-3.5 !text-base">
          <Plus className="w-5 h-5" /> Catat pengeluaran baru
        </PrimaryButton>

        <div className={`${cardCls} p-4 flex items-center justify-between`}>
          <div>
            <p className={sectionLabelCls}>Tercatat hari ini</p>
            <p className="text-lg font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
              {formatRupiah(todayTotal)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRows()}
            aria-label="Muat ulang"
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-150"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <section className="space-y-2">
          <p className={sectionLabelCls}>Pengeluaran saya</p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {rows === null && !error && <p className="text-xs text-zinc-500">Memuat…</p>}
          {rows?.length === 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 py-6 text-center">Belum ada pengeluaran yang Anda catat.</p>
          )}
          {rows?.map((x) => {
            const dim = x.status === "void" || x.status === "rejected";
            return (
              <div key={x.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{x.description}</p>
                    <p
                      className={`text-sm font-semibold font-mono tabular-nums mt-0.5 ${
                        dim ? "line-through text-zinc-400" : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {formatRupiah(x.amount)}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {x.category_name ?? "-"}
                      {x.vendor_name ? ` · ${x.vendor_name}` : ""} · {formatDateShort(x.spent_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <ExpenseStatusBadge status={x.status} />
                    {x.has_proof && <Paperclip className="w-3.5 h-3.5 text-zinc-400" aria-label="Ada bukti" />}
                  </div>
                </div>
                {x.status === "rejected" && x.reject_reason && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-2">Ditolak: {x.reject_reason}</p>
                )}
              </div>
            );
          })}
        </section>
      </main>

      {showForm && meta && (
        <RecordExpenseModal
          meta={meta}
          vendors={vendors}
          onVendorAdded={addVendor}
          api={API}
          canAddVendor
          onClose={() => setShowForm(false)}
          onDone={() => void loadRows()}
        />
      )}
    </div>
  );
}
