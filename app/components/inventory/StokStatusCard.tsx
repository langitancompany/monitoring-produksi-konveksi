// app/components/inventory/StokStatusCard.tsx
// Kartu "Status stok" di Detail Pesanan stok: menunggu verifikasi / terverifikasi oleh siapa dan kapan,
// dengan tautan ke menu Stok Barang Jadi. Hanya dipasang untuk pemegang izin lihat Stok Barang Jadi.
"use client";

import React, { useEffect, useState } from "react";
import { Boxes, CheckCircle2, Clock } from "lucide-react";
import { invFetch } from "@/hooks/useInventoryApi";
import type { ReceiptListItem } from "@/lib/inventory/types";
import { formatDateTime } from "@/lib/utils";
import { cardCls, sectionLabelCls } from "@/app/components/finance/ui";

interface Props {
  orderId: string;
  /** berubah tiap data pesanan berubah, supaya status ikut dimuat ulang */
  refreshKey: string;
  onOpenInventory: () => void;
}

export default function StokStatusCard({ orderId, refreshKey, onOpenInventory }: Props) {
  const [rec, setRec] = useState<ReceiptListItem | null | undefined>(undefined);

  useEffect(() => {
    let off = false;
    invFetch<{ receipts: ReceiptListItem[] }>(`/api/inventori/receipts?status=all&order=${orderId}&limit=1`)
      .then((r) => !off && setRec(r.receipts[0] ?? null))
      .catch(() => !off && setRec(null));
    return () => {
      off = true;
    };
  }, [orderId, refreshKey]);

  const verified = rec?.status === "verified";
  return (
    <div className={`${cardCls} p-5 md:p-6`}>
      <p className={`${sectionLabelCls} flex items-center gap-1.5`}>
        <Boxes className="w-3.5 h-3.5" /> Status stok
      </p>
      {rec === undefined ? (
        <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">Memuat...</p>
      ) : rec === null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Belum ada catatan. Catatan muncul otomatis setelah QC lolos.</p>
      ) : verified ? (
        <div className="mt-2 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            Terverifikasi oleh <span className="font-semibold">{rec.verified_by_name ?? "-"}</span> pada {formatDateTime(rec.verified_at)}.
            Stok bertambah {(rec.total_counted ?? 0).toLocaleString("id-ID")} pcs
            {rec.has_diff ? ", ada selisih dari hasil produksi" : ""}.
          </p>
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-zinc-800 dark:text-zinc-200">Menunggu verifikasi sejak {formatDateTime(rec.qc_done_at)}.</p>
        </div>
      )}
      <button type="button" onClick={onOpenInventory} className="mt-3 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] hover:underline">
        Buka Stok Barang Jadi
      </button>
    </div>
  );
}
