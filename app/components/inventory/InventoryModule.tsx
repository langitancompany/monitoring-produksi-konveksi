// app/components/inventory/InventoryModule.tsx
//
// Halaman Stok Barang Jadi: tab Stok, Verifikasi, dan Riwayat. Hak akses dihitung SERVER (meta.caps);
// di sini hanya untuk menampilkan/menyembunyikan tombol. Penegakan ada di API dan database.
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Boxes, CheckCircle2, ClipboardCheck, History, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useInventoryMeta } from "@/hooks/useInventoryApi";
import StockTab from "./StockTab";
import VerifyTab from "./VerifyTab";
import HistoryTab from "./HistoryTab";
import AdjustTab from "./AdjustTab";

type TabId = "stock" | "verify" | "adjust" | "history";

interface Props {
  /** jumlah menunggu verifikasi berubah (untuk lencana sidebar) */
  onPendingChange?: (n: number) => void;
  /** buka detail pesanan produksi stok; hanya dipanggil untuk pesanan yang bisa dibuka pengguna */
  onOpenOrder?: (orderId: string) => void;
  /** id pesanan yang ada di daftar pesanan pengguna (tautan hanya muncul bila bisa dibuka) */
  openableOrderIds?: Set<string>;
}

export default function InventoryModule({ onPendingChange, onOpenOrder, openableOrderIds }: Props) {
  const { meta, error, loading, reload } = useInventoryMeta();
  const [tab, setTab] = useState<TabId>("stock");
  const [version, setVersion] = useState(0);
  const [historySku, setHistorySku] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (meta) onPendingChange?.(meta.pending_count);
  }, [meta, onPendingChange]);

  const changed = useCallback(
    (message?: string) => {
      if (message) setNotice(message);
      setVersion((v) => v + 1);
      void reload();
    },
    [reload],
  );

  // RLS membatasi daftar pesanan per pengguna: pesanan yang tidak ada di daftarnya tidak bisa dibuka.
  const openOrder = onOpenOrder
    ? (id: string) => {
        if (!openableOrderIds || openableOrderIds.has(id)) onOpenOrder(id);
        else setNotice("Pesanan ini tidak bisa dibuka dengan akun Anda (bukan PJ, anggota tim, atau pengelola pesanan).");
      }
    : undefined;

  if (!meta) {
    return (
      <div className="w-full space-y-3 py-8">
        {error ? (
          <>
            <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
            <button onClick={() => void reload()} className="flex items-center gap-1.5 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat Stok Barang Jadi…
          </p>
        )}
      </div>
    );
  }

  const caps = meta.caps;
  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "stock", label: "Stok", icon: <Boxes size={14} className="shrink-0" /> },
    { id: "verify", label: "Verifikasi", icon: <ClipboardCheck size={14} className="shrink-0" />, badge: caps.verify ? meta.pending_count : 0 },
    ...(caps.adjust ? [{ id: "adjust" as const, label: "Penyesuaian", icon: <SlidersHorizontal size={14} className="shrink-0" /> }] : []),
    { id: "history", label: "Riwayat", icon: <History size={14} className="shrink-0" /> },
  ];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === tab);
    setTab(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].id);
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Stok Barang Jadi</h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Stok bertambah dari pesanan &quot;Produksi untuk stok&quot; setelah QC lolos dan hasilnya diverifikasi dengan hitungan fisik. Selisih setelahnya disesuaikan lewat tab Penyesuaian.
          </p>
        </div>
        <button
          onClick={() => changed()}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 w-11 h-11 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 disabled:opacity-50 transition-colors duration-150 shrink-0"
          aria-label="Muat ulang"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Muat ulang</span>
        </button>
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}</span>
          <button onClick={() => setNotice(null)} className="font-semibold underline shrink-0 min-h-11 px-2 -my-2 -mr-2">Tutup</button>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Menu stok barang jadi"
        onKeyDown={onKeyDown}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 grid grid-flow-col auto-cols-fr gap-1 sm:flex sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              id={`inv-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`inv-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 min-h-12 sm:min-h-0 px-1 sm:px-4 py-1.5 sm:py-2.5 text-[11px] sm:text-sm font-semibold rounded-md sm:whitespace-nowrap sm:shrink-0 transition-colors duration-150 ${
                isActive
                  ? "bg-[#124540] text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {t.icon}
              {t.label}
              {!!t.badge && (
                <span className={`absolute top-0.5 right-0.5 sm:static text-[10px] font-semibold rounded-full px-1.5 min-w-[18px] text-center ${isActive ? "bg-white text-[#124540]" : "bg-amber-500 text-white"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`inv-panel-${tab}`} aria-labelledby={`inv-tab-${tab}`}>
        {tab === "stock" && (
          <StockTab
            version={version}
            onShowHistory={(sku) => {
              setHistorySku(sku);
              setTab("history");
            }}
          />
        )}
        {tab === "verify" && (
          <VerifyTab version={version} canVerify={caps.verify} onChanged={changed} onOpenOrder={openOrder} />
        )}
        {tab === "adjust" && caps.adjust && <AdjustTab version={version} onChanged={changed} />}
        {tab === "history" && (
          <HistoryTab version={version} sku={historySku} onClearSku={() => setHistorySku(null)} onOpenOrder={openOrder} />
        )}
      </div>
    </div>
  );
}
