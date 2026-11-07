// app/components/inventory/StokBadge.tsx
// Lencana "STOK" untuk pesanan produksi stok (daftar pesanan, kalender, Pesanan Selesai, Sampah, detail).
import React from "react";

export default function StokBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Produksi untuk stok"
      className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-md border uppercase tracking-wide border-[#124540]/30 bg-[#124540]/5 text-[#124540] dark:border-[#49BFB4]/40 dark:bg-[#49BFB4]/10 dark:text-[#49BFB4] ${className}`}
    >
      Stok
    </span>
  );
}
