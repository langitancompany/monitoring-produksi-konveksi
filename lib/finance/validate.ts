// lib/finance/validate.ts
//
// Fungsi MURNI untuk Keuangan (tanpa Next.js / Supabase), jadi bisa diuji langsung
// (tests/finance.test.ts) dan dipakai server maupun browser. Penegakan yang sebenarnya
// tetap di database (fungsi fin_* dan constraint); ini lapis pertama supaya galat jelas.

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Rupiah bulat, tidak negatif, batas wajar (Rp 100 miliar). */
export const isMoney = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000_000;

/** Tanggal YYYY-MM-DD yang benar-benar ada di kalender (31 Feb ditolak). */
export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Hari ini (WIB) format YYYY-MM-DD. */
export function todayWib(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

/** Kenali tipe file bukti dari isinya (magic bytes), bukan dari nama/ekstensi yang bisa dipalsukan. */
export function sniffProof(buf: Uint8Array): { ext: string; mime: string } | null {
  const is = (...b: number[]) => b.every((v, i) => buf[i] === v);
  if (is(0xff, 0xd8, 0xff)) return { ext: "jpg", mime: "image/jpeg" };
  if (is(0x89, 0x50, 0x4e, 0x47)) return { ext: "png", mime: "image/png" };
  if (is(0x25, 0x50, 0x44, 0x46)) return { ext: "pdf", mime: "application/pdf" };
  if (is(0x52, 0x49, 0x46, 0x46) && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export const PROOF_BUCKET = "finance-proofs";
export const MAX_PROOF_BYTES = 4 * 1024 * 1024; // di bawah batas body 4,5 MB Vercel

export interface FinanceSettings {
  require_proof_non_cash: boolean;
  require_separate_verifier: boolean;
  allow_overpayment: boolean;
  auto_verify_own_payment: boolean;
  auto_approve_own_expense: boolean;
  /** 0 = bukti pengeluaran tidak diwajibkan */
  expense_proof_required_above: number;
  /** kode akun asal pembayaran gaji */
  salary_default_account_code: string;
}

/** Kunci yang dibaca dari finance_settings (baris lain, mis. gambar invoice, tidak ikut). */
export const SETTING_KEYS = [
  "require_proof_non_cash",
  "require_separate_verifier",
  "allow_overpayment",
  "auto_verify_own_payment",
  "auto_approve_own_expense",
  "expense_proof_required_above",
  "salary_default_account_code",
] as const;

/**
 * Susun pengaturan dari baris database. Nilai yang hilang / bertipe salah jatuh ke bawaan
 * yang AMAN (paling ketat): bukti wajib, tidak ada persetujuan otomatis, tidak boleh kelebihan bayar.
 */
export function parseSettings(rows: { key: string; value: unknown }[] | null | undefined): FinanceSettings {
  const m = new Map<string, unknown>((rows ?? []).map((r) => [r.key, r.value]));
  const b = (k: string, d: boolean) => (typeof m.get(k) === "boolean" ? (m.get(k) as boolean) : d);
  const n = (k: string, d: number) => {
    const v = m.get(k);
    return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : d;
  };
  const s = (k: string, d: string) => {
    const v = m.get(k);
    return typeof v === "string" && /^[A-Z0-9_]{2,20}$/.test(v) ? v : d;
  };
  return {
    require_proof_non_cash: b("require_proof_non_cash", true),
    require_separate_verifier: b("require_separate_verifier", false),
    allow_overpayment: b("allow_overpayment", false),
    auto_verify_own_payment: b("auto_verify_own_payment", false),
    auto_approve_own_expense: b("auto_approve_own_expense", false),
    expense_proof_required_above: n("expense_proof_required_above", 500_000),
    salary_default_account_code: s("salary_default_account_code", "KAS"),
  };
}

/**
 * Terjemahkan galat database. Pesan berawalan "FIN:" ditulis sengaja oleh fungsi database dan
 * aman ditampilkan (status 422); galat lain disamarkan (status 500) supaya detail skema tidak bocor.
 */
export function finError(
  error: { message?: string } | null | undefined,
  fallback = "Terjadi kesalahan pada server",
): { status: number; message: string; expected: boolean } {
  const msg = error?.message ?? "";
  if (msg.startsWith("FIN:")) return { status: 422, message: msg.slice(4).trim(), expected: true };
  return { status: 500, message: fallback, expected: false };
}
