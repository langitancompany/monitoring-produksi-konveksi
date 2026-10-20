// app/components/finance/InvoiceModal.tsx
//
// Terbitkan tagihan baru, atau revisi tagihan aktif (revisi WAJIB beralasan).
// Beda dengan Sablon: dasar tagihan = BARIS ITEM pesanan (jenis × jumlah × harga per pcs) − diskon,
// bukan harga dasar + biaya ukuran/lengan. Total di sini hanya pratinjau; angka resmi dihitung
// ulang database (fin_issue_invoice) dari orders.items saat disimpan.
"use client";

import React, { useMemo, useState } from "react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { FinanceApiError, postJson, errMsg } from "@/hooks/useFinanceApi";
import { calcInvoice } from "@/lib/finance/pricing";
import type { OrderFinanceDetail } from "@/lib/finance/types";
import { initialPrices } from "@/lib/finance/view";
import type { ProductionTypeData } from "@/types/order";
import { typeLabel } from "@/lib/utils";
import { CurrencyInput } from "./CurrencyInput";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah } from "./utils";

export default function InvoiceModal({
  detail,
  productionTypes,
  onClose,
  onDone,
}: {
  detail: OrderFinanceDetail;
  productionTypes: ProductionTypeData[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useDialog();
  const active = detail.invoices.find((i) => i.status === "active") ?? null;
  const isRevision = !!active;
  const items = detail.order.items;

  const [prices, setPrices] = useState<Record<string, number>>(() => initialPrices(items, active?.pricing_snapshot));
  const [discount, setDiscount] = useState(active?.discount ?? 0);
  const [dueDate, setDueDate] = useState(active?.due_date ?? "");
  const [reason, setReason] = useState("");
  const [mismatch, setMismatch] = useState<{ total_pcs: number; jumlah: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const nameOf = (jenis: string) => typeLabel(jenis, productionTypes);

  // Pratinjau: aturan sama dengan fungsi SQL (lib/finance/pricing.ts).
  const calc = useMemo(
    () => calcInvoice(items, prices, discount, (j) => typeLabel(j, productionTypes)),
    [items, prices, discount, productionTypes],
  );
  const partialSubtotal = items.reduce((n, it) => n + (prices[it.id] ?? 0) * it.jumlah, 0);
  const totalPcs = items.reduce((n, it) => n + it.jumlah, 0);

  const canSubmit = calc.ok && (!isRevision || reason.trim().length >= 3);

  // Pesan yang lebih jelas daripada galat umum saat ada harga yang masih kosong.
  const firstMissing = items.find((it) => !((prices[it.id] ?? 0) > 0));
  const hint = firstMissing
    ? `Harga untuk item "${nameOf(firstMissing.jenis_produksi)}" belum diisi.`
    : !calc.ok
      ? calc.error
      : null;

  const submit = async (acknowledge: boolean) => {
    setSaving(true);
    try {
      await postJson("/api/finance/invoices", {
        order_id: detail.order.id,
        prices,
        discount,
        due_date: dueDate || undefined,
        reason: reason.trim() || undefined,
        acknowledge_mismatch: acknowledge || undefined,
      });
      notify(isRevision ? "Tagihan direvisi." : "Tagihan diterbitkan.", { type: "success", title: "Berhasil" });
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof FinanceApiError && e.code === "PCS_MISMATCH") {
        setMismatch({ total_pcs: Number(e.data?.total_pcs), jumlah: Number(e.data?.jumlah) });
      } else {
        notify(errMsg(e), { title: "Gagal menyimpan tagihan" });
      }
    } finally {
      setSaving(false);
    }
  };

  const subtitle = `${detail.order.kode_produksi} · ${detail.order.nama_pemesan} · ${detail.order.jumlah} pcs`;
  const title = isRevision ? `Revisi tagihan (v${(active?.version ?? 0) + 1})` : "Terbitkan tagihan";

  // Pesanan utama belum Approval (atau item kosong): belum ada dasar tagihan.
  if (items.length === 0) {
    return (
      <ModalShell title={title} subtitle={subtitle} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            Pesanan ini belum punya rincian item, jadi belum bisa ditagih.
            {detail.order.kategori === "utama"
              ? " Selesaikan tahap Approval (memilih jenis produksi dan jumlah) dulu."
              : " Isi item di Edit Pesanan dulu."}
          </p>
          <GhostButton onClick={onClose} className="w-full">
            Tutup
          </GhostButton>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={title} subtitle={subtitle} onClose={onClose} wide>
      <div className="space-y-4">
        {detail.invoice_stale && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md px-3 py-2">
            Rincian item pesanan berubah sejak tagihan terakhir terbit. Harga item yang tidak berubah sudah terisi; isi
            harga untuk item baru lalu simpan sebagai revisi.
          </p>
        )}

        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="text-left text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2">Item</th>
                <th className="text-right text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2">Pcs</th>
                <th className="text-right text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2 w-40">
                  Harga / pcs
                </th>
                <th className="text-right text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-2">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200 align-middle">
                    {nameOf(it.jenis_produksi)}
                    {it.catatan && <span className="block text-[10px] text-zinc-400">{it.catatan}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums align-middle">{it.jumlah}</td>
                  <td className="px-3 py-2 align-middle">
                    <CurrencyInput
                      compact
                      label="Harga per pcs"
                      ariaLabel={`Harga per pcs ${nameOf(it.jenis_produksi)}`}
                      value={prices[it.id] ?? 0}
                      onChange={(v) => setPrices((p) => ({ ...p, [it.id]: v }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums align-middle">
                    {formatRupiah((prices[it.id] ?? 0) * it.jumlah)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CurrencyInput label="Diskon" value={discount} onChange={setDiscount} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Jatuh tempo"
            hint={`Opsional. Tidak boleh sebelum tanggal masuk pesanan.`}
          >
            <input
              type="date"
              value={dueDate}
              min={detail.order.tanggal_masuk ?? undefined}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          {isRevision && (
            <Field label="Alasan revisi" required>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                className={inputCls}
                placeholder="Mis. tambah item / koreksi harga"
              />
            </Field>
          )}
        </div>

        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1 text-xs">
          <div className="flex justify-between text-zinc-500">
            <span>Subtotal ({totalPcs} pcs)</span>
            <span className="font-mono tabular-nums">{formatRupiah(calc.ok ? calc.calc.subtotal : partialSubtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>Diskon</span>
              <span className="font-mono tabular-nums">− {formatRupiah(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold text-zinc-900 dark:text-zinc-100 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <span>Total tagihan</span>
            <span className="font-mono tabular-nums">
              {calc.ok ? formatRupiah(calc.calc.total) : formatRupiah(Math.max(0, partialSubtotal - discount))}
            </span>
          </div>
          {hint && <p className="text-[10px] text-amber-600 dark:text-amber-400 pt-1">{hint}</p>}
          <p className="text-[10px] text-zinc-400 pt-1">
            Ini pratinjau. Total resmi dihitung ulang oleh server saat disimpan.
          </p>
        </div>

        {mismatch && (
          <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Rincian item berjumlah <b>{mismatch.total_pcs} pcs</b>, sedangkan jumlah pesanan{" "}
              <b>{mismatch.jumlah} pcs</b>. Total dihitung dari rincian item. Lanjutkan?
            </p>
            <div className="flex gap-2">
              <GhostButton onClick={() => setMismatch(null)} className="flex-1 !py-2">
                Periksa lagi
              </GhostButton>
              <PrimaryButton onClick={() => submit(true)} loading={saving} className="flex-1 !py-2">
                Ya, lanjutkan
              </PrimaryButton>
            </div>
          </div>
        )}

        {!mismatch && (
          <div className="flex gap-2 pt-1">
            <GhostButton onClick={onClose} className="flex-1">
              Batal
            </GhostButton>
            <PrimaryButton onClick={() => submit(false)} loading={saving} disabled={!canSubmit} className="flex-1">
              {isRevision ? "Simpan revisi" : "Terbitkan"}
            </PrimaryButton>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
