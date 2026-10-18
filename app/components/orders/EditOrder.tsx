// app/components/orders/EditOrder.tsx
// Edit data pesanan (pemesan, tanggal, jumlah, item). Status & tahap TIDAK
// diubah di sini — itu hanya lewat aksi di Detail Pesanan.
"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { EditOrderInput, Order, OrderItem, ProductionTypeData } from "@/types/order";
import { sumItems, validateItems } from "@/lib/orderItems";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import ItemsEditor from "./detail/ItemsEditor";

interface Props {
  order: Order;
  /** semua jenis produksi (aktif & tidak) — dipilah di sini per kategori */
  productionTypes: ProductionTypeData[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (data: EditOrderInput) => void;
}

export default function EditOrder({ order, productionTypes, isSubmitting, onCancel, onSubmit }: Props) {
  const isNon = order.kategori === "non_utama";
  const approvalDone = order.steps.find((s) => s.key === "approval")?.isCompleted === true;
  const editItems = !isNon && approvalDone; // item jadi sumber jumlah

  const [form, setForm] = useState({
    nama_pemesan: order.nama_pemesan,
    no_hp: order.no_hp ?? "",
    alamat_pemesan: order.alamat_pemesan ?? "",
    tanggal_masuk: order.tanggal_masuk,
    deadline: order.deadline,
    catatan_pesanan: order.catatan_pesanan ?? "",
    jumlah: order.jumlah,
    jenis_produksi: order.jenis_produksi ?? "",
  });
  const [items, setItems] = useState<OrderItem[]>(order.items);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const utamaTypes = useMemo(() => productionTypes.filter((t) => t.kategori === "utama"), [productionTypes]);
  const nonUtamaOptions = useMemo(
    () => productionTypes.filter((t) => t.kategori === "non_utama" && (t.is_active || t.value === order.jenis_produksi)),
    [productionTypes, order.jenis_produksi],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (form.deadline < form.tanggal_masuk) {
      setError("Deadline tidak boleh lebih awal dari tanggal masuk.");
      return;
    }
    if (editItems) {
      const problem = validateItems(items);
      if (problem) {
        setError(problem);
        return;
      }
    } else if (!form.jumlah || form.jumlah < 1) {
      setError("Jumlah minimal 1 pcs.");
      return;
    }
    setError(null);
    onSubmit({
      ...form,
      jenis_produksi: isNon ? form.jenis_produksi : order.jenis_produksi,
      ...(editItems ? { items } : {}),
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke detail
      </button>

      <form onSubmit={submit} className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Edit Pesanan</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono tabular-nums">{order.kode_produksi}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nama pemesan *</label>
            <input required className={inputCls} value={form.nama_pemesan} onChange={(e) => set("nama_pemesan", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>No. HP / WhatsApp</label>
            <input inputMode="tel" className={inputCls} value={form.no_hp} onChange={(e) => set("no_hp", e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Alamat</label>
          <textarea rows={2} className={inputCls} value={form.alamat_pemesan} onChange={(e) => set("alamat_pemesan", e.target.value)} />
        </div>

        {isNon && (
          <div>
            <label className={labelCls}>Kategori pemesanan *</label>
            <select required className={inputCls} value={form.jenis_produksi} onChange={(e) => set("jenis_produksi", e.target.value)}>
              {nonUtamaOptions.map((t) => (
                <option key={t.id} value={t.value}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Jumlah (pcs) *</label>
            {editItems ? (
              <p className="px-3 py-2 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{sumItems(items)} <span className="text-[11px] text-zinc-400">(total item)</span></p>
            ) : (
              <input required type="number" min={1} inputMode="numeric" className={inputCls} value={form.jumlah || ""} onChange={(e) => set("jumlah", parseInt(e.target.value, 10) || 0)} />
            )}
          </div>
          <div>
            <label className={labelCls}>Tanggal masuk *</label>
            <input required type="date" className={inputCls} value={form.tanggal_masuk} onChange={(e) => set("tanggal_masuk", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Deadline *</label>
            <input required type="date" min={form.tanggal_masuk} className={inputCls} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </div>

        {editItems && (
          <div>
            <p className={labelCls}>Item pesanan *</p>
            <ItemsEditor items={items} types={utamaTypes} onChange={setItems} disabled={isSubmitting} />
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              Item dipakai untuk menghitung gaji produksi. Mengubahnya setelah tahap produksi berjalan akan memengaruhi gaji.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Catatan</label>
          <textarea rows={2} className={inputCls} value={form.catatan_pesanan} onChange={(e) => set("catatan_pesanan", e.target.value)} />
        </div>

        {error && (
          <p className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 text-sm">
            Batal
          </button>
          <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white rounded-md font-semibold transition-colors duration-150 text-sm flex items-center justify-center gap-2">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}
