// app/components/inventory/VerifyForm.tsx
// Form verifikasi: petugas mencocokkan hasil produksi (hanya-baca) dengan hitungan fisik.
// Hitungan fisik terisi awal sama dengan hasil produksi, jadi bila cocok cukup satu klik.
// Bila ada selisih, alasan wajib. Stok baru bertambah setelah verifikasi disimpan. (PRD-inventori §8)
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { invFetch, invPost, errMsg } from "@/hooks/useInventoryApi";
import type { ReceiptDetail } from "@/lib/inventory/types";
import { MAX_NOTE, MIN_NOTE } from "@/lib/inventory/validate";
import { formatDateTime } from "@/lib/utils";
import { GhostButton, ModalShell, PrimaryButton, cardCls, inputCls, sectionLabelCls } from "@/app/components/finance/ui";

interface Props {
  receiptId: string;
  canVerify: boolean;
  onBack: () => void;
  /** dipanggil setelah verifikasi tersimpan */
  onDone: (message: string) => void;
  /** buka detail pesanan; undefined = pesanan tidak bisa dibuka pengguna ini */
  onOpenOrder?: (orderId: string) => void;
}

const nf = (n: number) => n.toLocaleString("id-ID");
const isCount = (s: string) => /^\d{1,7}$/.test(s);

export default function VerifyForm({ receiptId, canVerify, onBack, onDone, onOpenOrder }: Props) {
  const [rec, setRec] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invFetch<{ receipt: ReceiptDetail }>(`/api/inventori/receipts/${receiptId}`)
      .then((r) => {
        if (cancelled) return;
        setRec(r.receipt);
        setCounts(Object.fromEntries(r.receipt.lines.map((l) => [l.sku_key, String(l.expected)])));
      })
      .catch((e) => !cancelled && setError(errMsg(e)));
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  const lines = useMemo(() => rec?.lines ?? [], [rec]);
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: typeof lines }>();
    for (const l of lines) {
      const g = m.get(l.jenis_produksi) ?? { name: l.jenis_name, items: [] };
      g.items.push(l);
      m.set(l.jenis_produksi, g);
    }
    return [...m.values()];
  }, [lines]);

  const allValid = lines.length > 0 && lines.every((l) => isCount(counts[l.sku_key] ?? ""));
  const num = (l: { sku_key: string }) => (isCount(counts[l.sku_key] ?? "") ? Number(counts[l.sku_key]) : 0);
  const totalExpected = lines.reduce((n, l) => n + l.expected, 0);
  const totalCounted = lines.reduce((n, l) => n + num(l), 0);
  const hasDiff = lines.some((l) => isCount(counts[l.sku_key] ?? "") && num(l) !== l.expected);
  const noteOk = !hasDiff || note.trim().length >= MIN_NOTE;
  const pending = rec?.status === "pending";
  const editable = canVerify && pending;

  const reset = () => setCounts(Object.fromEntries(lines.map((l) => [l.sku_key, String(l.expected)])));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await invPost(`/api/inventori/receipts/${receiptId}/verify`, {
        lines: lines.map((l) => ({ sku_key: l.sku_key, counted: num(l) })),
        note: note.trim(),
      });
      setConfirming(false);
      onDone(`Stok bertambah ${nf(totalCounted)} pcs dari ${rec?.kode_produksi}.`);
    } catch (e) {
      setConfirming(false);
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (!rec) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
        {error ? (
          <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat catatan…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150">
        <ArrowLeft className="w-4 h-4" /> Kembali ke daftar
      </button>

      <div className={`${cardCls} p-4 md:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Verifikasi hasil produksi stok</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Hitung barang fisiknya, lalu cocokkan dengan hasil produksi di bawah.
            </p>
          </div>
          {onOpenOrder && (
            <button
              type="button"
              onClick={() => onOpenOrder(rec.order_id)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Buka pesanan
            </button>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><dt className={sectionLabelCls}>Kode produksi</dt><dd className="mt-0.5 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{rec.kode_produksi}</dd></div>
          <div><dt className={sectionLabelCls}>QC lolos</dt><dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{formatDateTime(rec.qc_done_at)}</dd></div>
          <div><dt className={sectionLabelCls}>PJ</dt><dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{rec.pj_name ?? "-"}</dd></div>
          <div><dt className={sectionLabelCls}>Hasil produksi</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{nf(totalExpected)} pcs</dd></div>
        </dl>
      </div>

      {!pending && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {rec.status === "verified"
            ? `Catatan ini sudah diverifikasi${rec.verified_by_name ? ` oleh ${rec.verified_by_name}` : ""}.`
            : "Catatan ini dibatalkan karena QC dibuka lagi. Ia muncul kembali setelah QC lolos."}
        </div>
      )}
      {pending && !canVerify && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
          Anda hanya bisa melihat. Verifikasi dilakukan oleh pemegang izin Verifikasi stok masuk.
        </div>
      )}
      {pending && lines.length === 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Pesanan ini belum punya rincian hasil produksi. Isi rincian di Edit Pesanan, lalu muat ulang.
        </div>
      )}

      {lines.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <th className={`${sectionLabelCls} px-4 py-2.5`}>Varian</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5`}>Warna</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5`}>Ukuran</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Hasil produksi</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Hitung fisik</th>
                  <th className={`${sectionLabelCls} px-4 py-2.5 text-right`}>Selisih</th>
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.name} className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  <tr className="bg-zinc-50/60 dark:bg-zinc-900/40">
                    <th colSpan={6} className="px-4 py-2 text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200">{g.name}</th>
                  </tr>
                  {g.items.map((l) => {
                    const raw = counts[l.sku_key] ?? "";
                    const valid = isCount(raw);
                    const diff = valid ? Number(raw) - l.expected : 0;
                    return (
                      <tr key={l.sku_key}>
                        <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{l.varian || "-"}</td>
                        <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{l.warna || "-"}</td>
                        <td className="px-4 py-2 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">{l.ukuran || "-"}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{nf(l.expected)}</td>
                        <td className="px-4 py-1.5 text-right">
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label={`Hitung fisik ${l.jenis_name} ${l.varian} ${l.warna} ${l.ukuran}`}
                            disabled={!editable || saving}
                            value={raw}
                            onChange={(e) => setCounts((c) => ({ ...c, [l.sku_key]: e.target.value.replace(/\D/g, "").slice(0, 7) }))}
                            onFocus={(e) => e.target.select()}
                            className={`${inputCls} !w-24 h-11 text-right tabular-nums ${!valid && editable ? "!border-red-400" : ""}`}
                          />
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-semibold ${
                            !valid ? "text-zinc-300 dark:text-zinc-600" : diff < 0 ? "text-red-600 dark:text-red-400" : diff > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {!valid ? "-" : diff === 0 ? "0" : `${diff > 0 ? "+" : "−"}${nf(Math.abs(diff))}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
              <tfoot>
                <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Total</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{nf(totalExpected)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{nf(totalCounted)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {totalCounted === totalExpected ? "0" : `${totalCounted > totalExpected ? "+" : "−"}${nf(Math.abs(totalCounted - totalExpected))}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {rec.status === "verified" && rec.note && (
        <div className={`${cardCls} p-4`}>
          <p className={sectionLabelCls}>Alasan selisih</p>
          <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">{rec.note}</p>
        </div>
      )}

      {editable && lines.length > 0 && (
        <div className={`${cardCls} p-4 md:p-5 space-y-3`}>
          <label className="block">
            <span className={sectionLabelCls}>
              Alasan selisih {hasDiff && <span className="text-red-500">*</span>}
            </span>
            <textarea
              rows={2}
              maxLength={MAX_NOTE}
              disabled={saving}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={hasDiff ? "Mis. 2 pcs cacat jahitan, dipisah" : "Kosongkan bila hitungan cocok"}
              className={`${inputCls} mt-1 resize-none`}
            />
            {hasDiff && !noteOk && (
              <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">Ada selisih, alasan wajib diisi (minimal {MIN_NOTE} karakter).</span>
            )}
          </label>

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <button type="button" onClick={reset} disabled={saving} className="flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-2 transition-colors duration-150">
              <RotateCcw className="w-3.5 h-3.5" /> Samakan dengan hasil produksi
            </button>
            <PrimaryButton className="h-11 sm:min-w-64" disabled={!allValid || !noteOk} onClick={() => setConfirming(true)}>
              Verifikasi &amp; tambah stok
            </PrimaryButton>
          </div>
        </div>
      )}

      {error && !editable && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
      )}

      {confirming && (
        <ModalShell title="Tambah stok sekarang?" subtitle={rec.kode_produksi} onClose={() => !saving && setConfirming(false)}>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Stok akan bertambah <span className="font-semibold tabular-nums">{nf(totalCounted)} pcs</span>. Tindakan ini tidak dapat dibatalkan.
          </p>
          {hasDiff && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Selisih {nf(Math.abs(totalCounted - totalExpected))} pcs dari hasil produksi tercatat bersama alasannya.
            </p>
          )}
          <div className="mt-5 flex gap-2 justify-end">
            <GhostButton onClick={() => setConfirming(false)} disabled={saving}>Batal</GhostButton>
            <PrimaryButton onClick={() => void submit()} loading={saving}>Ya, tambah stok</PrimaryButton>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
