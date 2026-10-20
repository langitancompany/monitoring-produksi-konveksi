// app/components/finance/FinanceModule.tsx
//
// Halaman Keuangan. LANGKAH 6.1 (fondasi): baru menampilkan akun kas/bank, kategori, dan pengaturan
// hasil migration 009 sebagai bukti fondasi terpasang. Tab Tagihan, Pembayaran, Pengeluaran,
// Laporan, dan Audit ditambahkan bertahap (docs/PRD.md §21).
"use client";

import React from "react";
import { CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";
import { useFinanceMeta } from "@/hooks/useFinanceApi";
import { ACCOUNT_TYPE_LABEL } from "@/lib/finance/types";
import { rupiah } from "@/lib/salary";

const STEPS: { id: string; label: string; done: boolean }[] = [
  { id: "6.1", label: "Fondasi: akun, kategori, pengaturan, log audit", done: true },
  { id: "6.2", label: "Tagihan (invoice) per pesanan — database & API", done: true },
  { id: "6.3", label: "Pembayaran: catat, verifikasi, void — database & API", done: true },
  { id: "6.4", label: "Layar Keuangan: Tagihan & Pembayaran", done: false },
  { id: "6.5", label: "Pengeluaran: kategori, vendor, persetujuan", done: false },
  { id: "6.6", label: "Ringkasan, Laporan, Audit, Panduan", done: false },
  { id: "6.7", label: "Dokumen invoice (cetak/PDF) & bagikan", done: false },
  { id: "6.8", label: "Gaji → Keuangan, tutup periode, transfer akun", done: false },
];

const card = "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4";
const title = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-3";

const yesNo = (v: boolean) => (v ? "Ya" : "Tidak");

export default function FinanceModule() {
  const { meta, error, loading, reload } = useFinanceMeta();

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Keuangan</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Sedang dibangun bertahap. Saat ini baru fondasi, tagihan, dan pembayaran (langkah 6.1–6.3) di database dan API; layarnya menyusul di 6.4.
          </p>
        </div>
        <button
          onClick={() => void reload()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors duration-150"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Muat ulang
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className={card}>
        <p className={title}>Rencana pembangunan</p>
        <ul className="space-y-1.5">
          {STEPS.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-300 dark:text-zinc-700 shrink-0" />
              )}
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 w-8">{s.id}</span>
              <span className={s.done ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {meta && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={card}>
            <p className={title}>Akun kas / bank</p>
            {meta.accounts.length === 0 ? (
              <p className="text-xs text-zinc-400">Belum ada akun aktif.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {meta.accounts.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-900 dark:text-zinc-100">
                      {a.name} <span className="font-mono text-[11px] text-zinc-400">{a.code}</span>
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{ACCOUNT_TYPE_LABEL[a.type]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={card}>
            <p className={title}>Kategori pengeluaran</p>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {meta.categories.map((c) => (
                <li key={c.id} className="py-2 text-sm text-zinc-900 dark:text-zinc-100">
                  {c.name} <span className="font-mono text-[11px] text-zinc-400">{c.code}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={`${card} md:col-span-2`}>
            <p className={title}>Pengaturan saat ini</p>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ["Transfer/QRIS wajib bukti", yesNo(meta.settings.require_proof_non_cash)],
                ["Pencatat ≠ pemverifikasi", yesNo(meta.settings.require_separate_verifier)],
                ["Boleh bayar melebihi tagihan", yesNo(meta.settings.allow_overpayment)],
                ["Pembayaran sendiri langsung terverifikasi", yesNo(meta.settings.auto_verify_own_payment)],
                ["Pengeluaran sendiri langsung disetujui", yesNo(meta.settings.auto_approve_own_expense)],
                [
                  "Bukti pengeluaran wajib di atas",
                  meta.settings.expense_proof_required_above > 0
                    ? rupiah(meta.settings.expense_proof_required_above)
                    : "Tidak wajib",
                ],
                ["Akun pembayaran gaji", meta.settings.salary_default_account_code],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-zinc-100 dark:border-zinc-900 pb-1.5">
                  <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100 text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-3">
              Nilai awal adalah asumsi bawaan. Layar untuk mengubahnya menyusul di langkah 6.8; sementara itu ubah lewat
              SQL Editor (tabel finance_settings).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
