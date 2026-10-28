// app/components/orders/detail/ApprovalForm.tsx
// Form Approval pesanan utama: admin mengisi rincian pesanan — pilih jenis
// jahitan, varian (bila ada), dan jumlah per ukuran (dasar gaji & tagihan per
// jenis) — dan catatan. Lembar Form Approval dibuat otomatis dari isian ini
// (halaman /approval/[id]); tidak ada file yang perlu diupload.
"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ApprovalInput, OrderItem, ProductionTypeData } from "@/types/order";
import { newItemId, validateItems } from "@/lib/orderItems";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import ItemsEditor from "./ItemsEditor";

interface Props {
  utamaTypes: ProductionTypeData[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (data: ApprovalInput) => void;
}

export default function ApprovalForm({ utamaTypes, isSubmitting, onCancel, onSubmit }: Props) {
  const [items, setItems] = useState<OrderItem[]>([
    { id: newItemId(), jenis_produksi: "", jumlah: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [mockupFiles, setMockupFiles] = useState<Record<string, File>>({});
  const setMockup = (itemId: string, file: File | null) =>
    setMockupFiles((prev) => {
      const next = { ...prev };
      if (file) next[itemId] = file;
      else delete next[itemId];
      return next;
    });
  const [catatan, setCatatan] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const problem = validateItems(items, utamaTypes, mockupFiles);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSubmit({
      items,
      mockups: mockupFiles,
      catatan,
    });
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
      <div>
        <p className={labelCls}>Rincian pesanan *</p>
        <ItemsEditor
          items={items}
          types={utamaTypes}
          onChange={setItems}
          disabled={isSubmitting}
          mockupFiles={mockupFiles}
          onMockupChange={setMockup}
        />
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          Jumlah pesanan diambil dari total semua ukuran yang diisi di sini.
        </p>
      </div>

      <div>
        <label className={labelCls}>Catatan approval</label>
        <textarea
          rows={2}
          disabled={isSubmitting}
          className={inputCls}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Bahan, warna, ukuran, dst. (opsional)"
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-900 transition-colors duration-150 text-sm"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white rounded-md font-semibold transition-colors duration-150 text-sm flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting ? "Menyimpan..." : "Simpan & Buat Form Approval"}
        </button>
      </div>
    </form>
  );
}
