// types/order.ts
//
// Model data pesanan konveksi. Lihat docs/PRD.md bagian "Model Data".

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
}

/** Satu baris item dalam pesanan (mis. Seragam Sekolah × 120). Dasar hitung gaji per item. */
export interface OrderItem {
  id: string;
  /** value dari ProductionTypeData */
  jenis_produksi: string;
  jumlah: number;
  catatan?: string;
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
  created_by?: string | null;
  deleted_at?: string | null;
}

/** Data dari form "Pesanan baru". */
export interface NewOrderInput {
  kategori: OrderKategori;
  nama_pemesan: string;
  no_hp: string;
  alamat_pemesan: string;
  jumlah: number;
  tanggal_masuk: string;
  deadline: string;
  catatan_pesanan: string;
  /** hanya non_utama */
  jenis_produksi?: string;
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
}

/** Data dari form Approval pesanan utama. */
export interface ApprovalInput {
  items: OrderItem[];
  /** file approval yang baru dipilih (diupload saat simpan) */
  file?: File | null;
  /** atau tautan (mis. Google Drive) */
  link?: string;
  catatan?: string;
}
