// lib/inventory/warna.ts
//
// Fungsi MURNI (tanpa React / Supabase) untuk menyatukan penulisan warna. Dipakai isian warna di form
// pesanan (saran saat mengetik + "mirip dengan …") dan endpoint /api/inventori/warna.
//
// Mengapa perlu: identitas stok = jenis + varian + warna + ukuran, dan buku besar stok tidak bisa diubah
// setelah diverifikasi. Salah ketik ("Hitm") akan menjadi baris stok sendiri selamanya, jadi dicegah di
// saat mengetik, bukan diperbaiki sesudahnya.

export interface WarnaOption {
  /** Ejaan baku (dari buku besar stok bila ada, selain itu dari pesanan). */
  warna: string;
  /** Berapa kali dipakai (stok + pesanan): makin sering makin atas saat kolom kosong. */
  n: number;
  /** Jenis produksi yang pernah memakai warna ini. */
  jenis: string[];
  /** Sudah tercatat di Stok Barang Jadi. */
  stok: boolean;
}

/** Sama dengan normalisasi kunci stok (sku.ts): huruf kecil, spasi dirapatkan, `|` jadi spasi. */
export function normWarna(v: string | null | undefined): string {
  return (v ?? "").replace(/\|/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** "abu abu", "abu-abu", "Abu  Abu" → "abuabu": beda tanda baca/spasi dianggap warna yang sama. */
const compact = (v: string): string => normWarna(v).replace(/[\s\-_.]/g, "");

/** Jarak edit Damerau (tukar dua huruf bersebelahan = 1). Berhenti dini bila sudah melewati `max`. */
export function editDistance(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Batas salah ketik yang masih dianggap "mirip", menurut panjang yang diketik. */
const typoLimit = (len: number): number => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

/**
 * Skor kemiripan (kecil = lebih mirip, Infinity = tidak mirip):
 *   0      sama persis (atau hanya beda huruf besar/kecil, spasi, tanda hubung)
 *   1–2    diawali yang diketik ("hi" → "Hitam"), atau salah satu kata diawali yang diketik
 *   3      mengandung yang diketik
 *   3.5–4  awalan hampir sama ("hitm" ke awalan "hita…")
 *   4–7    salah ketik: hilang/lebih/salah/tertukar huruf ("hitm", "htiam" → "Hitam")
 */
export function warnaScore(input: string, candidate: string): number {
  const q = normWarna(input);
  const c = normWarna(candidate);
  if (!q || !c) return Infinity;
  if (q === c || compact(q) === compact(c)) return 0;
  if (c.startsWith(q)) return 1 + (c.length - q.length) / 100;
  if (c.split(" ").some((w) => w.startsWith(q))) return 2;
  if (c.includes(q)) return 3;

  const qc = compact(q);
  const cc = compact(c);
  const t = typoLimit(qc.length);
  if (t > 0) {
    const whole = editDistance(qc, cc, t);
    if (whole <= t) return 4 + whole;
    const words = c.split(" ").filter(Boolean);
    for (const w of words) {
      const d = editDistance(qc, compact(w), t);
      if (d <= t) return 4 + d;
    }
    if (qc.length >= 4) {
      const pre = editDistance(qc, cc.slice(0, qc.length), 1);
      if (pre <= 1) return 3.5 + pre / 10;
    }
  }
  return Infinity;
}

export interface SuggestOpts {
  limit?: number;
  /** Jenis produksi yang sedang diisi: warna yang pernah dipakai jenis ini diutamakan. */
  jenis?: string;
}

/**
 * Saran saat mengetik. Kolom kosong → yang paling sering dipakai (jenis ini dulu).
 * Ada isi → urut dari paling mirip; seri dibedakan jenis yang sama lalu pemakaian terbanyak.
 */
export function suggestWarna(input: string, options: WarnaOption[], opts: SuggestOpts = {}): WarnaOption[] {
  const limit = opts.limit ?? 6;
  const sameJenis = (o: WarnaOption) => (opts.jenis && o.jenis.includes(opts.jenis) ? 0 : 1);
  const q = normWarna(input);
  if (!q) {
    return [...options].sort((a, b) => sameJenis(a) - sameJenis(b) || b.n - a.n || a.warna.localeCompare(b.warna, "id")).slice(0, limit);
  }
  return options
    .map((o) => ({ o, s: warnaScore(input, o.warna) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => a.s - b.s || sameJenis(a.o) - sameJenis(b.o) || b.o.n - a.o.n || a.o.warna.localeCompare(b.o.warna, "id"))
    .slice(0, limit)
    .map((x) => x.o);
}

/** Warna yang sudah ada dan dianggap sama dengan `input` (beda huruf besar/kecil, spasi, tanda hubung saja). */
export function exactWarna(input: string, options: WarnaOption[]): WarnaOption | null {
  const q = normWarna(input);
  if (!q) return null;
  return options.find((o) => warnaScore(input, o.warna) === 0) ?? null;
}

/**
 * Untuk peringatan "Mirip dengan …" setelah selesai mengetik: hanya yang tampak salah ketik, atau awalan pendek
 * (≤ 3 huruf, kemungkinan belum selesai). Awalan panjang ("Biru" vs "Biru Dongker") tidak dianggap salah.
 */
export function closestWarna(input: string, options: WarnaOption[]): WarnaOption | null {
  const q = normWarna(input);
  if (!q || exactWarna(input, options)) return null;
  let best: { o: WarnaOption; s: number } | null = null;
  for (const o of options) {
    const s = warnaScore(input, o.warna);
    if (!Number.isFinite(s)) continue;
    const typo = s >= 3.5;
    const shortPrefix = s < 3 && q.length <= 3;
    if (!typo && !shortPrefix) continue;
    if (!best || s < best.s || (s === best.s && o.n > best.o.n)) best = { o, s };
  }
  return best?.o ?? null;
}

/** Warna baru yang seluruhnya huruf kecil dirapikan: "hijau botol" → "Hijau Botol". Lainnya dibiarkan. */
export function tidyWarna(input: string): string {
  const t = input.replace(/\s+/g, " ").trim();
  if (!t || t !== t.toLowerCase()) return t;
  return t.replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase());
}

/** Nilai yang disimpan setelah selesai mengetik: ejaan baku bila sudah ada, selain itu dirapikan. */
export function canonicalWarna(input: string, options: WarnaOption[]): string {
  const hit = exactWarna(input, options);
  return hit ? hit.warna : tidyWarna(input);
}

/** Gabungkan daftar dari server dengan warna yang baru diketik di form (belum tersimpan). */
export function withLocalWarna(options: WarnaOption[], local: Array<string | null | undefined>): WarnaOption[] {
  const have = new Set(options.map((o) => compact(o.warna)));
  const extra: WarnaOption[] = [];
  for (const raw of local) {
    const w = tidyWarna(raw ?? "");
    const k = compact(w);
    if (!k || have.has(k)) continue;
    have.add(k);
    extra.push({ warna: w, n: 1, jenis: [], stok: false });
  }
  return extra.length ? [...options, ...extra] : options;
}