// lib/inventory/sku.ts
//
// Fungsi MURNI (tanpa React / Supabase) untuk satuan stok. PRD-inventori §5.1–§5.2.
// Diuji di tests/inventory.test.ts.

import type { ItemRincian, OrderItem, ProductionTypeData } from "@/types/order";
import { VARIAN_LAINNYA, modelLabel, warnaLabel } from "@/lib/orderItems";
import type { ExpectedLine, SkuParts } from "./types";

/** Bagian kunci: dipangkas, huruf kecil, spasi ganda dirapatkan, tanda `|` diganti spasi. */
const norm = (v: string | null | undefined): string =>
  (v ?? "").replace(/\|/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Kunci satuan stok: `kaos_polo|lengan panjang|abu-abu|l`.
 * Bagian yang kosong tetap ada (tanda `|` tetap muncul) supaya posisi tiap bagian tidak bergeser.
 * Label tampilan TIDAK memengaruhi kunci.
 */
export function skuKey(p: SkuParts): string {
  return [p.jenis_produksi, p.varian, p.warna, p.ukuran].map(norm).join("|");
}

/** Varian/warna "Lainnya" memakai teks bebas sebagai kunci; selain itu nilai pilihannya. */
const keyText = (value: string | undefined, lain: string | undefined): string => {
  if (!value) return "";
  if (value === VARIAN_LAINNYA) return lain?.trim() || value;
  return value;
};

type TypeRef = Pick<ProductionTypeData, "value" | "name"> &
  Partial<Pick<ProductionTypeData, "ukuran" | "sort_order">>;

const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

/** Banding ukuran mengikuti urutan daftar ukuran jenisnya; yang tak dikenal menyusul, urut alami. */
function ukuranCompare(list: string[] | null | undefined) {
  const order = new Map((list ?? []).map((u, i) => [u, i]));
  return (a: string, b: string) => {
    const ia = order.get(a);
    const ib = order.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return collator.compare(a, b);
  };
}

/**
 * Pembanding baris stok: jenis (urutan master, lalu nama) → varian → warna → ukuran
 * (ukuran mengikuti daftar ukuran jenisnya). Dipakai daftar verifikasi dan tampilan stok.
 */
export function makeLineComparator(types: TypeRef[] = []) {
  const typeOf = (value: string) => types.find((t) => t.value === value);
  const sortOf = (jenis: string) => typeOf(jenis)?.sort_order ?? 9999;
  type Row = { jenis_produksi: string; jenis_name: string; varian: string; warna: string; ukuran: string };
  return (a: Row, b: Row): number => {
    if (a.jenis_produksi !== b.jenis_produksi) {
      const d = sortOf(a.jenis_produksi) - sortOf(b.jenis_produksi);
      return d !== 0 ? d : collator.compare(a.jenis_name, b.jenis_name);
    }
    return (
      collator.compare(a.varian, b.varian) ||
      collator.compare(a.warna, b.warna) ||
      ukuranCompare(typeOf(a.jenis_produksi)?.ukuran)(a.ukuran, b.ukuran)
    );
  };
}

/**
 * Baris hasil produksi yang diharapkan dari `order.items` (PRD §5.2):
 *  1. tiap OrderItem → tiap ItemRincian → tiap UkuranQty dengan jumlah > 0 jadi satu baris;
 *  2. item tanpa rincian jadi satu baris memakai `item.jumlah`;
 *  3. baris dengan sku_key sama (mis. dari dua item) digabung, jumlahnya dijumlahkan;
 *  4. urut jenis → varian → warna → ukuran (ukuran mengikuti daftar ukuran jenisnya bila `types` diberikan).
 */
export function expectedLines(items: OrderItem[] | null | undefined, types: TypeRef[] = []): ExpectedLine[] {
  const typeOf = (value: string) => types.find((t) => t.value === value);
  const merged = new Map<string, ExpectedLine>();

  const add = (item: OrderItem, r: ItemRincian | null, ukuran: string, qty: number) => {
    if (!Number.isFinite(qty) || qty <= 0) return;
    const jenis = item.jenis_produksi;
    const varianKey = r ? keyText(r.varian, r.varian_lain) : "";
    const warnaKey = r ? keyText(r.warna, r.warna_lain) : "";
    const key = skuKey({ jenis_produksi: jenis, varian: varianKey, warna: warnaKey, ukuran });
    const prev = merged.get(key);
    if (prev) {
      prev.expected += qty;
      return;
    }
    merged.set(key, {
      sku_key: key,
      jenis_produksi: jenis,
      jenis_name: typeOf(jenis)?.name ?? jenis,
      varian: r ? modelLabel(r) : "",
      warna: r ? warnaLabel(r) : "",
      ukuran,
      expected: qty,
    });
  };

  for (const item of items ?? []) {
    const rincian = item.rincian ?? [];
    if (rincian.length === 0) {
      add(item, null, "", Math.floor(Number(item.jumlah) || 0));
      continue;
    }
    for (const r of rincian) {
      for (const u of r.ukuran ?? []) add(item, r, String(u.ukuran ?? "").trim(), Math.floor(Number(u.jumlah) || 0));
    }
  }

  return [...merged.values()].sort(makeLineComparator(types));
}

/** Label baris untuk tampilan: "Kaos Polo · Lengan Panjang · Abu-abu · L". */
export function skuLabel(p: { jenis_name: string; varian?: string; warna?: string; ukuran?: string }): string {
  return [p.jenis_name, p.varian, p.warna, p.ukuran].filter((x) => !!x && String(x).trim() !== "").join(" · ");
}

/** Total pcs seluruh baris. */
export const totalExpected = (lines: Array<{ expected: number }>): number =>
  lines.reduce((n, l) => n + l.expected, 0);
