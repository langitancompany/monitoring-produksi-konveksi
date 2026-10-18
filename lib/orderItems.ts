// lib/orderItems.ts
//
// Helper baris item pesanan (orders.items) — dipakai form Approval dan Edit
// Pesanan. Item adalah dasar hitung gaji per jenis produksi (Bagian 5) dan
// baris tagihan (Bagian 6), jadi validasinya dibuat ketat di satu tempat.

import type { OrderItem } from "@/types/order";

let counter = 0;
/** ID unik untuk baris item baru (cukup unik dalam satu pesanan). */
export function newItemId(): string {
  counter += 1;
  return `item-${Date.now().toString(36)}-${counter}`;
}

export function sumItems(items: OrderItem[]): number {
  return items.reduce((n, it) => n + (Number(it.jumlah) || 0), 0);
}

/** Pesan kesalahan (bahasa Indonesia) atau null bila item valid. */
export function validateItems(items: OrderItem[]): string | null {
  if (items.length === 0) return "Tambahkan minimal satu item.";
  const seen = new Set<string>();
  for (const it of items) {
    if (!it.jenis_produksi) return "Pilih jenis produksi untuk setiap baris item.";
    if (seen.has(it.jenis_produksi)) {
      return "Satu jenis produksi hanya boleh muncul sekali — gabungkan jumlahnya.";
    }
    seen.add(it.jenis_produksi);
    if (!Number.isInteger(it.jumlah) || it.jumlah < 1) {
      return "Jumlah tiap item harus berupa bilangan bulat minimal 1.";
    }
  }
  return null;
}

/** Bersihkan item sebelum disimpan (rapikan catatan kosong). */
export function cleanItems(items: OrderItem[]): OrderItem[] {
  return items.map((it) => {
    const catatan = it.catatan?.trim();
    return {
      id: it.id,
      jenis_produksi: it.jenis_produksi,
      jumlah: it.jumlah,
      ...(catatan ? { catatan } : {}),
    };
  });
}
