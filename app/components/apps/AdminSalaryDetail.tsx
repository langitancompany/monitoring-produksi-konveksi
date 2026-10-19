// app/components/apps/AdminSalaryDetail.tsx
//
// Rincian gaji bulanan satu Admin di menu Gaji & Upah (tab Admin) — mengikuti tab "Admin &
// Designer" Sablon: gaji tetap per bulan, bonus closing (pesanan dipilih manual), bonus tambahan
// manual. Semua user ber-role Admin tampil walau tanpa closing. Data & aturan: lib/salary.ts,
// hooks/useAdminSalary.ts, migration 008. Lihat docs/PRD.md §20.
"use client";

import React, { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Order } from "@/types/order";
import type { AdminPerson } from "@/lib/salary";
import { rupiah } from "@/lib/salary";
import { inputCls } from "@/app/components/settings/settingsShared";

interface Props {
  person: AdminPerson;
  periodLabel: string;
  /** boleh mengubah (izin Gaji & Upah → Edit) */
  canManage: boolean;
  /** pesanan selesai bulan ini yang belum jadi closing siapa pun, beserta bonusnya */
  candidates: { order: Order; bonus: number }[];
  busy: boolean;
  /** aturan bonus closing untuk teks bantuan */
  ruleText: string;
  onSaveFixed: (amount: number) => void;
  onAddClosing: (orderId: string) => void;
  onDeleteClosing: (id: number) => void;
  onAddBonus: (label: string, amount: number) => void;
  onDeleteBonus: (id: number) => void;
}

const digitsOnly = (v: string) => Number(v.replace(/\D/g, ""));
const showNum = (n: number) => (n ? n.toLocaleString("id-ID") : "");

const sectionCls = "p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3";
const titleCls = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";
const monoInput = `${inputCls} font-mono tabular-nums`;

export default function AdminSalaryDetail({
  person,
  periodLabel,
  canManage,
  candidates,
  busy,
  ruleText,
  onSaveFixed,
  onAddClosing,
  onDeleteClosing,
  onAddBonus,
  onDeleteBonus,
}: Props) {
  // Isian gaji tetap: null = ikut nilai yang berlaku. Induk memberi `key` per orang & bulan,
  // jadi isian ikut tereset saat ganti orang/bulan tanpa effect.
  const [fixedDraft, setFixedDraft] = useState<number | null>(null);
  const fixedInput = fixedDraft ?? person.fixed;
  const [closingOrderId, setClosingOrderId] = useState("");
  const [bonusLabel, setBonusLabel] = useState("");
  const [bonusAmount, setBonusAmount] = useState(0);

  const submitBonus = () => {
    if (!bonusLabel.trim() || bonusAmount <= 0) return;
    onAddBonus(bonusLabel, bonusAmount);
    setBonusLabel("");
    setBonusAmount(0);
  };

  return (
    <div>
      {/* Ringkasan komponen gaji */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
        <p>
          Gaji tetap: <span className="font-mono tabular-nums">{rupiah(person.fixed)}</span>
        </p>
        <p>
          Bonus closing: <span className="font-mono tabular-nums">{rupiah(person.closingTotal)}</span>
        </p>
        <p>
          Bonus tambahan: <span className="font-mono tabular-nums">{rupiah(person.manualTotal)}</span>
        </p>
        {person.fixed === 0 && (
          <p className="pt-1 font-semibold text-amber-700 dark:text-amber-400">
            Gaji tetap belum diisi untuk {periodLabel}.
          </p>
        )}
      </div>

      {/* Gaji tetap */}
      <div className={sectionCls}>
        <p className={titleCls}>Gaji tetap per bulan</p>
        {canManage ? (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                aria-label="Gaji tetap per bulan"
                className={monoInput}
                value={showNum(fixedInput)}
                onChange={(e) => setFixedDraft(digitsOnly(e.target.value))}
                placeholder="0"
              />
              <button
                onClick={() => {
                  onSaveFixed(fixedInput);
                  setFixedDraft(null);
                }}
                disabled={busy || fixedInput === person.fixed}
                className="px-4 rounded-md bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white text-sm font-semibold transition-colors duration-150 shrink-0"
              >
                Simpan
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Berlaku mulai {periodLabel} dan seterusnya sampai Anda ubah lagi. Bulan sebelumnya tidak ikut berubah.
            </p>
          </>
        ) : (
          <p className="font-mono tabular-nums text-sm text-zinc-900 dark:text-zinc-100">{rupiah(person.fixed)}</p>
        )}
      </div>

      {/* Bonus closing */}
      <div className={sectionCls}>
        <p className={titleCls}>Bonus closing (opsional)</p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {ruleText}. Pilih pesanan yang berhasil di-closing oleh admin ini dan selesai pada{" "}
          {periodLabel}. Tidak wajib — gaji tetap tetap dibayar walau tidak ada closing.
        </p>
        {person.closings.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-600">Belum ada closing pada periode ini.</p>
        ) : (
          <div className="space-y-1.5">
            {person.closings.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {c.kode || "Pesanan tidak ditemukan"}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {c.counted
                      ? `${c.nama} · ${c.qty} pcs`
                      : "Tidak dihitung: pesanan belum selesai, selesai di bulan lain, atau sudah dihapus"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {rupiah(c.bonus)}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => onDeleteClosing(c.id)}
                      disabled={busy}
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-40 transition-colors duration-150"
                      aria-label={`Hapus closing ${c.kode}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <div className="flex gap-2">
            <select
              aria-label="Pilih pesanan closing"
              className={inputCls}
              value={closingOrderId}
              onChange={(e) => setClosingOrderId(e.target.value)}
            >
              <option value="">{candidates.length === 0 ? "Tidak ada pesanan selesai yang tersedia" : "Pilih pesanan closing…"}</option>
              {candidates.map(({ order, bonus }) => (
                <option key={order.id} value={order.id}>
                  {order.kode_produksi} · {order.nama_pemesan} · {order.jumlah} pcs · +{rupiah(bonus)}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!closingOrderId) return;
                onAddClosing(closingOrderId);
                setClosingOrderId("");
              }}
              disabled={busy || !closingOrderId}
              className="px-3 rounded-md bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white transition-colors duration-150 shrink-0"
              aria-label="Tambah closing"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Bonus tambahan manual */}
      <div className={sectionCls}>
        <p className={titleCls}>Bonus tambahan (isi manual)</p>
        {person.bonuses.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-600">Belum ada bonus tambahan pada periode ini.</p>
        ) : (
          <div className="space-y-1.5">
            {person.bonuses.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm"
              >
                <span className="text-zinc-800 dark:text-zinc-200 truncate">{b.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {rupiah(b.amount)}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => onDeleteBonus(b.id)}
                      disabled={busy}
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-40 transition-colors duration-150"
                      aria-label={`Hapus bonus ${b.label}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              aria-label="Keterangan bonus"
              className={inputCls}
              value={bonusLabel}
              onChange={(e) => setBonusLabel(e.target.value)}
              placeholder="Keterangan bonus"
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label="Nominal bonus"
              className={`${monoInput} sm:max-w-40`}
              value={showNum(bonusAmount)}
              onChange={(e) => setBonusAmount(digitsOnly(e.target.value))}
              placeholder="Nominal"
            />
            <button
              onClick={submitBonus}
              disabled={busy || !bonusLabel.trim() || bonusAmount <= 0}
              className="px-3 py-2 rounded-md bg-[#124540] hover:bg-[#0d332f] disabled:opacity-40 text-white transition-colors duration-150 shrink-0 flex items-center justify-center"
              aria-label="Tambah bonus"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
