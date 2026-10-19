// types/salary.ts
//
// Model data Config Harga & Gaji (Bagian 5). Lihat docs/PRD.md §5 dan §20.

/** Satu baris riwayat harga (tabel pricing_configs). Baris TIDAK pernah diubah, hanya ditambah. */
export interface PricingConfig {
  id: number;
  /** PRODUKSI = rate per pcs per (jenis produksi, tahap) · PARAMETER = angka aturan (persen PJ, bonus admin) */
  category: "PRODUKSI" | "PARAMETER" | string;
  /** PRODUKSI: "{jenis_produksi.value}:{step_key}" (mis. kaos_polo:produksi_massal) · PARAMETER: nama aturan */
  key_name: string;
  display_name: string;
  unit: string;
  value_amount: number;
  /** YYYY-MM-DD — berlaku mulai tanggal ini */
  effective_date: string;
  created_by?: string | null;
  created_at?: string;
}

/** Baris yang dikirim saat menyimpan perubahan harga. */
export interface PricingRowInput {
  category: "PRODUKSI" | "PARAMETER";
  key_name: string;
  display_name: string;
  unit: string;
  value_amount: number;
}

/** Tiga kelompok penerima gaji. */
export type SalaryKategori = "produksi" | "qc" | "admin";

/** Status "sudah dibayar" satu orang untuk satu bulan & kategori (tabel salary_payments). */
export interface SalaryPayment {
  id?: string;
  user_id: string;
  user_name?: string | null;
  /** 1–12 (bukan 0–11 seperti Date.getMonth) */
  period_month: number;
  period_year: number;
  kategori: SalaryKategori;
  /** nominal yang dicatat saat ditandai lunas */
  total_amount: number;
  paid_at: string;
  paid_by?: string | null;
}

/**
 * Salinan susunan pekerja pesanan, dibuat database saat tahap produksi selesai
 * (kolom orders.crew_snapshot, migration 007). Dipakai gaji supaya perubahan
 * anggota tim di kemudian hari tidak mengubah gaji pesanan lama.
 */
export interface CrewSnapshot {
  pj: string | null;
  team_id: string | null;
  member_ids: string[];
  at?: string;
  backfill?: boolean;
}

/** Gaji tetap bulanan satu orang (tabel salary_fixed, migration 008). Baris hanya ditambah. */
export interface SalaryFixed {
  id: number;
  user_id: string;
  amount: number;
  /** YYYY-MM-DD — berlaku mulai tanggal ini sampai ada baris yang lebih baru */
  effective_date: string;
}

/** Bonus tambahan manual satu bulan (tabel salary_bonus_manual). */
export interface SalaryBonus {
  id: number;
  user_id: string;
  /** 1–12 */
  period_month: number;
  period_year: number;
  label: string;
  amount: number;
}

/** Pesanan yang dipilih sebagai closing seorang admin pada satu bulan (tabel salary_closings). */
export interface SalaryClosing {
  id: number;
  user_id: string;
  order_id: string;
  /** 1–12 */
  period_month: number;
  period_year: number;
}
