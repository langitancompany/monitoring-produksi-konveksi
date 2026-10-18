// lib/config.ts
//
// SATU-SATUNYA tempat pengaturan identitas unit usaha ini.
// Aplikasi ini dibuat dari kerangka aplikasi Sablon. Hal-hal yang dulu
// di-hardcode ke 'monitoring_sablon' / 'sablon.langitan.co' sekarang
// dibaca dari sini (dan dari env var), supaya tiap unit usaha cukup
// mengganti env var — bukan mengedit banyak file.
//
// Catatan: NEXT_PUBLIC_* di-"tanam" ke bundle saat `next build`, jadi di
// Coolify taruh sebagai Build Variable, bukan hanya Runtime Variable.

export const UNIT = {
  /** Kode unit — harus sama dengan `code` di ALL_UNITS (hooks/useUnitAccess.ts) dan kolom direksi_access.unit_code */
  code: process.env.NEXT_PUBLIC_UNIT_CODE || "konveksi",
  label: "Konveksi",
  /** Schema Postgres milik unit ini di Supabase (satu Supabase, schema terpisah per unit) */
  dbSchema: process.env.NEXT_PUBLIC_DB_SCHEMA || "monitoring_konveksi",
  /** Domain cookie login. Samakan di semua unit supaya login berlaku lintas subdomain. */
  cookieDomain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || ".langitan.co",
  /** URL publik aplikasi ini (dipakai di link notifikasi push) */
  appUrl: (
    process.env.NEXT_PUBLIC_APP_URL || "https://konveksi.langitan.co"
  ).replace(/\/$/, ""),
} as const;

/**
 * Opsi cookie sesi login — HARUS identik di browser client, proxy.ts, dan
 * semua unit lain (aplikasi sablon, app.langitan.co), kalau tidak cookie
 * ganda/berbeda scope akan muncul dan logout tidak benar-benar bersih.
 *
 * Saat development (localhost) domain & secure dimatikan, kalau tidak
 * browser menolak cookie dan login tidak pernah berhasil di komputer sendiri.
 */
export function authCookieOptions() {
  if (process.env.NODE_ENV !== "production") return undefined;
  return {
    domain: UNIT.cookieDomain,
    path: "/",
    sameSite: "lax" as const,
    secure: true,
  };
}

/**
 * Identitas perusahaan untuk dokumen cetak (slip gaji). Alamat disalin dari slip Sablon —
 * ubah di sini bila alamat Konveksi berbeda.
 */
export const COMPANY = {
  name: "Langitan.co",
  address: "Mandungan, Widang, Tuban, Jawa Timur",
} as const;
