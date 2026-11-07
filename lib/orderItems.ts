// lib/orderItems.ts
//
// Helper baris item pesanan (orders.items) — dipakai form Approval dan Edit
// Pesanan. Item adalah dasar hitung gaji per jenis produksi (Bagian 5) dan
// baris tagihan (Bagian 6), jadi validasinya dibuat ketat di satu tempat.
//
// Aturan penting: `item.jumlah` SELALU total pcs jenis tersebut. Bila item
// punya `rincian` (varian × ukuran), jumlah dihitung dari rincian itu. Dengan
// begitu gaji, tagihan, dan dashboard tetap membaca `jumlah` seperti biasa.

import type { ItemRincian, OrderItem, ProductionTypeData, UkuranQty } from "@/types/order";

export const VARIAN_LAINNYA = "Lainnya";

let counter = 0;
/** ID unik untuk baris item/rincian baru (cukup unik dalam satu pesanan). */
export function newItemId(): string {
  counter += 1;
  return `item-${Date.now().toString(36)}-${counter}`;
}

export function sumUkuran(list: UkuranQty[] | undefined): number {
  return (list ?? []).reduce((n, u) => n + (Number(u.jumlah) || 0), 0);
}

export function sumRincian(rincian: ItemRincian[] | undefined): number {
  return (rincian ?? []).reduce((n, r) => n + sumUkuran(r.ukuran), 0);
}

/** Total pcs satu item: dari rincian bila ada, kalau tidak dari `jumlah`. */
export function itemTotal(it: OrderItem): number {
  return it.rincian && it.rincian.length > 0 ? sumRincian(it.rincian) : Number(it.jumlah) || 0;
}

export function sumItems(items: OrderItem[]): number {
  return items.reduce((n, it) => n + itemTotal(it), 0);
}

/** Jenis pesanan umum (desain khusus: nama model + bagian + mockup per pesanan). */
export function isCustomType(type: ProductionTypeData | undefined): boolean {
  return type?.is_custom === true;
}

/**
 * Daftar ukuran yang berlaku untuk satu item: ukuran jenisnya, atau — untuk pesanan umum —
 * ukuran bagian yang dipilih (kosong selama bagian belum dipilih).
 */
export function ukuranList(type: ProductionTypeData | undefined, item?: Pick<OrderItem, "bagian">): string[] {
  if (isCustomType(type)) {
    return (type?.bagian ?? []).find((b) => b.nama === item?.bagian)?.ukuran ?? [];
  }
  return type?.ukuran ?? [];
}

/** Item ini memakai isian ukuran (daftar ukuran yang berlaku tidak kosong). */
export function hasUkuran(type: ProductionTypeData | undefined, item?: Pick<OrderItem, "bagian">): boolean {
  return ukuranList(type, item).length > 0;
}

/** Varian 1 (model: Panjang/Pendek/1/3). */
export function hasModel(type: ProductionTypeData | undefined): boolean {
  return !isCustomType(type) && (type?.varian?.length ?? 0) > 0;
}
/** Varian 2 (warna). */
export function hasWarna(type: ProductionTypeData | undefined): boolean {
  return !isCustomType(type) && (type?.varian_warna?.length ?? 0) > 0;
}
/**
 * Daftar pilihan yang isinya HANYA "Lainnya" (admin mengetik sendiri): form tampil sebagai isian teks langsung,
 * dan yang tersimpan nama aslinya (mis. "Hitam"), bukan "Lainnya: Hitam".
 */
export function isFreeTextList(list: string[] | null | undefined): boolean {
  return (list?.length ?? 0) > 0 && (list ?? []).every((x) => x === VARIAN_LAINNYA);
}
/** Varian 2 (warna) jenis ini berupa isian teks bebas. */
export function isWarnaFreeText(type: ProductionTypeData | undefined): boolean {
  return hasWarna(type) && isFreeTextList(type?.varian_warna);
}
/** Jenis ini punya salah satu dari Varian 1 / Varian 2, jadi rincian dipecah per blok varian. */
export function hasVarian(type: ProductionTypeData | undefined): boolean {
  return hasModel(type) || hasWarna(type);
}

/** Judul item untuk tampilan: nama model untuk pesanan umum, selain itu nama jenisnya. */
export function itemTitle(it: OrderItem, types: ProductionTypeData[]): string {
  const name = types.find((t) => t.value === it.jenis_produksi)?.name ?? it.jenis_produksi;
  if (it.nama_model?.trim()) return `${it.nama_model.trim()}${it.bagian ? ` (${it.bagian})` : ""}`;
  return name;
}

/** Pilihan siap pakai di Pengaturan → Jenis Produksi. Varian 1 memengaruhi harga; Varian 2 (warna) tidak. */
export const VARIAN_MODEL_CATALOG = ["Lengan Panjang", "Lengan Panjang Rib", "Pendek", "1/3"];
export const VARIAN_WARNA_CATALOG = ["Abu-abu", "Coklat", "Biru", "Putih", "Pramuka"];

/**
 * Data lama menyimpan semua varian (termasuk warna, mis. Celana Sekolah: Abu-abu, Pramuka, Biru, Lainnya) dalam satu daftar.
 * Pisahkan untuk form baru: nilai yang ada di katalog warna → Varian 2, sisanya → Varian 1. "Lainnya" ikut Varian 2
 * bila semua varian lain adalah warna. Bila `warna` sudah terisi (sudah memakai format baru), tidak ada yang dipindah.
 */
export function splitLegacyVarian(varian: string[] | null | undefined, warna: string[] | null | undefined): { model: string[]; warna: string[] } {
  const v = varian ?? [];
  const w = warna ?? [];
  if (w.length > 0) return { model: [...v], warna: [...w] };
  const canon = (x: string) => VARIAN_WARNA_CATALOG.find((c) => sameNameLoose(c, x));
  const others = v.filter((x) => x !== VARIAN_LAINNYA);
  const lainnyaIsWarna = others.length > 0 && others.every((x) => canon(x));
  const model: string[] = [];
  const out: string[] = [];
  for (const x of v) {
    const c = canon(x);
    if (c) out.push(c);
    else if (x === VARIAN_LAINNYA && lainnyaIsWarna) out.push(x);
    else model.push(x);
  }
  return { model, warna: out };
}
const sameNameLoose = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const lainLabel = (v: string | undefined, lain: string | undefined): string => {
  if (!v) return "";
  const l = lain?.trim();
  return v === VARIAN_LAINNYA && l ? `${VARIAN_LAINNYA}: ${l}` : v;
};

/** Nama Varian 1 saja ("Lainnya" + nama bebas → "Lainnya: Hijau"). */
export function modelLabel(r: Pick<ItemRincian, "varian" | "varian_lain">): string {
  return lainLabel(r.varian, r.varian_lain);
}
/** Nama Varian 2 (warna) saja. */
export function warnaLabel(r: Pick<ItemRincian, "warna" | "warna_lain">): string {
  return lainLabel(r.warna, r.warna_lain);
}

/** Nama varian untuk ditampilkan: Varian 1 + warna, mis. "Panjang · Abu-abu". */
export function varianLabel(r: Pick<ItemRincian, "varian" | "varian_lain" | "warna" | "warna_lain">): string {
  return [modelLabel(r), warnaLabel(r)].filter(Boolean).join(" · ");
}

/** Kunci pembeda blok varian (untuk mencegah kombinasi varian + warna yang sama dua kali). */
function varianKey(r: ItemRincian): string {
  const m = `${r.varian ?? ""}|${r.varian === VARIAN_LAINNYA ? (r.varian_lain ?? "").trim().toLowerCase() : ""}`;
  const w = `${(r.warna ?? "").trim().toLowerCase()}|${r.warna === VARIAN_LAINNYA ? (r.warna_lain ?? "").trim().toLowerCase() : ""}`;
  return `${m}#${w}`;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Pesanan lama (sebelum ada Varian 2) menyimpan warna di `varian`. Bila jenisnya kini punya daftar warna dan nilai itu
 * ada di sana (bukan di Varian 1), pindahkan ke `warna` supaya harga tidak ikut terpecah per warna.
 */
export function normalizeRincianVarian(r: ItemRincian, type: ProductionTypeData | undefined): ItemRincian {
  // Warna isian bebas: data lama "Lainnya" + nama bebas dijadikan nama aslinya ("Hitam").
  if (isWarnaFreeText(type) && r.warna === VARIAN_LAINNYA && r.warna_lain?.trim()) {
    const { warna_lain, ...rest } = r;
    return { ...rest, warna: warna_lain.trim() };
  }
  if (!hasWarna(type) || !r.varian || r.warna) return r;
  const models = type?.varian ?? [];
  const warna = type?.varian_warna ?? [];
  if (models.some((m) => sameName(m, r.varian!))) return r;
  const hit = warna.find((w) => sameName(w, r.varian!));
  if (!hit) return r;
  const { varian: _v, varian_lain, ...rest } = r;
  void _v;
  return { ...rest, warna: hit, ...(varian_lain ? { warna_lain: varian_lain } : {}) };
}

/** Blok rincian kosong (semua ukuran jumlah 0). `ukuran` bawaan = ukuran jenisnya; pesanan umum mengisi ukuran bagian. */
export function emptyRincian(type: ProductionTypeData | undefined, varian?: string, ukuran?: string[], warna?: string): ItemRincian {
  return {
    id: newItemId(),
    ...(varian ? { varian } : {}),
    ...(warna ? { warna } : {}),
    ukuran: (ukuran ?? type?.ukuran ?? []).map((u) => ({ ukuran: u, jumlah: 0 })),
  };
}

/**
 * Samakan rincian dengan daftar ukuran terkini di master: urutan mengikuti
 * master, ukuran baru muncul dengan jumlah 0, ukuran lama yang sudah berisi
 * tetap dipertahankan (di akhir) supaya data pesanan lama tidak hilang.
 */
export function alignRincian(rincian: ItemRincian[], type: ProductionTypeData | undefined, item?: Pick<OrderItem, "bagian">): ItemRincian[] {
  const master = ukuranList(type, item);
  return rincian.map((r0) => {
    const r = normalizeRincianVarian(r0, type);
    const byName = new Map(r.ukuran.map((u) => [u.ukuran, u.jumlah]));
    const ordered: UkuranQty[] = master.map((u) => ({ ukuran: u, jumlah: byName.get(u) ?? 0 }));
    const extra = r.ukuran.filter((u) => !master.includes(u.ukuran) && (Number(u.jumlah) || 0) > 0);
    return { ...r, ukuran: [...ordered, ...extra] };
  });
}

/** "25-43, abu" → ["25","26",…,"43","abu"]. Dipakai kolom ukuran/varian di Pengaturan. */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n;]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a <= b && b - a <= 200) {
        for (let n = a; n <= b; n++) out.push(String(n));
        continue;
      }
    }
    out.push(tok);
  }
  return Array.from(new Set(out));
}

/** Kebalikan parseList untuk mengisi kotak teks (angka berurutan diringkas jadi rentang). */
export function formatList(list: string[] | null | undefined): string {
  const items = list ?? [];
  const parts: string[] = [];
  let i = 0;
  while (i < items.length) {
    const start = Number(items[i]);
    if (/^\d{1,3}$/.test(items[i]) && Number.isInteger(start)) {
      let j = i;
      while (j + 1 < items.length && items[j + 1] === String(Number(items[j]) + 1)) j++;
      if (j - i >= 2) {
        parts.push(`${items[i]}-${items[j]}`);
        i = j + 1;
        continue;
      }
    }
    parts.push(items[i]);
    i++;
  }
  return parts.join(", ");
}

/** Pesan kesalahan (bahasa Indonesia) atau null bila item valid. `types` opsional, tapi wajib untuk memeriksa rincian. */
export function validateItems(
  items: OrderItem[],
  types: ProductionTypeData[] = [],
  /** mockup pesanan umum yang baru dipilih (belum diupload), kunci = item.id */
  mockupFiles: Record<string, File> = {},
): string | null {
  if (items.length === 0) return "Tambahkan minimal satu item.";
  for (const it of items) {
    if (!it.jenis_produksi) return "Pilih jenis produksi untuk setiap baris item.";
    const type = types.find((t) => t.value === it.jenis_produksi);
    const custom = isCustomType(type);
    // Jenis yang sama boleh muncul berkali-kali (mis. warna berbeda); gaji menggabungkannya per jenis.

    const name = custom ? (it.nama_model?.trim() || type?.name || it.jenis_produksi) : (type?.name ?? it.jenis_produksi);

    if (custom) {
      if (!it.nama_model?.trim()) return `Isi nama model untuk setiap ${type?.name ?? "pesanan umum"}.`;
      if (!it.bagian) return `Pilih bagian (mis. atasan atau bawahan) untuk ${name}.`;
      if (!hasUkuran(type, it)) return `Bagian ${it.bagian} belum punya daftar ukuran. Atur di Pengaturan → Jenis Produksi.`;
      if (!it.mockup_url && !mockupFiles[it.id]) return `Upload mockup untuk ${name} supaya tim produksi tahu desainnya.`;
    }

    const rincian = it.rincian ?? [];
    if (rincian.length > 0) {
      const keys = new Set<string>();
      for (const r of rincian) {
        if (hasModel(type)) {
          if (!r.varian) return `Pilih varian untuk setiap blok ${name}.`;
          if (r.varian === VARIAN_LAINNYA && !r.varian_lain?.trim()) {
            return `Tulis nama varian "Lainnya" untuk ${name}.`;
          }
        }
        if (hasWarna(type)) {
          const free = isFreeTextList(type?.varian_warna);
          if (!r.warna?.trim()) return free ? `Tulis warna untuk setiap blok ${name}.` : `Pilih warna untuk setiap blok ${name}.`;
          if (!free && r.warna === VARIAN_LAINNYA && !r.warna_lain?.trim()) {
            return `Tulis nama warna "Lainnya" untuk ${name}.`;
          }
        }
        const k = varianKey(r);
        if (keys.has(k)) return `Varian ${varianLabel(r) || ""} pada ${name} muncul dua kali — gabungkan jumlahnya.`;
        keys.add(k);
        for (const u of r.ukuran) {
          if (u.jumlah !== 0 && (!Number.isInteger(u.jumlah) || u.jumlah < 0)) {
            return `Jumlah ukuran ${u.ukuran} pada ${name} harus bilangan bulat, tidak negatif.`;
          }
        }
        if (sumUkuran(r.ukuran) < 1) {
          return `${name}${varianLabel(r) ? ` (${varianLabel(r)})` : ""}: isi minimal satu ukuran, atau hapus blok yang kosong.`;
        }
      }
      continue;
    }

    // Tanpa rincian: jenis berukuran wajib diisi per ukuran. Pengecualian: pesanan lama yang
    // sudah punya jumlah total (dibuat sebelum ada rincian) tetap boleh disimpan apa adanya.
    const totalOk = Number.isInteger(it.jumlah) && it.jumlah >= 1;
    if (hasUkuran(type, it) && !totalOk) return `Isi jumlah per ukuran untuk ${name}.`;
    if (!totalOk) return "Jumlah tiap item harus berupa bilangan bulat minimal 1.";
  }
  return null;
}

/** Bersihkan item sebelum disimpan: buang ukuran 0, rapikan catatan, hitung ulang jumlah dari rincian. */
export function cleanItems(items: OrderItem[]): OrderItem[] {
  return items.map((it) => {
    const catatan = it.catatan?.trim();
    const rincian: ItemRincian[] = (it.rincian ?? [])
      .map((r) => {
        const lain = r.varian === VARIAN_LAINNYA ? r.varian_lain?.trim() : "";
        const warnaLain = r.warna === VARIAN_LAINNYA ? r.warna_lain?.trim() : "";
        const warna = r.warna?.trim();
        return {
          id: r.id,
          ...(r.varian ? { varian: r.varian } : {}),
          ...(lain ? { varian_lain: lain } : {}),
          ...(warna ? { warna } : {}),
          ...(warnaLain ? { warna_lain: warnaLain } : {}),
          ukuran: r.ukuran
            .filter((u) => (Number(u.jumlah) || 0) > 0)
            .map((u) => ({ ukuran: u.ukuran, jumlah: Number(u.jumlah) })),
        };
      })
      .filter((r) => r.ukuran.length > 0);
    const namaModel = it.nama_model?.trim();
    return {
      id: it.id,
      jenis_produksi: it.jenis_produksi,
      jumlah: rincian.length > 0 ? sumRincian(rincian) : it.jumlah,
      ...(namaModel ? { nama_model: namaModel } : {}),
      ...(it.bagian ? { bagian: it.bagian } : {}),
      ...(it.mockup_url ? { mockup_url: it.mockup_url } : {}),
      ...(catatan ? { catatan } : {}),
      ...(rincian.length > 0 ? { rincian } : {}),
    };
  });
}

/** Ringkasan satu blok rincian: "25×3 · 26×5". */
export function ukuranSummary(r: ItemRincian): string {
  return r.ukuran
    .filter((u) => (Number(u.jumlah) || 0) > 0)
    .map((u) => `${u.ukuran}×${u.jumlah}`)
    .join(" · ");
}

/**
 * Upload mockup pesanan umum yang baru dipilih, lalu kembalikan item dengan `mockup_url` terisi.
 * Berurutan (nama file memakai jam, jadi tidak boleh paralel). `null` bila ada yang gagal diupload.
 */
export async function uploadMockups(
  items: OrderItem[],
  files: Record<string, File>,
  upload: (file: File, label: string) => Promise<string | null>,
): Promise<OrderItem[] | null> {
  const out: OrderItem[] = [];
  let n = 0;
  for (const it of items) {
    const file = files[it.id];
    if (!file) {
      out.push(it);
      continue;
    }
    n += 1;
    const url = await upload(file, `Mockup${n}`);
    if (!url) return null;
    out.push({ ...it, mockup_url: url });
  }
  return out;
}