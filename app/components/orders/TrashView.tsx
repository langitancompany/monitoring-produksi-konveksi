// app/components/orders/TrashView.tsx
//
// Sampah: pesanan yang dihapus (deleted_at terisi). Bisa dipulihkan atau
// dihapus permanen (beserta file fotonya). Diadopsi dari TrashView Sablon.
// Konfirmasi hapus permanen dilakukan pemanggil (app/page.tsx).
"use client";

import React from "react";
import { Loader2, RefreshCw, Scissors, Shirt, Trash2 } from "lucide-react";
import type { Order } from "@/types/order";
import type { TrashBusy } from "@/hooks/useOrders";
import { formatDate, getStatusColor } from "@/lib/utils";

interface Props {
  orders: Order[];
  /** boleh memulihkan (orders.delete atau trash.delete) */
  canRestore: boolean;
  /** boleh menghapus permanen (trash.delete) */
  canPurge: boolean;
  /** proses yang sedang berjalan → tombol terkait menampilkan loading, semua tombol terkunci */
  busy: TrashBusy;
  onRestore: (order: Order) => void;
  onPermanentDelete: (order: Order) => void;
}

// Asal pesanan: sama dengan ikon menu di sidebar supaya cepat dikenali
const KATEGORI = {
  utama: {
    label: "Utama",
    Icon: Shirt,
    cls: "bg-[#124540]/10 text-[#124540] dark:bg-[#49bfb4]/15 dark:text-[#49bfb4]",
  },
  non_utama: {
    label: "Non-Utama",
    Icon: Scissors,
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
} as const;

export default function TrashView({ orders, canRestore, canPurge, busy, onRestore, onPermanentDelete }: Props) {
  const anyBusy = busy !== null;

  return (
    <div className="space-y-4 md:space-y-6 transition-colors duration-150">
      <div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Sampah</h2>
        <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
          {orders.length} pesanan terhapus
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-950/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center">
          <Trash2 className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
          <p className="text-zinc-400 dark:text-zinc-500 font-medium">Sampah kosong</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {orders.map((order) => {
            const restoring = busy?.id === order.id && busy.action === "restore";
            const purging = busy?.id === order.id && busy.action === "purge";
            const kat = KATEGORI[order.kategori] ?? KATEGORI.utama;

            return (
              <div
                key={order.id}
                aria-busy={restoring || purging}
                className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 relative overflow-hidden transition-colors duration-150 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="absolute top-0 right-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[9px] px-2 py-0.5 font-semibold rounded-bl-lg uppercase tracking-wider">
                  Dihapus
                </div>

                <div className="flex flex-col items-start gap-1.5 mb-2 mt-4">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${kat.cls}`}>
                    <kat.Icon className="w-3 h-3 shrink-0" />
                    {kat.label}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md max-w-full truncate">
                    #{order.kode_produksi}
                  </span>
                  <span
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide whitespace-nowrap ${getStatusColor(order.status)}`}
                  >
                    {order.status}
                  </span>
                </div>

                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1 mb-0.5 leading-tight">
                  {order.nama_pemesan}
                </h3>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-3 font-medium">
                  <span className="font-mono tabular-nums">{order.jumlah}</span> pcs · Dihapus{" "}
                  {order.deleted_at ? formatDate(order.deleted_at) : "-"}
                </div>

                {(canRestore || canPurge) && (
                  <div className="flex gap-2">
                    {canRestore && (
                      <button
                        onClick={() => onRestore(order)}
                        disabled={anyBusy}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-[10px] font-semibold border border-[#124540] dark:border-[#49bfb4] text-[#124540] dark:text-[#49bfb4] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        {restoring ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span className="truncate">Memulihkan…</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 shrink-0" />
                            <span className="truncate">Pulihkan</span>
                          </>
                        )}
                      </button>
                    )}
                    {canPurge && (
                      <button
                        onClick={() => onPermanentDelete(order)}
                        disabled={anyBusy}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-50 dark:disabled:hover:bg-red-900/20"
                      >
                        {purging ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span className="truncate">Menghapus…</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">Hapus</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
