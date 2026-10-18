// app/components/orders/detail/ApprovalForm.tsx
// Form Approval pesanan utama: pilih jenis produksi + jumlah per item (dasar
// gaji per item), lalu file approval (gambar/PDF) atau link, dan catatan.
"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ApprovalInput, OrderItem, ProductionTypeData } from "@/types/order";
import { newItemId, sumItems } from "@/lib/orderItems";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import ItemsEditor from "./ItemsEditor";

interface Props {
  /** jumlah dari form pesanan awal (jadi isian awal baris pertama) */
  initialJumlah: number;
  utamaTypes: ProductionTypeData[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (data: ApprovalInput) => void;
}

export default function ApprovalForm({ initialJumlah, utamaTypes, isSubmitting, onCancel, onSubmit }: Props) {
  const [items, setItems] = useState<OrderItem[]>([
    { id: newItemId(), jenis_produksi: "", jumlah: initialJumlah || 0 },
  ]);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [catatan, setCatatan] = useState("");

  const total = sumItems(items);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    onSubmit({
      items,
      file: mode === "file" ? file : null,
      link: mode === "link" ? link : "",
      catatan,
    });
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
      <div>
        <p className={labelCls}>Item pesanan *</p>
        <ItemsEditor items={items} types={utamaTypes} onChange={setItems} disabled={isSubmitting} />
        {initialJumlah > 0 && total !== initialJumlah && (
          <p className="mt-2 text-[11px] text-orange-600 dark:text-orange-400">
            Total item <span className="font-mono tabular-nums">{total}</span> pcs berbeda dari pesanan awal{" "}
            <span className="font-mono tabular-nums">{initialJumlah}</span> pcs. Jumlah pesanan akan mengikuti total item.
          </p>
        )}
      </div>

      <div>
        <p className={labelCls}>File approval *</p>
        <div className="flex gap-1.5 mb-2">
          {(["file", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors duration-150 ${
                mode === m
                  ? "bg-[#124540] text-white border-[#124540]"
                  : "bg-white dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {m === "file" ? "Upload file" : "Tempel link"}
            </button>
          ))}
        </div>
        {mode === "file" ? (
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={isSubmitting}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-[#124540] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#0d332f]"
          />
        ) : (
          <input
            type="url"
            disabled={isSubmitting}
            className={inputCls}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/…"
          />
        )}
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">Gambar (JPG/PNG) atau PDF maksimal 15 MB.</p>
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
          {isSubmitting ? "Menyimpan..." : "Simpan Approval"}
        </button>
      </div>
    </form>
  );
}
