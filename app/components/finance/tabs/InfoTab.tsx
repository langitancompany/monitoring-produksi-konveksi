// app/components/finance/tabs/InfoTab.tsx
//
// Akun kas/bank, kategori pengeluaran, dan pengaturan keuangan saat ini (HANYA BACA) + rencana
// pembangunan modul. Layar untuk mengubah pengaturan menyusul di langkah 6.8; sementara itu ubah
// lewat SQL Editor (tabel finance_settings, finance_accounts, finance_categories).
"use client";

import React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { ACCOUNT_TYPE_LABEL, type FinanceMeta } from "@/lib/finance/types";
import { rupiah } from "@/lib/salary";
import { cardCls, sectionLabelCls } from "../ui";
import InvoiceSettingsCard from "../InvoiceSettingsCard";

const STEPS: { id: string; label: string; done: boolean }[] = [
  { id: "6.1", label: "Fondasi: akun, kategori, pengaturan, log audit", done: true },
  { id: "6.2", label: "Tagihan (invoice) per pesanan — database & API", done: true },
  { id: "6.3", label: "Pembayaran: catat, verifikasi, void — database & API", done: true },
  { id: "6.4", label: "Layar Keuangan: Tagihan & Pembayaran", done: true },
  { id: "6.5", label: "Pengeluaran: vendor, catat, persetujuan", done: true },
  { id: "6.6", label: "Ringkasan, Laporan, Audit, Panduan", done: true },
  { id: "6.7", label: "Dokumen invoice (cetak/PDF) & bagikan, ekspor Excel", done: true },
  { id: "6.8", label: "Gaji → Keuangan, tutup periode, transfer akun", done: false },
];

const yesNo = (v: boolean) => (v ? "Ya" : "Tidak");

export default function InfoTab({ meta }: { meta: FinanceMeta }) {
  const rows: [string, string][] = [
    ["Transfer/QRIS wajib bukti", yesNo(meta.settings.require_proof_non_cash)],
    ["Pencatat ≠ pemverifikasi", yesNo(meta.settings.require_separate_verifier)],
    ["Boleh bayar melebihi tagihan", yesNo(meta.settings.allow_overpayment)],
    ["Pembayaran sendiri langsung terverifikasi", yesNo(meta.settings.auto_verify_own_payment)],
    ["Pengeluaran sendiri langsung disetujui", yesNo(meta.settings.auto_approve_own_expense)],
    [
      "Bukti pengeluaran wajib di atas",
      meta.settings.expense_proof_required_above > 0 ? rupiah(meta.settings.expense_proof_required_above) : "Tidak wajib",
    ],
    ["Akun pembayaran gaji", meta.settings.salary_default_account_code],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`${cardCls} p-4`}>
        <p className={`${sectionLabelCls} mb-3`}>Akun kas / bank</p>
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

      <div className={`${cardCls} p-4`}>
        <p className={`${sectionLabelCls} mb-3`}>Kategori pengeluaran</p>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {meta.categories.map((c) => (
            <li key={c.id} className="py-2 text-sm text-zinc-900 dark:text-zinc-100">
              {c.name} <span className="font-mono text-[11px] text-zinc-400">{c.code}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${cardCls} p-4 md:col-span-2`}>
        <p className={`${sectionLabelCls} mb-3`}>Pengaturan saat ini</p>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-zinc-100 dark:border-zinc-900 pb-1.5">
              <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100 text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-3">
          Nilai awal adalah asumsi bawaan. Layar untuk mengubahnya menyusul di langkah 6.8; sementara itu ubah lewat SQL
          Editor (tabel finance_settings).
        </p>
      </div>

      {meta.caps.isSupervisor && <InvoiceSettingsCard />}

      <div className={`${cardCls} p-4 md:col-span-2`}>
        <p className={`${sectionLabelCls} mb-3`}>Rencana pembangunan</p>
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
    </div>
  );
}
