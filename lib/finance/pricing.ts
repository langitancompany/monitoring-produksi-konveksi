// lib/finance/pricing.ts
//
// Hitung tagihan dari baris item pesanan (orders.items) × harga per pcs. Fungsi MURNI.
// SUMBER KEBENARAN total ada di database (fin_issue_invoice menghitung ulang dari orders.items);
// file ini dipakai untuk (a) pratinjau di form tagihan, (b) pemeriksaan awal di API supaya galat
// jelas, dan (c) mendeteksi tagihan yang sudah tidak sesuai pesanan. Aturannya SAMA dengan fungsi
// SQL — ubah salah satu, ubah keduanya (migration 010).

import type { OrderItem } from "@/types/order";

/** Satu baris tagihan (disimpan dibekukan di order_invoices.pricing_snapshot). */
export interface InvoiceLine {
  item_id: string;
  jenis_produksi: string;
  nama: string;
  jumlah: number;
  harga_per_pcs: number;
  subtotal: number;
}

export interface InvoiceCalc {
  lines: InvoiceLine[];
  totalPcs: number;
  subtotal: number;
  discount: number;
  total: number;
}

export type InvoiceCalcResult = { ok: true; calc: InvoiceCalc } | { ok: false; error: string };

/** Harga per pcs maksimum (11 digit) — sama dengan batas di fungsi SQL. */
export const MAX_PRICE = 99_999_999_999;

const isPrice = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= MAX_PRICE;

/**
 * @param items    baris item pesanan saat ini
 * @param prices   { id item: harga per pcs }
 * @param nameOf   nama tampilan jenis produksi (untuk pesan galat & rincian); bawaan: kode jenisnya
 */
export function calcInvoice(
  items: OrderItem[],
  prices: Record<string, unknown>,
  discount: unknown = 0,
  nameOf: (jenis: string) => string = (j) => j,
): InvoiceCalcResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Pesanan belum punya rincian item. Isi item di Edit Pesanan dulu." };
  }
  if (!prices || typeof prices !== "object" || Array.isArray(prices)) {
    return { ok: false, error: "Harga per item wajib diisi." };
  }

  const lines: InvoiceLine[] = [];
  let subtotal = 0;
  let totalPcs = 0;
  for (const it of items) {
    if (!it.id) return { ok: false, error: "Ada item pesanan tanpa id. Simpan ulang pesanan di Edit Pesanan." };
    if (!Number.isInteger(it.jumlah) || it.jumlah < 1) {
      return { ok: false, error: "Jumlah item pesanan tidak valid." };
    }
    const nama = nameOf(it.jenis_produksi);
    const price = prices[it.id];
    if (price === undefined || price === null || price === "") {
      return { ok: false, error: `Harga untuk item "${nama}" belum diisi.` };
    }
    if (!isPrice(price)) return { ok: false, error: "Harga per pcs harus bilangan bulat lebih dari 0." };
    const line = price * it.jumlah;
    lines.push({
      item_id: it.id,
      jenis_produksi: it.jenis_produksi,
      nama,
      jumlah: it.jumlah,
      harga_per_pcs: price,
      subtotal: line,
    });
    subtotal += line;
    totalPcs += it.jumlah;
  }

  const ids = new Set(items.map((i) => i.id));
  if (Object.keys(prices).some((k) => !ids.has(k))) {
    return { ok: false, error: "Rincian item pesanan sudah berubah. Muat ulang lalu isi harga lagi." };
  }

  if (typeof discount !== "number" || !Number.isSafeInteger(discount) || discount < 0) {
    return { ok: false, error: "Diskon tidak valid." };
  }
  if (!Number.isSafeInteger(subtotal)) return { ok: false, error: "Total tagihan terlalu besar." };
  if (discount >= subtotal) return { ok: false, error: "Diskon tidak boleh sama dengan atau melebihi subtotal." };

  return { ok: true, calc: { lines, totalPcs, subtotal, discount, total: subtotal - discount } };
}

/**
 * Apakah tagihan aktif sudah tidak sesuai pesanan? (item/jumlah/jenis diubah setelah tagihan terbit).
 * Tagihan tidak pernah berubah sendiri — bila true, UI menyarankan menerbitkan revisi.
 */
export function invoiceIsStale(lines: InvoiceLine[] | null | undefined, items: OrderItem[]): boolean {
  if (!lines || !Array.isArray(lines)) return false;
  if (lines.length !== items.length) return true;
  const byId = new Map(lines.map((l) => [l.item_id, l]));
  return items.some((it) => {
    const l = byId.get(it.id);
    return !l || l.jumlah !== it.jumlah || l.jenis_produksi !== it.jenis_produksi;
  });
}
