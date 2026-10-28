// app/components/orders/ItemBreakdown.tsx
// Rincian varian × ukuran satu item pesanan (hanya tampil bila item punya rincian).
import React from "react";
import type { OrderItem } from "@/types/order";
import { ukuranSummary, varianLabel, sumUkuran } from "@/lib/orderItems";

export default function ItemBreakdown({ item }: { item: OrderItem }) {
  const rincian = item.rincian ?? [];
  if (rincian.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {rincian.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="min-w-0">
            {varianLabel(r) && <span className="font-semibold text-zinc-700 dark:text-zinc-300">{varianLabel(r)}: </span>}
            <span className="font-mono tabular-nums break-words">{ukuranSummary(r)}</span>
          </span>
          <span className="font-mono tabular-nums shrink-0">{sumUkuran(r.ukuran)} pcs</span>
        </li>
      ))}
    </ul>
  );
}
