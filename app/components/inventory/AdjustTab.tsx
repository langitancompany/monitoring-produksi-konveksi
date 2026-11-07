// Tab Penyesuaian: koreksi salah verifikasi, barang rusak/hilang, dan opname. Alasan wajib.
// Hasilnya baris tambah atau kurang di buku besar; stok tidak bisa turun di bawah nol.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { invFetch, invPost, errMsg } from "@/hooks/useInventoryApi";
import type { AdjustKind, StockResponse, StockRow } from "@/lib/inventory/types";
import { skuLabel } from "@/lib/inventory/sku";
import { ADJUST_LABEL, MAX_NOTE, MIN_NOTE } from "@/lib/inventory/validate";
import { GhostButton, ModalShell, PrimaryButton, cardCls, filterInputCls, inputCls, sectionLabelCls } from "@/app/components/finance/ui";
import { countInputCls, md } from "./responsive";

interface Props {
  version: number;
  onChanged: (message?: string) => void;
}

const KINDS: { id: AdjustKind; hint: string }[] = [
  { id: "koreksi", hint: "Perbaiki jumlah yang salah saat verifikasi, bisa menambah atau mengurangi." },
  { id: "rusak", hint: "Kurangi barang yang rusak dan tidak layak jual." },
  { id: "hilang", hint: "Kurangi barang yang tidak ditemukan." },
  { id: "opname", hint: "Samakan stok sistem dengan hitungan fisik. Baris yang cocok dibiarkan." },
];

const nf = (n: number) => n.toLocaleString("id-ID");
const isCount = (s: string) => /^\d{1,7}$/.test(s);
const signed = (n: number) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${nf(Math.abs(n))}`);

interface PickLine {
  key: number;
  sku: string;
  amount: string;
  /** hanya koreksi: arah perubahan */
  dir: "tambah" | "kurang";
}

export default function AdjustTab({ version, onChanged }: Props) {
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<AdjustKind>("rusak");
  const [reason, setReason] = useState("");
  const [picks, setPicks] = useState<PickLine[]>([{ key: 1, sku: "", amount: "", dir: "kurang" }]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const nextKey = useRef(2);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invFetch<StockResponse>("/api/inventori/stock?zero=1")
      .then((r) => {
        if (cancelled) return;
        setStock(r.rows);
        setCounts(Object.fromEntries(r.rows.map((x) => [x.sku_key, String(x.qty)])));
        setError(null);
      })
      .catch((e) => !cancelled && setError(errMsg(e)));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const bySku = useMemo(() => new Map((stock ?? []).map((r) => [r.sku_key, r])), [stock]);
  const opname = kind === "opname";
  const reasonOk = reason.trim().length >= MIN_NOTE;

  const opnameRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (stock ?? []).filter((r) => !t || skuLabel(r).toLowerCase().includes(t));
  }, [stock, q]);
  const changedCounts = (stock ?? []).filter((r) => isCount(counts[r.sku_key] ?? "") && Number(counts[r.sku_key]) !== r.qty);
  const countsValid = (stock ?? []).every((r) => isCount(counts[r.sku_key] ?? ""));

  const pickDelta = (p: PickLine) => {
    const n = isCount(p.amount) ? Number(p.amount) : 0;
    return kind === "koreksi" ? (p.dir === "tambah" ? n : -n) : -n;
  };
  const pickProblem = (p: PickLine): string | null => {
    const row = bySku.get(p.sku);
    if (!row) return null;
    if (isCount(p.amount) && Number(p.amount) > 0 && row.qty + pickDelta(p) < 0) return `Stok hanya ${nf(row.qty)} pcs`;
    return null;
  };
  const picksValid =
    picks.length > 0 &&
    picks.every((p) => p.sku && isCount(p.amount) && Number(p.amount) > 0 && !pickProblem(p)) &&
    new Set(picks.map((p) => p.sku)).size === picks.length;

  const ready = reasonOk && (opname ? countsValid && changedCounts.length > 0 : picksValid);

  const switchKind = (k: AdjustKind) => {
    setKind(k);
    setError(null);
    setPicks((ps) => ps.map((p) => ({ ...p, dir: k === "koreksi" ? p.dir : "kurang" })));
  };

  const updatePick = (key: number, patch: Partial<PickLine>) =>
    setPicks((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const lines = opname
        ? changedCounts.map((r) => ({ sku_key: r.sku_key, counted: Number(counts[r.sku_key]) }))
        : picks.map((p) =>
            kind === "koreksi" ? { sku_key: p.sku, delta: pickDelta(p) } : { sku_key: p.sku, qty: Number(p.amount) },
          );
      const res = await invPost<{ movements: number; total_delta: number }>("/api/inventori/adjustments", {
        kind,
        reason: reason.trim(),
        lines,
      });
      setConfirming(false);
      setReason("");
      setPicks([{ key: nextKey.current++, sku: "", amount: "", dir: kind === "koreksi" ? "tambah" : "kurang" }]);
      onChanged(
        res.movements === 0
          ? "Tidak ada selisih, stok tidak berubah."
          : `${ADJUST_LABEL[kind]} tersimpan: ${signed(res.total_delta)} pcs pada ${res.movements} barang.`,
      );
    } catch (e) {
      setConfirming(false);
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (!stock) {
    return error ? (
      <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
    ) : (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Memuat stok…
      </p>
    );
  }

  const totalDelta = opname
    ? changedCounts.reduce((n, r) => n + Number(counts[r.sku_key]) - r.qty, 0)
    : picks.reduce((n, p) => n + pickDelta(p), 0);

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-3 sm:p-4 md:p-5`}>
        <p className={sectionLabelCls}>Jenis penyesuaian</p>
        <div role="radiogroup" aria-label="Jenis penyesuaian" className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              onClick={() => switchKind(k.id)}
              className={`px-3 py-2.5 min-h-11 rounded-md border text-sm font-semibold text-left transition-colors duration-150 ${
                kind === k.id
                  ? "border-[#124540] bg-[#124540] text-white"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              {ADJUST_LABEL[k.id]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{KINDS.find((k) => k.id === kind)!.hint}</p>
      </div>

      {stock.length === 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Belum ada barang di stok. Penyesuaian hanya untuk barang yang sudah pernah diverifikasi masuk.
        </div>
      )}

      {stock.length > 0 && !opname && (
        <div className={`${cardCls} p-3 sm:p-4 md:p-5 space-y-3`}>
          {picks.map((p) => {
            const problem = pickProblem(p);
            const row = bySku.get(p.sku);
            return (
              <div key={p.key} className="flex flex-col sm:flex-row gap-2 sm:items-start max-sm:rounded-lg max-sm:border max-sm:border-zinc-200 max-sm:dark:border-zinc-800 max-sm:p-3">
                <select
                  aria-label="Barang"
                  className={`${inputCls} sm:flex-1 min-w-0 h-11 !text-base sm:!text-sm`}
                  value={p.sku}
                  disabled={saving}
                  onChange={(e) => updatePick(p.key, { sku: e.target.value })}
                >
                  <option value="">Pilih barang</option>
                  {stock.map((r) => (
                    <option key={r.sku_key} value={r.sku_key} disabled={picks.some((o) => o.key !== p.key && o.sku === r.sku_key)}>
                      {skuLabel(r)} (stok {nf(r.qty)})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 items-start">
                  {kind === "koreksi" && (
                    <select
                      aria-label="Arah koreksi"
                      className={`${inputCls} !w-32 shrink-0 h-11 !text-base sm:!text-sm`}
                      value={p.dir}
                      disabled={saving}
                      onChange={(e) => updatePick(p.key, { dir: e.target.value as PickLine["dir"] })}
                    >
                      <option value="tambah">Tambah</option>
                      <option value="kurang">Kurangi</option>
                    </select>
                  )}
                  <div className="flex-1 sm:flex-none min-w-0">
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Jumlah pcs"
                      placeholder="Jumlah"
                      disabled={saving}
                      value={p.amount}
                      onChange={(e) => updatePick(p.key, { amount: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                      className={`${inputCls} sm:!w-28 h-11 !text-base sm:!text-sm text-right tabular-nums ${problem ? "!border-red-400" : ""}`}
                    />
                    {problem && <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">{problem}</span>}
                    {!problem && row && isCount(p.amount) && (
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                        {nf(row.qty)} → {nf(row.qty + pickDelta(p))}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Hapus baris"
                    disabled={saving || picks.length === 1}
                    onClick={() => setPicks((ps) => ps.filter((o) => o.key !== p.key))}
                    className="flex items-center justify-center w-11 h-11 shrink-0 rounded-md text-zinc-400 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:bg-zinc-100 dark:active:bg-zinc-900 disabled:opacity-30 transition-colors duration-150"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            disabled={saving}
            onClick={() => setPicks((ps) => [...ps, { key: nextKey.current++, sku: "", amount: "", dir: kind === "koreksi" ? "tambah" : "kurang" }])}
            className="flex items-center gap-1.5 min-h-11 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah barang
          </button>
        </div>
      )}

      {stock.length > 0 && opname && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
            <input
              className={`${filterInputCls} w-full !h-11 !text-base sm:!h-10 sm:!text-sm`}
              placeholder="Cari barang"
              aria-label="Cari barang"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto max-h-[70dvh] md:max-h-[28rem]">
            <table className={md.table}>
              <thead className={`${md.head} sticky top-0`}>
                <tr className="text-left bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <th className={`${sectionLabelCls} px-4 py-2.5`}>Barang</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Stok sistem</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Hitung fisik</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Selisih</th>
                </tr>
              </thead>
              <tbody className={md.body}>
                {opnameRows.map((r) => {
                  const raw = counts[r.sku_key] ?? "";
                  const valid = isCount(raw);
                  const diff = valid ? Number(raw) - r.qty : 0;
                  return (
                    <tr key={r.sku_key} className={md.row}>
                      <td className={`${md.cell} max-md:col-span-3 max-md:text-sm max-md:font-medium text-zinc-800 dark:text-zinc-200`}>{skuLabel(r)}</td>
                      <td data-label="Sistem" className={`${md.cell} ${md.caption} md:text-right tabular-nums text-zinc-900 dark:text-zinc-100`}>{nf(r.qty)}</td>
                      <td data-label="Hitung fisik" className={`${md.cell} ${md.caption} md:!py-1.5 md:text-right`}>
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          aria-label={`Hitung fisik ${skuLabel(r)}`}
                          disabled={saving}
                          value={raw}
                          onChange={(e) => setCounts((c) => ({ ...c, [r.sku_key]: e.target.value.replace(/\D/g, "").slice(0, 7) }))}
                          onFocus={(e) => e.target.select()}
                          className={`${inputCls} ${countInputCls} ${!valid ? "!border-red-400" : ""}`}
                        />
                      </td>
                      <td data-label="Selisih" className={`${md.cell} ${md.caption} md:text-right tabular-nums font-semibold ${!valid || diff === 0 ? "text-zinc-400 dark:text-zinc-500" : diff < 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {valid ? signed(diff) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stock.length > 0 && (
        <div className={`${cardCls} p-3 sm:p-4 md:p-5 space-y-3`}>
          <label className="block">
            <span className={sectionLabelCls}>
              Alasan <span className="text-red-500">*</span>
            </span>
            <textarea
              rows={2}
              maxLength={MAX_NOTE}
              disabled={saving}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                kind === "koreksi" ? "Mis. salah hitung ukuran L saat verifikasi" :
                kind === "rusak" ? "Mis. noda minyak, tidak bisa dicuci" :
                kind === "hilang" ? "Mis. tidak ditemukan saat pengecekan rak" :
                "Mis. opname bulanan Oktober"
              }
              className={`${inputCls} mt-1 resize-none !text-base sm:!text-sm`}
            />
            {reason.length > 0 && !reasonOk && (
              <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">Alasan minimal {MIN_NOTE} karakter.</span>
            )}
          </label>

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
          )}
          {opname && changedCounts.length === 0 && countsValid && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ubah hitungan fisik pada barang yang selisih. Yang cocok tidak perlu diisi ulang.</p>
          )}

          <div className="flex justify-end">
            <PrimaryButton className="h-11 w-full sm:w-auto sm:min-w-64" disabled={!ready} onClick={() => setConfirming(true)}>
              Simpan penyesuaian
            </PrimaryButton>
          </div>
        </div>
      )}

      {confirming && (
        <ModalShell title="Simpan penyesuaian?" subtitle={ADJUST_LABEL[kind]} onClose={() => !saving && setConfirming(false)}>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Stok berubah <span className="font-semibold tabular-nums">{signed(totalDelta)} pcs</span> pada{" "}
            {opname ? changedCounts.length : picks.length} barang. Baris ini masuk ke riwayat dan tidak dapat diubah atau dihapus.
          </p>
          <div className="mt-5 flex gap-2 justify-end">
            <GhostButton className="h-11 sm:h-auto" onClick={() => setConfirming(false)} disabled={saving}>Batal</GhostButton>
            <PrimaryButton className="h-11 sm:h-auto" onClick={() => void submit()} loading={saving}>Ya, simpan</PrimaryButton>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
