// lib/inventory/validate.ts
//
// Pemeriksaan verifikasi stok (MURNI). Penegakan sebenarnya ada di fungsi database inv_verify_receipt;
// ini lapis pertama supaya galat jelas dan agar `expected` TIDAK PERNAH diterima dari klien
// (PRD §9, §13). Diuji di tests/inventory.test.ts.

import type { AdjustKind, AdjustLineInput, CountInput, ExpectedLine, VerifiedLine } from "./types";

export const MAX_COUNT = 1_000_000;
export const MAX_NOTE = 500;
export const MIN_NOTE = 3;

export type VerificationResult =
  | { ok: true; lines: VerifiedLine[]; total_expected: number; total_counted: number; has_diff: boolean; note: string }
  | { ok: false; error: string };

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_COUNT;

/**
 * Cocokkan hitungan fisik dari klien dengan hasil produksi yang disusun SERVER.
 *  - `sku_key` yang tidak ada di hasil produksi ditolak;
 *  - semua baris harus punya hitungan (boleh nol), tidak boleh ganda;
 *  - hitungan harus bilangan bulat ≥ 0;
 *  - bila ada selisih, alasan wajib (≥ 3 karakter).
 */
export function validateVerification(
  expected: ExpectedLine[],
  counts: unknown,
  note: unknown,
): VerificationResult {
  if (expected.length === 0) {
    return { ok: false, error: "Pesanan belum punya rincian hasil produksi. Isi rincian di Edit Pesanan dulu." };
  }
  if (!Array.isArray(counts)) return { ok: false, error: "Daftar hitungan fisik tidak valid." };

  const byKey = new Map(expected.map((l) => [l.sku_key, l]));
  const counted = new Map<string, number>();
  for (const raw of counts as CountInput[]) {
    const key = raw && typeof raw === "object" ? (raw as CountInput).sku_key : undefined;
    if (typeof key !== "string" || !byKey.has(key)) {
      return { ok: false, error: "Ada baris yang tidak ada di hasil produksi pesanan ini. Muat ulang lalu coba lagi." };
    }
    if (counted.has(key)) return { ok: false, error: "Ada baris ganda pada daftar hitungan fisik." };
    if (!isCount(raw.counted)) {
      const l = byKey.get(key)!;
      const nama = [l.jenis_name, l.varian, l.warna, l.ukuran].filter(Boolean).join(" · ");
      return { ok: false, error: `Hitungan fisik ${nama} harus bilangan bulat, tidak negatif.` };
    }
    counted.set(key, raw.counted);
  }
  for (const l of expected) {
    if (!counted.has(l.sku_key)) {
      return { ok: false, error: `Hitungan fisik belum diisi untuk ${[l.jenis_name, l.varian, l.warna, l.ukuran].filter(Boolean).join(" · ")}.` };
    }
  }

  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > MAX_NOTE) return { ok: false, error: `Alasan selisih maksimal ${MAX_NOTE} karakter.` };

  const lines: VerifiedLine[] = expected.map((l) => ({ ...l, counted: counted.get(l.sku_key)! }));
  const has_diff = lines.some((l) => l.counted !== l.expected);
  if (has_diff && text.length < MIN_NOTE) {
    return { ok: false, error: "Ada selisih antara hasil produksi dan hitungan fisik. Alasan selisih wajib diisi." };
  }

  return {
    ok: true,
    lines,
    total_expected: lines.reduce((n, l) => n + l.expected, 0),
    total_counted: lines.reduce((n, l) => n + l.counted, 0),
    has_diff,
    note: text,
  };
}

export const MAX_ADJUST_LINES = 300;

export const ADJUST_LABEL: Record<AdjustKind, string> = {
  koreksi: "Koreksi verifikasi",
  rusak: "Barang rusak",
  hilang: "Barang hilang",
  opname: "Hitung fisik (opname)",
};

export const isAdjustKind = (v: unknown): v is AdjustKind =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(ADJUST_LABEL, v);

/** Baris yang dikirim ke fungsi database: koreksi, rusak, hilang membawa `delta`; opname membawa `counted`. */
export type AdjustPayloadLine = { sku_key: string; delta: number } | { sku_key: string; counted: number };

export type AdjustmentResult =
  | { ok: true; kind: AdjustKind; reason: string; lines: AdjustPayloadLine[] }
  | { ok: false; error: string };

/**
 * Periksa bentuk permintaan penyesuaian. Apakah barangnya ada dan stoknya cukup diputuskan database,
 * yang membaca saldo di dalam transaksi.
 */
export function validateAdjustment(kind: unknown, lines: unknown, reason: unknown): AdjustmentResult {
  if (!isAdjustKind(kind)) return { ok: false, error: "Jenis penyesuaian tidak valid." };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: "Pilih minimal satu barang." };
  if (lines.length > MAX_ADJUST_LINES) return { ok: false, error: `Maksimal ${MAX_ADJUST_LINES} barang sekali simpan.` };

  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < MIN_NOTE) return { ok: false, error: "Alasan penyesuaian wajib diisi." };
  if (text.length > MAX_NOTE) return { ok: false, error: `Alasan maksimal ${MAX_NOTE} karakter.` };

  const seen = new Set<string>();
  const out: AdjustPayloadLine[] = [];
  for (const raw of lines as AdjustLineInput[]) {
    const key = raw && typeof raw === "object" ? raw.sku_key : undefined;
    if (typeof key !== "string" || key.trim() === "" || key.length > 400) {
      return { ok: false, error: "Ada baris tanpa kunci stok." };
    }
    if (seen.has(key)) return { ok: false, error: "Ada barang ganda pada daftar." };
    seen.add(key);

    if (kind === "opname") {
      if (!isCount(raw.counted)) return { ok: false, error: "Hitungan fisik harus bilangan bulat, tidak negatif." };
      out.push({ sku_key: key, counted: raw.counted });
    } else if (kind === "koreksi") {
      const d = raw.delta;
      if (typeof d !== "number" || !Number.isSafeInteger(d) || d === 0 || Math.abs(d) > MAX_COUNT) {
        return { ok: false, error: "Jumlah koreksi harus bilangan bulat, tidak nol." };
      }
      out.push({ sku_key: key, delta: d });
    } else {
      const q = raw.qty;
      if (typeof q !== "number" || !Number.isSafeInteger(q) || q <= 0 || q > MAX_COUNT) {
        return { ok: false, error: "Jumlah barang harus bilangan bulat lebih dari nol." };
      }
      out.push({ sku_key: key, delta: -q });
    }
  }
  return { ok: true, kind, reason: text, lines: out };
}

/**
 * Terjemahkan galat database. Pesan berawalan "INV:" ditulis sengaja oleh fungsi database dan aman
 * ditampilkan (status 422); "FIN:" (mis. tagihan pesanan stok) juga; galat lain disamarkan (status 500).
 */
export function invError(
  error: { message?: string } | null | undefined,
  fallback = "Terjadi kesalahan pada server",
): { status: number; message: string; expected: boolean } {
  const msg = error?.message ?? "";
  if (msg.startsWith("INV:") || msg.startsWith("FIN:")) {
    return { status: 422, message: msg.slice(4).trim(), expected: true };
  }
  return { status: 500, message: fallback, expected: false };
}

/** Lepas awalan "INV:" dari pesan galat database untuk ditampilkan di browser (mis. saat Reset QC ditolak). */
export const stripInvPrefix = (message: string): string => message.replace(/^INV:\s*/, "");
