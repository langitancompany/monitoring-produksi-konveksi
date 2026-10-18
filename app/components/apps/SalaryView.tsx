// app/components/apps/SalaryView.tsx
//
// Gaji & Upah (Bagian 5) — tiga kelompok penerima, mengikuti alur Sablon:
//   1. Produksi  : PJ + anggota tim per pesanan (rate per jenis × tahap, dibagi PJ:tim)
//   2. Tim QC    : pool (QC + Packing) dibagi rata ke semua user ber-role QC
//   3. Admin     : bonus per pesanan selesai untuk pembuat pesanan ber-role admin
// Semua angka dihitung di browser dari pesanan yang sudah dimuat (lib/salary.ts, teruji).
// Bulan gaji = bulan tahap terakhir selesai. Tandai lunas & slip cetak per orang.
// Lihat docs/PRD.md §20.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  Loader2,
  Pencil,
  Printer,
  Square,
  Undo2,
} from "lucide-react";
import type { Order, ProductionTypeData } from "@/types/order";
import type { UserData } from "@/types";
import type { TeamData } from "@/types/team";
import type { SalaryKategori } from "@/types/salary";
import { usePricing } from "@/hooks/usePricing";
import { paymentKey, useSalaryPayments } from "@/hooks/useSalaryPayments";
import { buildSalaryReport, rupiah, type PersonSalary } from "@/lib/salary";
import { printSlips, type SlipToPrint } from "@/lib/salaryPrint";
import { can } from "@/lib/access";
import { MONTHS } from "@/lib/utils";
import UserAvatar from "@/app/components/ui/UserAvatar";
import { initialsOf } from "@/lib/teams";

interface Props {
  supabase: SupabaseClient;
  /** pesanan yang tidak di Sampah */
  orders: Order[];
  users: UserData[];
  teams: TeamData[];
  productionTypes: ProductionTypeData[];
  currentUser: UserData;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  /** buka Edit Pesanan (untuk mengisi PJ/tim yang kurang) */
  onEditOrder: (orderId: string) => void;
}

const TABS: { id: SalaryKategori; label: string }[] = [
  { id: "produksi", label: "Produksi (PJ & Tim)" },
  { id: "qc", label: "Tim QC" },
  { id: "admin", label: "Admin" },
];

const card = "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`${card} p-4 min-w-0`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">{label}</div>
      <div
        className={`font-mono tabular-nums text-lg md:text-xl font-semibold truncate ${
          accent ? "text-[#124540] dark:text-[#49BFB4]" : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export default function SalaryView({
  supabase,
  orders,
  users,
  teams,
  productionTypes,
  currentUser,
  showAlert,
  showConfirm,
  onEditOrder,
}: Props) {
  const canMark = can(currentUser, "salary", "edit");
  const canPrint = can(currentUser, "salary", "create");
  const canEditOrders = can(currentUser, "orders", "edit");

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1–12
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<SalaryKategori>("produksi");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  const { configs, loading: cfgLoading, error: cfgError, fetchConfigs } = usePricing({ supabase });
  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const { payments, loading: payLoading, error: payError, busyKey, markPaid, unmarkPaid } = useSalaryPayments({
    supabase,
    month,
    year,
  });

  const report = useMemo(
    () => buildSalaryReport({ orders, users, teams, types: productionTypes, configs, month, year }),
    [orders, users, teams, productionTypes, configs, month, year],
  );

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "Pengguna tidak ditemukan";
  const avatarOf = (id: string) => users.find((u) => u.id === id)?.avatar_url ?? null;

  const peopleOf = (k: SalaryKategori): PersonSalary[] => {
    const list =
      k === "produksi"
        ? Object.values(report.produksi)
        : k === "qc"
          ? report.qc.members.map((id) => report.qc.perMember[id])
          : Object.values(report.admin);
    return [...list].sort((a, b) => b.total - a.total || nameOf(a.userId).localeCompare(nameOf(b.userId), "id"));
  };
  const people = peopleOf(tab);
  const selected = people.find((p) => p.userId === selectedId) ?? null;

  const paymentOf = (userId: string, k: SalaryKategori = tab) => payments[paymentKey(userId, k)];

  // Ringkasan seluruh kategori bulan ini
  const total = report.produksiTotal + report.qcTotal + report.adminTotal;
  const paidSum = useMemo(() => {
    let sum = 0;
    for (const k of ["produksi", "qc", "admin"] as SalaryKategori[]) {
      for (const p of peopleOf(k)) if (payments[paymentKey(p.userId, k)]) sum += p.total;
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, payments]);
  const percentPaid = total > 0 ? Math.min(100, Math.round((paidSum / total) * 100)) : 0;

  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  const changePeriod = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
    setSelectedId(null);
    setChecked(new Set());
  };
  const changeTab = (k: SalaryKategori) => {
    setTab(k);
    setSelectedId(null);
    setChecked(new Set());
  };

  // ── Aksi ───────────────────────────────────────────────────────────────────
  const toSlip = (p: PersonSalary): SlipToPrint => ({
    name: nameOf(p.userId),
    kategori: tab,
    rows: p.rows,
    total: p.total,
    paidAt: paymentOf(p.userId)?.paid_at ?? null,
  });

  const doPrint = (list: PersonSalary[]) => {
    if (list.length === 0) {
      showAlert("Belum ada yang dipilih", "Pilih minimal satu orang untuk dicetak.", "error");
      return;
    }
    setPrinting(true);
    const ok = printSlips(list.map(toSlip), periodLabel, MONTHS[month - 1], year, () => setPrinting(false));
    if (!ok) {
      setPrinting(false);
      showAlert("Gagal menyiapkan dokumen", "Dokumen cetak tidak bisa dibuat. Coba lagi.", "error");
    }
  };

  const doMark = (p: PersonSalary) =>
    showConfirm(
      "Tandai sudah dibayar?",
      `Gaji ${nameOf(p.userId)} (${periodLabel}) sebesar ${rupiah(p.total)} ditandai SUDAH DIBAYAR. Tercatat di jejak audit.`,
      async () => {
        const err = await markPaid(p.userId, tab, p.total);
        if (err) showAlert("Gagal menandai lunas", err, "error");
      },
    );

  const doUnmark = (p: PersonSalary) =>
    showConfirm(
      "Batalkan status lunas?",
      "Gunakan ini hanya bila gaji ternyata belum benar-benar diberikan. Pembatalan tercatat di jejak audit.",
      async () => {
        const err = await unmarkPaid(p.userId, tab);
        if (err) showAlert("Gagal membatalkan", err, "error");
      },
    );

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedPay = selected ? paymentOf(selected.userId) : undefined;
  const busy = selected ? busyKey === paymentKey(selected.userId, tab) : false;

  if (cfgLoading && configs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header + periode */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Gaji &amp; Upah</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Gaji dihitung dari pesanan yang tahapnya selesai pada bulan terpilih, memakai rate di Config Harga.
          </p>
        </div>
        <div className="flex items-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md w-full md:w-auto">
          <select
            aria-label="Bulan"
            value={month}
            onChange={(e) => changePeriod(Number(e.target.value), year)}
            className="flex-1 md:flex-none bg-transparent text-sm font-semibold text-zinc-700 dark:text-zinc-200 p-2 outline-none cursor-pointer"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1} className="dark:bg-zinc-900">{m}</option>
            ))}
          </select>
          <select
            aria-label="Tahun"
            value={year}
            onChange={(e) => changePeriod(month, Number(e.target.value))}
            className="flex-1 md:flex-none bg-transparent text-sm font-semibold text-zinc-700 dark:text-zinc-200 p-2 outline-none cursor-pointer border-l border-zinc-200 dark:border-zinc-800"
          >
            {years.map((y) => (
              <option key={y} value={y} className="dark:bg-zinc-900">{y}</option>
            ))}
          </select>
        </div>
      </div>

      {(cfgError || payError) && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          {cfgError || payError}
        </div>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Total gaji bulan ini" value={rupiah(total)} sub={periodLabel} accent />
        </div>
        <StatCard
          label="Produksi"
          value={rupiah(report.produksiTotal)}
          sub={`${Object.keys(report.produksi).length} orang`}
        />
        <StatCard
          label="Tim QC"
          value={rupiah(report.qcTotal)}
          sub={`${report.qc.members.length} orang · ${report.qc.orderCount} pesanan`}
        />
        <StatCard label="Admin" value={rupiah(report.adminTotal)} sub={`${Object.keys(report.admin).length} orang`} />
        <div className={`${card} p-4 min-w-0`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
            Status pembayaran
          </div>
          <div className="font-mono tabular-nums text-lg md:text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {percentPaid}% <span className="text-[11px] font-sans font-medium text-zinc-500 dark:text-zinc-400">lunas</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden my-1.5">
            <div className="h-full bg-[#124540] dark:bg-[#49BFB4]" style={{ width: `${percentPaid}%` }} />
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
            Belum dibayar <span className="font-mono tabular-nums">{rupiah(Math.max(0, total - paidSum))}</span>
          </div>
        </div>
      </div>

      {/* Peringatan data yang membuat gaji belum lengkap */}
      {(report.warnings.length > 0 || report.noQcMembers) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Perlu dilengkapi agar gaji akurat
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
            {report.noQcMembers && (
              <li>Ada pool gaji QC tetapi belum ada user ber-role QC — atur di Pengaturan → Pengguna.</li>
            )}
            {report.warnings.map((w) => (
              <li key={w.orderId} className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold">{w.kode}</span>
                <span className="text-amber-700 dark:text-amber-300/80">({w.nama})</span>
                <span>{w.problems.join(" ")}</span>
                {canEditOrders && (
                  <button
                    onClick={() => onEditOrder(w.orderId)}
                    className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                  >
                    <Pencil className="w-3 h-3" /> Edit pesanan
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tab kategori */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg w-full md:w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ${
              tab === t.id
                ? "bg-white dark:bg-zinc-950 text-[#124540] dark:text-[#49BFB4]"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "qc" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pool QC {periodLabel}: <span className="font-mono tabular-nums font-semibold">{rupiah(report.qc.poolTotal)}</span>{" "}
          dari {report.qc.orderCount} pesanan ({report.qc.qty.toLocaleString("id-ID")} pcs), dibagi rata ke{" "}
          {report.qc.members.length} orang ber-role QC.
        </p>
      )}
      {tab === "admin" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Bonus per pesanan selesai untuk pembuat pesanan yang ber-role Admin (aturan di Config Harga).
        </p>
      )}

      {/* Daftar orang + rincian */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Kiri: daftar */}
        <div className={`${card} ${selected ? "hidden md:block" : ""}`}>
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Daftar penerima</span>
            {canPrint && (
              <button
                onClick={() => doPrint(people.filter((p) => checked.has(p.userId)))}
                disabled={checked.size === 0 || printing}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white rounded-md transition-colors duration-150"
              >
                {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                Cetak ({checked.size})
              </button>
            )}
          </div>
          <div className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
            {payLoading && people.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400">Memuat…</div>
            ) : people.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
                Belum ada gaji untuk {periodLabel}.
              </div>
            ) : (
              people.map((p) => {
                const pay = paymentOf(p.userId);
                const name = nameOf(p.userId);
                const isSel = selectedId === p.userId;
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors duration-150 ${
                      isSel
                        ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                        : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {canPrint && (
                      <button
                        aria-label={`Pilih ${name} untuk dicetak`}
                        onClick={() => toggleCheck(p.userId)}
                        className="text-zinc-400 hover:text-[#124540] dark:hover:text-[#49BFB4] shrink-0"
                      >
                        {checked.has(p.userId) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={() => setSelectedId(p.userId)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                      <UserAvatar
                        src={avatarOf(p.userId)}
                        alt={name}
                        fallback={initialsOf(name)}
                        className="w-8 h-8 text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{name}</span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                          {p.orders} pesanan · {p.qty.toLocaleString("id-ID")} pcs
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block font-mono tabular-nums text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {rupiah(p.total)}
                        </span>
                        {pay ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Lunas
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Belum</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Kanan: rincian */}
        {selected ? (
          <div className={`${card} overflow-hidden`}>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden text-zinc-500 dark:text-zinc-400"
                  aria-label="Kembali ke daftar"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
                    {nameOf(selected.userId)}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {periodLabel} · {selected.orders} pesanan
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono tabular-nums text-lg font-semibold text-[#124540] dark:text-[#49BFB4] mr-1">
                  {rupiah(selected.total)}
                </span>
                {canPrint && (
                  <button
                    onClick={() => doPrint([selected])}
                    disabled={printing}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors duration-150"
                  >
                    <Printer className="w-3.5 h-3.5" /> Cetak slip
                  </button>
                )}
                {canMark &&
                  (selectedPay ? (
                    <button
                      onClick={() => doUnmark(selected)}
                      disabled={busy}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-md disabled:opacity-50 transition-colors duration-150"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                      Lunas · batalkan
                    </button>
                  ) : (
                    <button
                      onClick={() => doMark(selected)}
                      disabled={busy || selected.total <= 0}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 text-white rounded-md transition-colors duration-150"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Tandai lunas
                    </button>
                  ))}
              </div>
            </div>

            {selectedPay && selectedPay.total_amount !== selected.total && (
              <div className="px-4 py-2.5 text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-900/50">
                Angka berubah sejak ditandai lunas: dibayar{" "}
                <span className="font-mono font-semibold">{rupiah(selectedPay.total_amount)}</span>, hitungan sekarang{" "}
                <span className="font-mono font-semibold">{rupiah(selected.total)}</span>. Periksa rate, PJ, atau tim.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 text-left bg-zinc-50 dark:bg-zinc-900/50">
                    <th className="px-4 py-2 font-semibold">Pesanan</th>
                    {tab === "produksi" && <th className="px-2 py-2 font-semibold text-center">Peran</th>}
                    <th className="px-2 py-2 font-semibold text-right">Pcs</th>
                    <th className="px-2 py-2 font-semibold text-right">Rata² /pcs</th>
                    <th className="px-4 py-2 font-semibold text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {selected.rows.map((r, i) => (
                    <tr key={`${r.orderId}-${i}`}>
                      <td className="px-4 py-2.5 align-top">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{r.label}</div>
                        <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{r.kode}</div>
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 max-w-md">{r.detail}</div>
                      </td>
                      {tab === "produksi" && (
                        <td className="px-2 py-2.5 text-center align-top">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                              r.role === "PJ"
                                ? "border-[#124540]/40 text-[#124540] dark:text-[#49BFB4]"
                                : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {r.role}
                          </span>
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums align-top">{r.qty.toLocaleString("id-ID")}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums align-top text-zinc-500 dark:text-zinc-400">
                        {r.rate !== undefined ? rupiah(r.rate) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold align-top">{rupiah(r.amount)}</td>
                    </tr>
                  ))}
                  {selected.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-400">
                        Belum ada pesanan yang masuk gaji bulan ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={`${card} hidden md:flex items-center justify-center h-48 text-xs text-zinc-400 dark:text-zinc-600`}>
            Pilih satu orang untuk melihat rincian gajinya.
          </div>
        )}
      </div>
    </div>
  );
}
