// app/components/finance/FinanceModule.tsx
//
// Halaman Keuangan. LANGKAH 6.4: tab Tagihan, Transaksi, Verifikasi (hanya yang berhak memverifikasi),
// dan Akun & Pengaturan (hanya baca). LANGKAH 6.5: tab Pengeluaran. LANGKAH 6.6: tab Ringkasan (awal),
// Laporan (berhak menyetujui), Audit (Super Admin), dan Panduan (docs/PRD.md §21). Hak akses dihitung SERVER (meta.caps); di sini hanya untuk
// menampilkan/menyembunyikan tombol — penegakan ada di API dan database.
"use client";

import React, { useCallback, useState } from "react";
import {
  FileText, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Settings, Loader2, RefreshCw,
  LayoutDashboard, BarChart3, ScrollText, BookOpen,
} from "lucide-react";
import { useFinanceMeta } from "@/hooks/useFinanceApi";
import type { ProductionTypeData } from "@/types/order";
import InvoicesTab from "./tabs/InvoicesTab";
import PaymentsTab from "./tabs/PaymentsTab";
import ExpensesTab from "./tabs/ExpensesTab";
import InfoTab from "./tabs/InfoTab";
import OverviewTab from "./tabs/OverviewTab";
import ReportTab from "./tabs/ReportTab";
import AuditTab from "./tabs/AuditTab";
import GuideTab from "./tabs/GuideTab";
import type { GuideTarget } from "@/lib/finance/guideTasks";

type TabId = "overview" | "invoices" | "payments" | "verify" | "expenses" | "report" | "audit" | "guide" | "info";

export default function FinanceModule({ productionTypes }: { productionTypes: ProductionTypeData[] }) {
  const { meta, error, loading, reload } = useFinanceMeta();
  const [tab, setTab] = useState<TabId>("overview");
  // Dibuka dari Ringkasan/Panduan ke antrean pengeluaran: tab dimount ulang (key) dengan filter "Menunggu persetujuan".
  const [expenseNav, setExpenseNav] = useState<{ key: number; pending: boolean }>({ key: 0, pending: false });
  const [version, setVersion] = useState(0);

  // Tiap perubahan data: muat ulang tab aktif + angka antrean verifikasi.
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    void reload();
  }, [reload]);

  if (!meta) {
    return (
      <div className="w-full space-y-3 py-8">
        {error ? (
          <>
            <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
            <button
              onClick={() => void reload()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat Keuangan…
          </p>
        )}
      </div>
    );
  }

  const caps = meta.caps;
  const goTo = (target: GuideTarget, opts?: { pending?: boolean }) => {
    if (target === "expenses") setExpenseNav((n) => ({ key: n.key + 1, pending: !!opts?.pending }));
    setTab(target === "info" ? "info" : target);
  };
  const tabs: { id: TabId; label: string; icon: React.ReactNode; show: boolean; badge?: number }[] = [
    { id: "overview", label: "Ringkasan", icon: <LayoutDashboard size={14} className="shrink-0" />, show: true },
    { id: "invoices", label: "Tagihan", icon: <FileText size={14} className="shrink-0" />, show: true },
    { id: "payments", label: "Transaksi", icon: <ArrowDownToLine size={14} className="shrink-0" />, show: true },
    {
      id: "verify",
      label: "Verifikasi",
      icon: <ShieldCheck size={14} className="shrink-0" />,
      show: caps.approver,
      badge: meta.pending_count,
    },
    {
      id: "expenses",
      label: "Pengeluaran",
      icon: <ArrowUpFromLine size={14} className="shrink-0" />,
      show: true,
      // lencana hanya untuk yang berhak menyetujui
      badge: caps.approver ? meta.pending_expense_count : 0,
    },
    // laporan & audit memuat data manajemen: hanya yang berhak menyetujui (laporan) / Super Admin (audit)
    { id: "report", label: "Laporan", icon: <BarChart3 size={14} className="shrink-0" />, show: caps.approver },
    { id: "audit", label: "Audit", icon: <ScrollText size={14} className="shrink-0" />, show: caps.isSuperAdmin },
    { id: "guide", label: "Panduan", icon: <BookOpen size={14} className="shrink-0" />, show: true },
    { id: "info", label: "Akun & Pengaturan", icon: <Settings size={14} className="shrink-0" />, show: true },
  ];
  const visible = tabs.filter((t) => t.show);
  // Bila hak berubah dan tab aktif tak lagi tampil, kembali ke tab pertama.
  const active: TabId = visible.some((t) => t.id === tab) ? tab : "overview";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = visible.findIndex((t) => t.id === active);
    const next = e.key === "ArrowRight" ? visible[(i + 1) % visible.length] : visible[(i - 1 + visible.length) % visible.length];
    setTab(next.id);
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Keuangan</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Ringkasan, tagihan, pembayaran masuk, pengeluaran, verifikasi, dan laporan. Semua perubahan tercatat di log audit.
          </p>
        </div>
        <button
          onClick={changed}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors duration-150 shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Muat ulang
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Menu keuangan"
        onKeyDown={onKeyDown}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visible.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              id={`fin-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`fin-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors duration-150 ${
                isActive
                  ? "bg-[#124540] text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {t.icon}
              {t.label}
              {!!t.badge && (
                <span
                  className={`text-[10px] font-semibold rounded-full px-1.5 min-w-[18px] text-center ${
                    isActive ? "bg-white text-[#124540]" : "bg-amber-500 text-white"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`fin-panel-${active}`} aria-labelledby={`fin-tab-${active}`}>
        {active === "invoices" && (
          <InvoicesTab meta={meta} productionTypes={productionTypes} version={version} onChanged={changed} />
        )}
        {active === "payments" && <PaymentsTab mode="all" caps={caps} version={version} onChanged={changed} />}
        {active === "verify" && caps.approver && (
          <PaymentsTab mode="pending" caps={caps} version={version} onChanged={changed} />
        )}
        {active === "overview" && (
          <OverviewTab
            version={version}
            canVerify={caps.approver}
            onGoVerify={() => goTo("verify")}
            onGoExpenses={() => goTo("expenses", { pending: true })}
          />
        )}
        {active === "expenses" && (
          <ExpensesTab
            key={expenseNav.key}
            meta={meta}
            version={version}
            onChanged={changed}
            initialStatus={expenseNav.pending ? "pending" : ""}
          />
        )}
        {active === "report" && caps.approver && <ReportTab version={version} />}
        {active === "audit" && caps.isSuperAdmin && <AuditTab version={version} />}
        {active === "guide" && <GuideTab caps={caps} version={version} userKey={meta.user_id} onGo={goTo} />}
        {active === "info" && <InfoTab meta={meta} />}
      </div>
    </div>
  );
}
