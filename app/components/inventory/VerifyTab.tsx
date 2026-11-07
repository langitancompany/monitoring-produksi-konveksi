// app/components/inventory/VerifyTab.tsx
// Tab Verifikasi: daftar hasil produksi stok yang menunggu verifikasi (kode, QC lolos, PJ, total pcs).
// Memilih satu membuka form verifikasi. (PRD-inventori §10.2)
"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight, ClipboardCheck, Loader2 } from "lucide-react";
import { invFetch, errMsg } from "@/hooks/useInventoryApi";
import type { ReceiptListItem } from "@/lib/inventory/types";
import { formatDateTime } from "@/lib/utils";
import { cardCls, sectionLabelCls } from "@/app/components/finance/ui";
import VerifyForm from "./VerifyForm";

interface Props {
  version: number;
  canVerify: boolean;
  onChanged: (message?: string) => void;
  onOpenOrder?: (orderId: string) => void;
}

export default function VerifyTab({ version, canVerify, onChanged, onOpenOrder }: Props) {
  const [list, setList] = useState<ReceiptListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invFetch<{ receipts: ReceiptListItem[] }>("/api/inventori/receipts?status=pending")
      .then((r) => {
        if (cancelled) return;
        setList(r.receipts);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errMsg(e)));
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (openId) {
    return (
      <VerifyForm
        receiptId={openId}
        canVerify={canVerify}
        onBack={() => setOpenId(null)}
        onOpenOrder={onOpenOrder}
        onDone={(msg) => {
          setOpenId(null);
          onChanged(msg);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
      )}
      {!list && !error && (
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat daftar…
        </p>
      )}
      {list && list.length === 0 && (
        <div className={`${cardCls} px-6 py-12 text-center`}>
          <ClipboardCheck className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Tidak ada yang menunggu verifikasi</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Catatan muncul otomatis di sini begitu QC pesanan produksi stok dinyatakan lolos.
          </p>
        </div>
      )}
      {list && list.length > 0 && (
        <ul className={`${cardCls} divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden`}>
          {list.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="w-full flex items-center gap-3 px-3 sm:px-4 py-3.5 min-h-14 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 break-all">{r.kode_produksi}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    QC lolos {formatDateTime(r.qc_done_at)} · PJ {r.pj_name ?? "-"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{r.total_pcs.toLocaleString("id-ID")} pcs</p>
                  <p className={`${sectionLabelCls} mt-0.5`}>{canVerify ? "Verifikasi" : "Lihat"}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
