// types/order.ts
//
// Model data pesanan konveksi. Lihat docs/PRD.md bagian "Model Data".

import type { CrewSnapshot } from "@/types/salary";

/** utama = jahitan reguler (seragam, celana, kaos, ...); non_utama = selempang wisuda, permak, dst. */
export type OrderKategori = "utama" | "non_utama";

export type OrderStatus =
  | "Pesanan Masuk"
  | "On Process"
  | "Finishing"
  | "Kirim"
  | "Selesai"
  | "Revisi"
  | "Ada Kendala"
  | "Telat";

/** Master data jenis produksi / kategori pesanan (tabel production_types, diatur di Pengaturan). */
export interface ProductionTypeData {
  id: string;
  name: string;
  /** kode tetap yang disimpan di pesanan (huruf kecil_underscore). Jangan diubah setelah dipakai. */
  value: string;
  kategori: OrderKategori;
  is_active: boolean;
  sort_order?: number | null;
  /** pilihan varian jenis ini (mis. Celana Sekolah: Abu-abu, Pramuka, Biru, Lainnya); kosong = tanpa varian */
  varian?: string[] | null;
  /** daftar ukuran jenis ini (mis. 25–43); kosong = jumlah diisi satu angka saja */
  ukuran?: string[] | null;
  /**
   * Pesanan umum (tender/instansi, desain khusus): tiap pesanan punya nama model, bagian
   * (atasan/bawahan), dan mockup sendiri; boleh muncul beberapa kali dalam satu pesanan.
   */
  is_custom?: boolean | null;
  /** hanya is_custom: daftar bagian beserta ukurannya, mis. Atasan S–3XL, Bawahan 21–41 */
  bagian?: BagianUkuran[] | null;
}

/** Satu bagian pakaian pada jenis pesanan umum beserta daftar ukurannya. */
export interface BagianUkuran {
  nama: string;
  ukuran: string[];
}

/** Jumlah pesanan untuk satu ukuran (mis. ukuran "28" × 5). */
export interface UkuranQty {
  ukuran: string;
  jumlah: number;
}

/**
 * Satu blok rincian dalam item: satu varian (mis. "Pramuka") beserta jumlah per ukuran.
 * Jenis tanpa varian memakai satu blok saja dengan `varian` kosong.
 */
export interface ItemRincian {
  id: string;
  /** salah satu nilai ProductionTypeData.varian; kosong bila jenis tanpa varian */
  varian?: string;
  /** nama bebas bila varian = "Lainnya" */
  varian_lain?: string;
  ukuran: UkuranQty[];
}

/**
 * Satu baris item dalam pesanan (mis. Celana Sekolah × 120). Dasar hitung gaji dan tagihan per jenis.
 * `jumlah` SELALU total seluruh pcs jenis ini; bila `rincian` ada, jumlah = total semua ukuran di dalamnya.
 */
export interface OrderItem {
  id: string;
  /** value dari ProductionTypeData */
  jenis_produksi: string;
  jumlah: number;
  catatan?: string;
  /** rincian varian × ukuran (opsional; jenis tanpa daftar ukuran cukup memakai jumlah) */
  rincian?: ItemRincian[];
  /** hanya pesanan umum: nama model/desain (mis. "Baju Dinas Harian") */
  nama_model?: string;
  /** hanya pesanan umum: nama bagian, salah satu ProductionTypeData.bagian[].nama */
  bagian?: string;
  /** hanya pesanan umum: gambar mockup yang dilihat tim produksi */
  mockup_url?: string;
}

export type StepType =
  | "form" // diisi lewat form (Approval / Detail pesanan)
  | "upload_image" // wajib upload foto (Mockup, Packing, bukti kirim/terima)
  | "status_update" // tombol "tandai selesai" (Potong Kain, Produksi Massal)
  | "qc"; // lolos / gagal + catatan

export interface ProductionStep {
  id: string;
  /** kunci tetap dari template — dipakai logika status & gaji, jangan diubah */
  key: string;
  name: string;
  type: StepType;
  /** teks tombol aksi, mis. "Selesai Potong" */
  actionLabel?: string;
  isCompleted: boolean;
  fileUrl?: string | null;
  uploadedBy?: string;
  timestamp?: string;
  /** ISO 8601 — kapan tahap selesai (dasar bulan gaji) */
  completedAt?: string | null;
  /** khusus type 'qc': hasil pemeriksaan */
  qc?: { passed: boolean | null; notes: string; checkedBy?: string };
  /**
   * ID user (users.id) yang mengerjakan tahap ini — dasar gaji produksi (Bagian 5).
   * Disimpan ID, bukan nama, supaya tetap benar kalau nama user diganti.
   */
  doneBy?: string[];
  /** catatan singkat saat tahap diselesaikan (mis. catatan Approval) */
  note?: string;
}

export interface KendalaNote {
  id: string;
  notes: string;
  reportedBy: string;
  timestamp: string;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedTimestamp?: string;
  buktiFile?: string | null;
}

export interface Order {
  id: string;
  created_at: string;
  /** diisi database tiap update; dipakai untuk mendeteksi dua orang mengubah pesanan bersamaan */
  updated_at?: string;
  kode_produksi: string;
  kategori: OrderKategori;
  nama_pemesan: string;
  no_hp: string;
  alamat_pemesan?: string | null;
  jumlah: number;
  tanggal_masuk: string;
  deadline: string;
  /** utama: diisi saat Approval · non_utama: dipilih saat buat pesanan */
  jenis_produksi?: string | null;
  items: OrderItem[];
  catatan_pesanan?: string | null;
  status: OrderStatus;
  steps: ProductionStep[];
  kendala: KendalaNote[];
  assigned_to?: string | null;
  /** tim yang mengerjakan (tabel teams, Pengaturan → Tim); kosong = belum ditentukan */
  team_id?: string | null;
  /**
   * Salinan PJ + anggota tim saat tahap produksi selesai (diisi database, migration 007).
   * Dasar pembagian gaji produksi; kosong selama produksi belum selesai.
   */
  crew_snapshot?: CrewSnapshot | null;
  created_by?: string | null;
  deleted_at?: string | null;
}

/** Data dari form "Pesanan baru". */
export interface NewOrderInput {
  kategori: OrderKategori;
  nama_pemesan: string;
  no_hp: string;
  alamat_pemesan: string;
  /** non_utama: wajib diisi · utama: 0 (jumlah baru ada setelah rincian Approval diisi) */
  jumlah: number;
  tanggal_masuk: string;
  deadline: string;
  catatan_pesanan: string;
  /** hanya non_utama */
  jenis_produksi?: string;
  /** tim pengerjaan (opsional) */
  team_id?: string | null;
  /** penanggung jawab / PJ (users.id) — WAJIB di form; dasar gaji produksi (tarif Gaji PJ), Bagian 5 */
  assigned_to?: string | null;
}

/** Data dari form "Edit pesanan" (hanya field informasi, bukan tahap/status). */
export interface EditOrderInput {
  nama_pemesan: string;
  no_hp: string;
  alamat_pemesan: string;
  tanggal_masuk: string;
  deadline: string;
  catatan_pesanan: string;
  jumlah: number;
  /** non_utama: kategori pemesanan; utama: diabaikan (ikut item pertama) */
  jenis_produksi?: string | null;
  /** hanya dipakai pesanan utama yang Approval-nya sudah selesai */
  items?: OrderItem[];
  /** mockup pesanan umum yang baru dipilih, kunci = item.id (diupload saat simpan) */
  mockups?: Record<string, File>;
  /** tim pengerjaan; undefined = jangan ubah, null = kosongkan */
  team_id?: string | null;
  /** PJ; undefined = jangan ubah, null = kosongkan */
  assigned_to?: string | null;
}

/** Data dari form Approval pesanan utama. */
export interface ApprovalInput {
  items: OrderItem[];
  /** catatan admin; tampil di Form Approval otomatis (lembar dibuat dari data pesanan, tanpa upload file) */
  catatan?: string;
  /** mockup pesanan umum yang baru dipilih, kunci = item.id (diupload saat simpan) */
  mockups?: Record<string, File>;
}
