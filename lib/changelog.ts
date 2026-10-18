// lib/changelog.ts
//
// Info aplikasi (Tentang App, /api/version, banner "ada pembaruan").
// Setiap rilis: naikkan `version` di APP_INFO DAN tambah entri di atas CHANGELOG.
// Versi ini dibandingkan di browser user untuk memunculkan banner pembaruan.

export const APP_INFO = {
  name: "LCO SuperApp Konveksi",
  version: "V.1.4",
  purpose: "Aplikasi produksi Konveksi, Langitan.co.",
  creator: "abdllahmajid",
  creationDate: "17 Oktober 2026",
  notes: "Arsip & pemantauan: Pesanan Selesai, Kalender, Log Aktivitas, Sampah",
};

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.4",
    date: "2026-10-18",
    changes: [
      "Menu baru Pesanan Selesai: arsip pesanan yang sudah rampung, dengan filter kategori, bulan selesai, dan pencarian, plus ringkasan total pesanan, total pakaian, dan persentase selesai tepat waktu.",
      "Menu baru Kalender: deadline dan tanggal masuk pesanan, ditambah agenda tim yang bisa dicatat sendiri (jam, tempat, warna). Klik pesanan di kalender untuk membuka detailnya.",
      "Menu baru Log Aktivitas: jejak semua kejadian pesanan dengan filter kategori dan pencarian; kode pesanan bisa diklik untuk membuka detail.",
      "Menu baru Sampah: pesanan yang dihapus bisa dipulihkan, atau dihapus permanen beserta semua file fotonya (khusus yang berhak). Log aktivitasnya tetap tersimpan sebagai jejak.",
      "Tombol Kembali di detail pesanan kini pulang ke menu asal (Pesanan Selesai, Kalender, atau Log Aktivitas).",
    ],
  },
  {
    version: "1.3",
    date: "2026-10-18",
    changes: [
      "Detail pesanan kini interaktif dengan 4 kartu seperti Sablon: 01 Approval, 02 Produksi (Potong Kain & Jahit), 03 QC & Packing, 04 Pengiriman — dikerjakan berurutan sesuai hak akses.",
      "Daftar pesanan kini berbentuk papan Kanban (Pesanan Masuk, Produksi, Finishing, Pengiriman) seperti Sablon, dengan kartu & progress bar di HP, filter, urutan paling mendesak, dan tombol hapus.",
      "Semua tahap dikerjakan dengan upload foto; nama pengunggah dan waktunya tampil di setiap tahap.",
      "QC gagal wajib bercatatan dan membuka kembali tahap Produksi; upload foto bukti dikompres otomatis; laporan kendala bisa disertai foto.",
      "Edit data pesanan dan hapus pesanan (dipindah ke Sampah). Semua aksi tercatat di log dan memicu notifikasi.",
      "Notifikasi ke banyak penerima kini diproses di server sehingga sampai ke semua role terkait; perubahan bersamaan oleh dua orang pada satu pesanan dicegah.",
    ],
  },
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
