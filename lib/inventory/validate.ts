// lib/inventory/validate.ts
//
// Pemeriksaan verifikasi stok (MURNI). Penegakan sebenarnya ada di fungsi database inv_verify_receipt;
// ini lapis pertama supaya galat jelas dan agar `expected` TIDAK PERNAH diterima dari klien
// (PRD §9, §13). Diuji di tests/inventory.test.ts.

import type { CountInput, ExpectedLine, VerifiedLine } from "./types";

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
