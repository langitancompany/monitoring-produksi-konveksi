// app/components/finance/OrderFinanceSection.tsx
//
// Kartu "Harga & Pembayaran" di Detail Pesanan. Dirender HANYA untuk pengguna yang punya keuangan.view
// (dicek pemanggil), jadi permintaan /api/finance/meta tidak dikirim untuk staf lain. Hak sebenarnya
// tetap dicek server di setiap API keuangan.
"use client";

import React from "react";
import { useFinanceMeta } from "@/hooks/useFinanceApi";
import type { ProductionTypeData } from "@/types/order";
import OrderFinancePanel from "./OrderFinancePanel";
import { cardCls } from "./ui";

export default function OrderFinanceSection({
  orderId,
  productionTypes,
}: {
  orderId: string;
  productionTypes: ProductionTypeData[];
}) {
  const { meta, error } = useFinanceMeta();

  return (
    <div className={`${cardCls} p-4 md:p-5`}>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : !meta ? (
        <p className="text-xs text-zinc-400">Memuat data keuangan…</p>
      ) : (
        <OrderFinancePanel orderId={orderId} meta={meta} productionTypes={productionTypes} />
      )}
    </div>
  );
}
