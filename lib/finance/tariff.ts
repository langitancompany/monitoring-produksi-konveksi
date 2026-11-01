// lib/finance/tariff.ts
//
// Pengelompokan ukuran per jenis produksi (Config Harga → Harga) + biaya tambahan menurut nama varian
// (mis. lengan panjang, rib). Fungsi MURNI.
//
// PEMBAGIAN TUGAS:
//   • Config Harga → Harga HANYA mengatur KELOMPOK ukuran (mis. "S & M", "L & XL") dan BIAYA TAMBAHAN varian.
//     Kelompok TIDAK menyimpan harga.
//   • HARGA per kelompok diisi PER PESANAN saat menerbitkan/merevisi tagihan, jadi tiap pesanan boleh berbeda
//     harga sementara kelompok ukurannya tetap sama.
//
// SUMBER KEBENARAN ada di database (fin_item_lines, migration 022); aturan di sini harus SAMA —
// ubah salah satu, ubah keduanya. File ini dipakai untuk pratinjau di form tagihan dan pemeriksaan awal API.
//
// Aturan:
//   • Kelompok berlaku untuk item yang punya rincian ukuran (orders.items[].rincian) dan jenisnya sudah
//     punya minimal satu kelompok. Selain itu tagihan tetap memakai satu harga per item (manual).
//   • Tiap (varian × ukuran) dicocokkan ke kelompok ukuran jenisnya. Kelompok khusus varian (varian terisi)
//     didahulukan; kelompok umum (varian kosong) berlaku untuk semua varian.
//   • Satu "grup tagihan" = (varian × kelompok). Tiap grup punya satu harga dasar yang diisi di form tagihan,
//     kuncinya `group_key` (lihat groupKey()).
//   • Biaya tambahan: tiap tambahan yang kata kuncinya ADA di nama varian ditambahkan ke harga dasar per pcs
//     (mis. "Lengan Panjang Rib" kena tambahan "lengan panjang" + "rib").

import type { InvoiceLine } from "./pricing";
import type { OrderItem } from "@/types/order";

export interface TariffTier {
  id?: string;
  jenis_produksi: string;
  /** kosong/null = berlaku untuk semua varian */
  varian: string | null;
  /** nama kelompok untuk tampilan, mis. "S & M" */
  label: string;
  /** ukuran yang termasuk kelompok ini, mis. ["S","M"] */
  ukuran: string[];
  sort_order?: number;
}

export interface TariffAddon {
  id?: string;
  jenis_produksi: string;
  /** kata kunci yang dicari di nama varian (tanpa membedakan huruf besar/kecil) */
  keyword: string;
  label: string;
  /** tambahan per pcs untuk semua ukuran */
  tambahan: number;
  sort_order?: number;
}

export interface Tariff {
  tiers: TariffTier[];
  addons: TariffAddon[];
}

export const EMPTY_TARIFF: Tariff = { tiers: [], addons: [] };

/** Harga dasar per pcs yang diisi di form tagihan: { id item: { group_key: harga dasar } }. */
export type TierPrices = Record<string, Record<string, unknown>>;

/** Harga/tambahan per pcs maksimum — sama dengan batas di fungsi SQL. */
export const MAX_TARIFF_PRICE = 99_999_999_999;

const collapse = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const sizeKey = (s: string) => s.trim().toUpperCase();

/** Jenis ini ditagih per kelompok ukuran bila sudah punya minimal satu kelompok. */
export function tariffActive(tariff: Tariff | null | undefined, jenis: string): boolean {
  return !!tariff && tariff.tiers.some((t) => t.jenis_produksi === jenis);
}

/** Nama varian yang dipakai untuk mencocokkan: bila "Lainnya", pakai nama bebas yang diisi. */
export function effectiveVarian(r: { varian?: string; varian_lain?: string }): string {
  const v = (r.varian ?? "").trim();
  const lain = (r.varian_lain ?? "").trim();
  return v.toLowerCase() === "lainnya" && lain ? lain : v;
}

/** Item ini dihitung dari tarif (bukan harga manual)? */
export function itemUsesTariff(item: OrderItem, tariff: Tariff | null | undefined): boolean {
  if (!tariffActive(tariff, item.jenis_produksi)) return false;
  return (item.rincian ?? []).some((r) => (r.ukuran ?? []).some((u) => u.jumlah > 0));
}

/** Kunci grup tagihan = varian (dirapikan) + kelompok. SAMA dengan v_gkey di fin_item_lines (SQL). */
export function groupKey(varian: string, tier: Pick<TariffTier, "id" | "label">): string {
  return `${collapse(varian)}|${tier.id ?? tier.label}`;
}

export interface TariffGroup {
  /** kunci harga dasar di TierPrices[item.id] */
  key: string;
  varian: string;
  tier: TariffTier;
  jumlah: number;
  /** jumlah semua biaya tambahan yang cocok dengan nama varian, per pcs */
  tambahan: number;
  /** nama baris tagihan, mis. "Kaos Polos · Lengan Panjang · S & M" */
  nama: string;
}

export type TariffGroupsResult = { ok: true; groups: TariffGroup[] } | { ok: false; error: string };

/**
 * Kelompokkan satu item menjadi grup tagihan per (varian × kelompok ukuran) — TANPA harga.
 * Dipakai form tagihan untuk menampilkan satu kolom harga per grup, dan oleh tariffLines untuk menghitung.
 */
export function tariffGroups(item: OrderItem, tariff: Tariff, nama: string): TariffGroupsResult {
  const tiers = tariff.tiers.filter((t) => t.jenis_produksi === item.jenis_produksi);
  const addons = tariff.addons.filter((a) => a.jenis_produksi === item.jenis_produksi);

  const groups = new Map<string, { varian: string; tier: TariffTier; jumlah: number }>();
  let total = 0;

  for (const r of item.rincian ?? []) {
    const varian = effectiveVarian(r);
    const vKey = collapse(varian);
    for (const u of r.ukuran ?? []) {
      if (!Number.isInteger(u.jumlah) || u.jumlah < 0) {
        return { ok: false, error: `Jumlah ukuran pada "${nama}" tidak valid.` };
      }
      if (u.jumlah === 0) continue;
      const uKey = sizeKey(u.ukuran);
      const inTier = tiers.filter((t) => t.ukuran.some((x) => sizeKey(x) === uKey));
      const tier =
        inTier.find((t) => t.varian && collapse(t.varian) === vKey) ?? inTier.find((t) => !t.varian || !collapse(t.varian));
      if (!tier) {
        return {
          ok: false,
          error: `Ukuran "${u.ukuran.trim()}"${varian ? ` (${varian})` : ""} pada "${nama}" belum masuk kelompok ukuran mana pun. Atur di Config Harga → Harga.`,
        };
      }
      const key = groupKey(varian, tier);
      const g = groups.get(key);
      if (g) g.jumlah += u.jumlah;
      else groups.set(key, { varian, tier, jumlah: u.jumlah });
      total += u.jumlah;
    }
  }

  if (total !== item.jumlah) {
    return {
      ok: false,
      error: `Rincian ukuran "${nama}" berjumlah ${total} pcs, tidak sama dengan jumlah item (${item.jumlah} pcs). Perbaiki di Edit Pesanan.`,
    };
  }

  const out: TariffGroup[] = [];
  for (const [key, g] of groups) {
    const vKey = collapse(g.varian);
    const tambahan = addons
      .filter((a) => collapse(a.keyword) && vKey.includes(collapse(a.keyword)))
      .reduce((n, a) => n + a.tambahan, 0);
    out.push({
      key,
      varian: g.varian,
      tier: g.tier,
      jumlah: g.jumlah,
      tambahan,
      nama: [nama, g.varian, g.tier.label].filter(Boolean).join(" · "),
    });
  }
  return { ok: true, groups: out };
}

const isBasePrice = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= MAX_TARIFF_PRICE;

export type TariffLinesResult = { ok: true; lines: InvoiceLine[] } | { ok: false; error: string };

/**
 * Pecah satu item yang punya rincian menjadi baris tagihan per (varian × kelompok ukuran).
 * @param prices harga dasar per grup untuk item ini: { group_key: harga } (diisi di form tagihan)
 */
export function tariffLines(
  item: OrderItem,
  tariff: Tariff,
  nama: string,
  prices: Record<string, unknown> = {},
): TariffLinesResult {
  const g = tariffGroups(item, tariff, nama);
  if (!g.ok) return g;

  const lines: InvoiceLine[] = [];
  for (const grp of g.groups) {
    const base = prices?.[grp.key];
    if (base === undefined || base === null || base === "" || base === 0) {
      return { ok: false, error: `Harga untuk "${grp.nama}" belum diisi.` };
    }
    if (!isBasePrice(base)) {
      return { ok: false, error: `Harga untuk "${grp.nama}" harus bilangan bulat lebih dari 0.` };
    }
    const harga = base + grp.tambahan;
    if (!Number.isSafeInteger(harga) || harga > MAX_TARIFF_PRICE) {
      return { ok: false, error: `Harga untuk "${nama}" terlalu besar.` };
    }
    lines.push({
      item_id: item.id,
      jenis_produksi: item.jenis_produksi,
      nama: grp.nama,
      jumlah: grp.jumlah,
      harga_per_pcs: harga,
      subtotal: harga * grp.jumlah,
      auto: true,
      group_key: grp.key,
      harga_dasar: base,
      tambahan: grp.tambahan,
    });
  }
  return { ok: true, lines };
}

/** Ringkas satu kelompok untuk tampilan, mis. 21–25 atau S & M. */
export function sizesText(ukuran: string[]): string {
  return ukuran.join(", ");
}

/** Pecah teks "S, M" / "S M" / "21-25" menjadi daftar ukuran unik (rentang angka diperluas). */
export function parseSizes(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,;\n]+|\s+/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a <= b && b - a <= 60) {
        for (let n = a; n <= b; n++) out.push(String(n));
        continue;
      }
    }
    out.push(part.toUpperCase());
  }
  return [...new Set(out)];
}

// ─── Saran dari Pengaturan → Jenis Produksi ──────────────────────────────────────────────────────

/**
 * Usulkan kelompok ukuran dari daftar ukuran sebuah jenis produksi (Pengaturan → Jenis Produksi), supaya
 * jenis baru langsung bisa diatur tanpa mengetik ulang semua ukuran.
 *   • Huruf: S & M digabung, L & XL digabung (bila keduanya ada); ukuran lain (XXL, 3XL, …) masing-masing sendiri.
 *   • Angka: per kelipatan lima (21–25, 26–30, …); ujung yang tidak penuh memakai ukuran yang ada (mis. 41–43).
 * Urutan mengikuti urutan ukuran di jenis itu. Ukuran dinormalkan huruf besar, tanpa duplikat.
 */
export function suggestTiers(ukuran: string[]): { label: string; ukuran: string[] }[] {
  const sizes = [...new Set(ukuran.map((u) => u.trim().toUpperCase()).filter(Boolean))];
  const out: { label: string; ukuran: string[] }[] = [];
  const numeric = sizes.filter((u) => /^\d{1,3}$/.test(u));
  const rest = sizes.filter((u) => !/^\d{1,3}$/.test(u));

  const pairs: [string, string][] = [["S", "M"], ["L", "XL"]];
  const used = new Set<string>();
  for (const u of rest) {
    if (used.has(u)) continue;
    const pair = pairs.find((p) => p.includes(u) && p.every((x) => rest.includes(x)));
    if (pair) {
      pair.forEach((x) => used.add(x));
      out.push({ label: pair.join(" & "), ukuran: [...pair] });
    } else {
      used.add(u);
      out.push({ label: u, ukuran: [u] });
    }
  }

  const buckets = new Map<number, string[]>();
  for (const u of numeric) {
    const start = Math.floor((Number(u) - 1) / 5) * 5 + 1;
    buckets.set(start, [...(buckets.get(start) ?? []), u]);
  }
  for (const [, list] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const nums = list.map(Number).sort((a, b) => a - b);
    out.push({ label: nums.length === 1 ? String(nums[0]) : `${nums[0]}–${nums[nums.length - 1]}`, ukuran: nums.map(String) });
  }
  return out;
}

const titleCase = (t: string) => t.replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase());

/**
 * Turunkan baris biaya tambahan dari VARIAN jenis produksi, supaya varian baru langsung punya baris harga di Config Harga.
 * Kata kunci yang sudah ada (existingKeywords) "mengambil" bagiannya dari nama varian; sisanya menjadi kata kunci baru.
 * Varian dibaca dari yang terpendek, jadi "Lengan Panjang" → kata kunci "lengan panjang", lalu "Lengan Panjang Rib" →
 * sisanya "rib". Hasilnya cocok dengan aturan penjumlahan: Lengan Panjang Rib = lengan panjang + rib.
 * "Lainnya" dilewati. Hanya mengembalikan baris yang BELUM ada.
 */
export function deriveAddonKeywords(varian: string[], existingKeywords: string[] = []): { keyword: string; label: string }[] {
  const known = existingKeywords.map(collapse).filter(Boolean);
  const original = [...new Set(varian.map(collapse).filter((v) => v && v !== "lainnya"))];
  const names = [...original].sort((a, b) => a.length - b.length);
  const out: { keyword: string; label: string; at: number }[] = [];
  for (const name of names) {
    let rest = name;
    for (const k of [...known].sort((a, b) => b.length - a.length)) rest = rest.split(k).join(" ");
    rest = collapse(rest);
    if (!rest || rest.length > 40 || known.includes(rest)) continue;
    known.push(rest);
    out.push({ keyword: rest, label: titleCase(rest), at: original.indexOf(name) });
  }
  // diproses dari yang terpendek, tapi ditampilkan mengikuti urutan varian di Jenis Produksi
  return out.sort((a, b) => a.at - b.at).map(({ keyword, label }) => ({ keyword, label }));
}

/** Kata kunci cocok dengan minimal satu varian yang terdaftar? (pengingat di layar pengaturan) */
export function keywordMatchesVarian(keyword: string, varian: string[]): boolean {
  const k = collapse(keyword);
  return !!k && varian.some((v) => collapse(v).includes(k));
}

// ─── Validasi isian daftar harga (pemeriksaan awal di API; database memeriksa ulang) ───────────────

export type TariffInputResult =
  | { ok: true; tiers: { varian: string | null; label: string; ukuran: string[] }[]; addons: { keyword: string; label: string; tambahan: number }[] }
  | { ok: false; error: string };

const isMoneyInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_TARIFF_PRICE;

export function sanitizeTariffInput(body: unknown): TariffInputResult {
  const b = body as { tiers?: unknown; addons?: unknown } | null;
  if (!b || !Array.isArray(b.tiers) || !Array.isArray(b.addons)) return { ok: false, error: "Data daftar harga tidak valid" };
  if (b.tiers.length > 40) return { ok: false, error: "Maksimal 40 kelompok harga" };
  if (b.addons.length > 20) return { ok: false, error: "Maksimal 20 biaya tambahan" };

  const tiers: { varian: string | null; label: string; ukuran: string[] }[] = [];
  for (const [i, raw] of b.tiers.entries()) {
    const t = (raw ?? {}) as Partial<TariffTier>;
    const label = typeof t.label === "string" ? t.label.trim() : "";
    if (!label || label.length > 40) return { ok: false, error: `Nama kelompok nomor ${i + 1} wajib diisi (maksimal 40 huruf)` };
    const ukuran = Array.isArray(t.ukuran) ? [...new Set(t.ukuran.map((x) => String(x).trim().toUpperCase()).filter(Boolean))] : [];
    if (ukuran.length < 1 || ukuran.length > 60 || ukuran.some((x) => x.length > 10)) {
      return { ok: false, error: `Kelompok "${label}" harus punya 1–60 ukuran (maksimal 10 huruf per ukuran)` };
    }
    const varian = typeof t.varian === "string" && t.varian.trim() ? t.varian.trim() : null;
    if (varian && varian.length > 60) return { ok: false, error: `Nama varian kelompok "${label}" terlalu panjang` };
    tiers.push({ varian, label, ukuran });
  }

  // satu ukuran hanya boleh di satu kelompok per varian
  const seen = new Map<string, string>();
  for (const t of tiers) {
    for (const u of t.ukuran) {
      const k = `${collapse(t.varian ?? "")}|${u}`;
      if (seen.has(k)) {
        return { ok: false, error: `Ukuran ${u} masuk dua kelompok ("${seen.get(k)}" dan "${t.label}"). Satu ukuran hanya boleh di satu kelompok` };
      }
      seen.set(k, t.label);
    }
  }

  const addons: { keyword: string; label: string; tambahan: number }[] = [];
  for (const [i, raw] of b.addons.entries()) {
    const a = (raw ?? {}) as Partial<TariffAddon>;
    const keyword = typeof a.keyword === "string" ? collapse(a.keyword) : "";
    const label = typeof a.label === "string" ? a.label.trim() : "";
    if (!keyword || keyword.length > 40) return { ok: false, error: `Kata kunci biaya tambahan nomor ${i + 1} wajib diisi (maksimal 40 huruf)` };
    if (!label || label.length > 40) return { ok: false, error: `Nama biaya tambahan nomor ${i + 1} wajib diisi (maksimal 40 huruf)` };
    if (!isMoneyInt(a.tambahan)) return { ok: false, error: `Nominal biaya tambahan "${label}" harus bilangan bulat 0 atau lebih` };
    addons.push({ keyword, label, tambahan: a.tambahan });
  }
  return { ok: true, tiers, addons };
}
