// app/components/orders/detail/ItemsEditor.tsx
// Daftar item pesanan (jenis produksi × jumlah). Dipakai form Approval dan
// Edit Pesanan. Satu jenis produksi hanya boleh sekali (gabungkan jumlahnya).
"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { OrderItem, ProductionTypeData } from "@/types/order";
import { newItemId, sumItems } from "@/lib/orderItems";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface Props {
  items: OrderItem[];
  /** jenis produksi kategori utama (yang aktif + yang sudah terpakai di item) */
  types: ProductionTypeData[];
  onChange: (items: OrderItem[]) => void;
  disabled?: boolean;
}

export default function ItemsEditor({ items, types, onChange, disabled }: Props) {
  const usedByOthers = (idx: number) =>
    new Set(items.filter((_, i) => i !== idx).map((it) => it.jenis_produksi));

  const optionsFor = (idx: number) =>
    types.filter(
      (t) =>
        (t.is_active || t.value === items[idx].jenis_produksi) &&
        !usedByOthers(idx).has(t.value),
    );

  const patch = (idx: number, p: Partial<OrderItem>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));

  const allUsed = types.filter((t) => t.is_active).every((t) => items.some((it) => it.jenis_produksi === t.value));

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div
          key={it.id}
          className="grid grid-cols-[1fr_5.5rem_auto] md:grid-cols-[1fr_6rem_1fr_auto] gap-2 items-start"
        >
          <div>
            {idx === 0 && <label className={labelCls}>Jenis produksi</label>}
            <select
              disabled={disabled}
              className={inputCls}
              value={it.jenis_produksi}
              onChange={(e) => patch(idx, { jenis_produksi: e.target.value })}
            >
              <option value="">Pilih jenis…</option>
              {optionsFor(idx).map((t) => (
                <option key={t.id} value={t.value}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            {idx === 0 && <label className={labelCls}>Jumlah</label>}
            <input
              disabled={disabled}
              type="number"
              min={1}
              inputMode="numeric"
              className={`${inputCls} font-mono tabular-nums`}
              value={it.jumlah || ""}
              onChange={(e) => patch(idx, { jumlah: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="hidden md:block">
            {idx === 0 && <label className={labelCls}>Catatan item</label>}
            <input
              disabled={disabled}
              className={inputCls}
              value={it.catatan ?? ""}
              onChange={(e) => patch(idx, { catatan: e.target.value })}
              placeholder="Warna, bahan, dst. (opsional)"
            />
          </div>
          <div className={idx === 0 ? "pt-[1.125rem]" : ""}>
            <button
              type="button"
              disabled={disabled || items.length <= 1}
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="p-2 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors duration-150"
              aria-label="Hapus baris item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={disabled || allUsed}
          onClick={() => onChange([...items, { id: newItemId(), jenis_produksi: "", jumlah: 0 }])}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] disabled:opacity-40 transition-colors duration-150"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah item
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Total: <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{sumItems(items)}</span> pcs
        </p>
      </div>
    </div>
  );
}
