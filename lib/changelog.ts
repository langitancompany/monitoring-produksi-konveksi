// lib/changelog.ts
//
// Info aplikasi (Tentang App, /api/version, banner "ada pembaruan").
// Setiap rilis: naikkan `version` di APP_INFO DAN tambah entri di atas CHANGELOG.
// Versi ini dibandingkan di browser user untuk memunculkan banner pembaruan.

export const APP_INFO = {
  name: "LCO SuperApp Konveksi",
  version: "V.1.2",
  purpose: "Aplikasi produksi Konveksi, Langitan.co.",
  creator: "abdllahmajid",
  creationDate: "17 Oktober 2026",
  notes: "Pengelolaan user via API, pesanan utama & non-utama",
};

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2",
    date: "2026-10-17",
    changes: [
      "Pengaturan → Pengguna: tambah, ubah, dan hapus user kini lewat server — akun login dan profil dibuat dalam satu langkah, memakai Email Login.",
      "Password tidak lagi disimpan di tabel user maupun dimuat ke browser; email yang sudah punya akun di aplikasi lain (mis. Sablon) otomatis ditautkan; akun login tidak ikut terhapus bila masih dipakai aplikasi lain.",
    ],
  },
  {
    version: "1.1",
    date: "2026-10-17",
    changes: [
      "Menu Pesanan Utama dan Pesanan Non-Utama: daftar dengan filter status, bulan, dan pencarian, serta form pesanan baru (close order).",
      "Pengaturan → Jenis Produksi: jenis jahitan utama (Seragam Sekolah, Celana Sekolah, Kaos Polos, Kaos Polo, Celana Training, Celana Pendek) dan kategori non-utama (Selempang Wisuda, Permak/Jahit) bisa ditambah, diubah, dan dinonaktifkan.",
      "Tahapan produksi per jenis pesanan tersimpan di pesanan; status dihitung otomatis dari tahap. Detail pesanan tampil hanya-baca (aksi tahap menyusul di bagian berikutnya).",
    ],
  },
  {
    version: "1.0",
    date: "2026-10-17",
    changes: [
      "Kerangka awal aplikasi Konveksi, dipisahkan dari aplikasi Sablon: login, dashboard, pengaturan (pengguna, pengumuman, notifikasi, backup), profil, dan notifikasi push.",
      "Satu Supabase dengan schema terpisah per unit usaha; login berlaku lintas subdomain langitan.co.",
    ],
  },
];
