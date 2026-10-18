// app/components/apps/ConfigPriceView.tsx
//
// Config Harga (Bagian 5): rate gaji produksi PER PCS untuk tiap (jenis produksi × tahap), plus
// parameter aturan (bonus admin). Konsep dari ConfigPriceView Sablon:
// perubahan disimpan sebagai baris BARU berlaku mulai tanggal tertentu — baris lama tidak pernah
// diubah, jadi gaji bulan lalu tidak ikut berubah. Lihat docs/PRD.md §20.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, ChevronUp, Loader2, Save } from "lucide-react";
import type { ProductionTypeData } from "@/types/order";
import type { UserData } from "@/types";
import type { PricingRowInput } from "@/types/salary";
import { usePricing } from "@/hooks/usePricing";
import {
  PARAM_CATEGORY,
  PARAM_INFO,
  PARAM_DEFAULTS,
  RATE_CATEGORY,
  RATE_STEPS,
  buildRateBook,
  currentRates,
  rateKey,
  rupiah,
  stepAppliesTo,
  type ParamKey,
} from "@/lib/salary";
import { formatDate, toLocalISODate, typeLabel } from "@/lib/utils";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface Props {
  supabase: SupabaseClient;
  productionTypes: ProductionTypeData[];
  users: UserData[];
  /** boleh menyimpan perubahan (izin Config Harga → Edit) */
  canEdit: boolean;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

const digits = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/** Kolom angka Rupiah: tampil dengan pemisah ribuan, simpan hanya digit. */
function MoneyInput({
  value,
  changed,
  disabled,
  placeholder,
  onChange,
  ariaLabel,
}: {
  value: string;
  changed: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange: (digitsOnly: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder ?? "0"}
      value={value === "" ? "" : Number(value).toLocaleString("id-ID")}
      onChange={(e) => onChange(digits(e.target.value))}
      className={`w-full min-w-[84px] border rounded-md px-2 py-1.5 text-sm text-right font-mono tabular-nums outline-none transition-colors duration-150 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 focus:ring-2 focus:ring-[#124540] disabled:opacity-60 ${
        changed
          ? "border-[#124540] dark:border-[#49BFB4] bg-[#124540]/5"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    />
  );
}

export default function ConfigPriceView({
  supabase,
  productionTypes,
  users,
  canEdit,
  showAlert,
  showConfirm,
}: Props) {
  const { configs, loading, error, saving, fetchConfigs, saveRates } = usePricing({ supabase });
  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const today = toLocalISODate();
  const [effectiveDate, setEffectiveDate] = useState(today);
  // hanya sel yang DIUBAH pengguna: key → digit ("" = dikosongkan)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);

  // Nilai yang berlaku HARI INI = dasar pembanding perubahan
  const baseline = useMemo(() => {
    const book = buildRateBook(configs);
    const rates = currentRates(configs, today);
    const params: Record<string, number> = {};
    for (const p of PARAM_INFO) params[p.key] = book.param(p.key, today);
    return { rates, params };
  }, [configs, today]);

  const baseStr = (key: string, isParam: boolean) => {
    const v = isParam ? baseline.params[key] : baseline.rates[key];
    return v === undefined ? "" : String(v);
  };
  const valueOf = (key: string, isParam = false) => drafts[key] ?? baseStr(key, isParam);
  const isChanged = (key: string, isParam = false) =>
    drafts[key] !== undefined && drafts[key] !== baseStr(key, isParam);
  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }));

  // Jenis produksi yang ditampilkan: aktif, atau nonaktif tapi sudah punya rate
  const rows = useMemo(() => {
    const hasRate = (value: string) => Object.keys(baseline.rates).some((k) => k.startsWith(`${value}:`));
    return productionTypes
      .filter((t) => t.is_active || hasRate(t.value))
      .sort(
        (a, b) =>
          (a.kategori === b.kategori ? 0 : a.kategori === "utama" ? -1 : 1) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name, "id"),
      );
  }, [productionTypes, baseline.rates]);

  const unsetCount = useMemo(() => {
    let n = 0;
    for (const t of rows) {
      if (!t.is_active) continue;
      for (const s of RATE_STEPS) {
        if (!stepAppliesTo(t.kategori, s.key)) continue;
        const k = rateKey(t.value, s.key);
        if (valueOf(k) === "") n++;
      }
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, drafts, baseline]);

  // Perubahan yang akan disimpan
  const changes = useMemo(() => {
    const out: PricingRowInput[] = [];
    for (const t of rows) {
      for (const s of RATE_STEPS) {
        if (!stepAppliesTo(t.kategori, s.key)) continue;
        const k = rateKey(t.value, s.key);
        if (drafts[k] !== undefined && drafts[k] !== baseStr(k, false)) {
          out.push({
            category: RATE_CATEGORY,
            key_name: k,
            display_name: `${t.name} — ${s.label}`,
            unit: "per_pcs",
            value_amount: Number(drafts[k] || 0),
          });
        }
      }
    }
    for (const p of PARAM_INFO) {
      if (drafts[p.key] !== undefined && drafts[p.key] !== baseStr(p.key, true)) {
        out.push({
          category: PARAM_CATEGORY,
          key_name: p.key,
          display_name: p.label,
          unit: p.unit,
          value_amount: Number(drafts[p.key] || 0),
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, drafts, baseline]);

  const doSave = async () => {
    const err = await saveRates(changes, effectiveDate);
    if (err) {
      showAlert("Gagal menyimpan", err, "error");
      return;
    }
    setDrafts({});
    showAlert(
      "Berhasil",
      `${changes.length} harga disimpan, berlaku mulai ${formatDate(effectiveDate)}. Riwayat lama tetap tersimpan.`,
    );
  };

  const save = () => {
    if (changes.length === 0) return;
    if (effectiveDate < today) {
      showConfirm(
        "Berlaku mundur?",
        `Tanggal berlaku ${formatDate(effectiveDate)} sudah lewat. Gaji pesanan yang tahapnya selesai sejak tanggal itu dan BELUM ditandai lunas akan ikut berubah. Lanjutkan?`,
        () => void doSave(),
      );
      return;
    }
    void doSave();
  };

  const nameOf = (id?: string | null) => (id ? users.find((u) => u.id === id)?.name ?? "—" : "—");
  const history = useMemo(
    () =>
      [...configs]
        .sort((a, b) => (a.effective_date < b.effective_date ? 1 : a.effective_date > b.effective_date ? -1 : b.id - a.id))
        .slice(0, 80),
    [configs],
  );

  if (loading && configs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const card = "bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800";

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Config Harga</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-xl">
            Rate gaji per pcs untuk tiap jenis produksi dan tahap. Perubahan disimpan sebagai riwayat baru; gaji
            yang sudah lewat tidak ikut berubah.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>Berlaku mulai</label>
              <input
                type="date"
                className={inputCls}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value || today)}
              />
            </div>
            <button
              onClick={save}
              disabled={saving || changes.length === 0}
              className="flex items-center gap-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan{changes.length > 0 ? ` (${changes.length})` : ""}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => void fetchConfigs()} className="font-semibold underline shrink-0">
            Coba lagi
          </button>
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Anda hanya bisa melihat harga (tanpa izin edit).</p>
      )}

      {/* Matriks rate */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rate per pcs (Rupiah)</h2>
          {unsetCount > 0 && (
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              {unsetCount} rate belum diatur — dihitung Rp0
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                <th rowSpan={2} className="text-left font-semibold px-5 py-2 min-w-[180px]">Jenis produksi</th>
                <th colSpan={2} className="font-semibold px-2 pt-2 text-center border-l border-zinc-200 dark:border-zinc-800">
                  Gaji Produksi (PJ &amp; Anggota Tim)
                </th>
                <th colSpan={2} className="font-semibold px-2 pt-2 text-center border-l border-zinc-200 dark:border-zinc-800">
                  Pool Tim QC
                </th>
              </tr>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                {RATE_STEPS.map((s, i) => (
                  <th
                    key={s.key}
                    className={`font-semibold px-2 pb-2 text-center ${i % 2 === 0 ? "border-l border-zinc-200 dark:border-zinc-800" : ""}`}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-zinc-400">
                    Belum ada jenis produksi. Tambahkan di Pengaturan → Jenis Produksi.
                  </td>
                </tr>
              )}
              {rows.map((t, idx) => {
                const startsGroup = idx === 0 || rows[idx - 1].kategori !== t.kategori;
                return (
                  <React.Fragment key={t.id}>
                    {startsGroup && (
                      <tr className="bg-zinc-50 dark:bg-zinc-900/50">
                        <td colSpan={5} className="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                          {t.kategori === "utama" ? "Pesanan Utama" : "Pesanan Non-Utama"}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-5 py-2 font-semibold text-zinc-800 dark:text-zinc-200">
                        {t.name}
                        {!t.is_active && <span className="ml-2 text-[10px] font-medium text-zinc-400">(nonaktif)</span>}
                      </td>
                      {RATE_STEPS.map((s, i) => {
                        const applies = stepAppliesTo(t.kategori, s.key);
                        const k = rateKey(t.value, s.key);
                        return (
                          <td
                            key={s.key}
                            className={`px-2 py-1.5 ${i % 2 === 0 ? "border-l border-zinc-100 dark:border-zinc-900" : ""}`}
                          >
                            {applies ? (
                              <MoneyInput
                                ariaLabel={`${t.name} ${s.label}`}
                                value={valueOf(k)}
                                changed={isChanged(k)}
                                disabled={!canEdit}
                                onChange={(v) => setDraft(k, v)}
                              />
                            ) : (
                              <div className="text-center text-zinc-300 dark:text-zinc-700">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
          Gaji produksi: pcs pesanan dibagi rata ke PJ + anggota tim; anggota digaji pcs bagiannya × rate Jahit / Produksi,
          PJ digaji pcs bagiannya × rate Gaji PJ (Potong Kain tidak punya rate sendiri, sudah termasuk Gaji PJ). Pool QC
          = jumlah pcs × (rate QC + rate Packing), dibagi rata ke semua user ber-role QC. Rate dipilih menurut tanggal
          produksi tuntas (QC &amp; Packing: tanggal tahapnya). Kosong = belum diatur (Rp0); isi 0 bila memang tidak digaji.
        </p>
      </div>

      {/* Parameter aturan */}
      <div className={`${card} p-5`}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Bonus admin</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {PARAM_INFO.map((p) => (
            <div key={p.key}>
              <label className={labelCls}>
                {p.label} <span className="normal-case tracking-normal font-medium">({p.unit})</span>
              </label>
              <MoneyInput
                ariaLabel={p.label}
                value={valueOf(p.key, true)}
                changed={isChanged(p.key, true)}
                disabled={!canEdit}
                placeholder={String(PARAM_DEFAULTS[p.key as ParamKey])}
                onChange={(v) => setDraft(p.key, v)}
              />
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">{p.hint}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-600 dark:text-zinc-300">
          Contoh: pesanan 100 pcs dikerjakan PJ + 3 anggota (4 orang) → tiap orang menggarap 25 pcs. Anggota: 25 × rate
          Jahit / Produksi; PJ: 25 × rate Gaji PJ.
        </p>
      </div>

      {/* Riwayat */}
      <div className={card}>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Riwayat perubahan harga
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showHistory && (
          <div className="overflow-x-auto border-t border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 text-left">
                  <th className="px-5 py-2 font-semibold">Berlaku</th>
                  <th className="px-2 py-2 font-semibold">Harga</th>
                  <th className="px-2 py-2 font-semibold text-right">Nilai</th>
                  <th className="px-5 py-2 font-semibold">Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {history.map((h) => {
                  const [jenis, step] = h.key_name.split(":");
                  const name =
                    h.category === RATE_CATEGORY
                      ? `${typeLabel(jenis, productionTypes)} — ${RATE_STEPS.find((s) => s.key === step)?.label ?? step}`
                      : h.display_name;
                  return (
                    <tr key={h.id}>
                      <td className="px-5 py-1.5 whitespace-nowrap">
                        {formatDate(h.effective_date)}
                        {h.effective_date > today && (
                          <span className="ml-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">terjadwal</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{name}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {h.unit === "persen" ? `${h.value_amount}%` : h.unit === "pcs" ? `${h.value_amount} pcs` : rupiah(h.value_amount)}
                      </td>
                      <td className="px-5 py-1.5 text-zinc-500 dark:text-zinc-400">{nameOf(h.created_by)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
