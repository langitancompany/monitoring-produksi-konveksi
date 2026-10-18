// types/team.ts
//
// Model data Tim produksi (tabel `teams`). Lihat docs/PRD.md §5 dan §19.

/** Satu tim = nama + kumpulan user (mis. "Tim Jahit Kaos"). */
export interface TeamData {
  id: string;
  name: string;
  description?: string | null;
  /** users.id semua anggota. Satu user boleh ada di banyak tim. */
  member_ids: string[];
  /** false = tidak muncul di pilihan form pesanan; pesanan lama tetap aman */
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Data dari form tambah/ubah tim di Pengaturan → Tim. */
export interface TeamInput {
  /** kosong = tim baru */
  id?: string;
  name: string;
  description: string;
  member_ids: string[];
}
