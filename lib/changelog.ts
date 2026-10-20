// lib/changelog.ts
//
// Info aplikasi (Tentang App, /api/version, banner "ada pembaruan").
// Setiap rilis: naikkan `version` di APP_INFO DAN tambah entri di atas CHANGELOG.
// Versi ini dibandingkan di browser user untuk memunculkan banner pembaruan.

export const APP_INFO = {
  name: "LCO SuperApp Konveksi",
  version: "V.1.14",
  purpose: "Aplikasi produksi Konveksi, Langitan.co.",
  creator: "abdllahmajid",
  creationDate: "17 Oktober 2026",
  notes: "Keuangan: tagihan per pesanan, pencatatan & verifikasi pembayaran",
};

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.14",
    date: "2026-10-20",
    changes: [
      "Keuangan langkah 6.4: layar Tagihan dan Pembayaran sudah bisa dipakai. Tab Tagihan menampilkan tagihan, terbayar, dan sisa tiap pesanan (filter status, cari kode/pemesan, penanda lewat jatuh tempo); dari sini tagihan diterbitkan atau direvisi dengan harga per item.",
      "Tab Transaksi (buku pembayaran dengan filter tanggal & status) dan tab Verifikasi (antrean pembayaran yang menunggu, untuk yang berhak memverifikasi): catat pembayaran + bukti, verifikasi, tolak, void (wajib alasan), dan lihat bukti.",
      "Detail Pesanan kini punya kartu Harga & Pembayaran bagi user yang punya izin Keuangan → Lihat. Menu Keuangan juga memuat tab Akun & Pengaturan (hanya baca).",
      "Tidak ada migration baru. Ekspor Excel dan invoice cetak menyusul di langkah 6.7.",
    ],
  },
  {
    version: "1.13",
    date: "2026-10-19",
    changes: [
      "Keuangan langkah 6.3 (Pembayaran): mesin pembayaran sudah ada di database dan API — catat DP/cicilan/pelunasan/refund, verifikasi atau tolak, dan void (koreksi) dengan alasan. Transaksi tidak pernah dihapus. Layarnya menyusul di langkah 6.4.",
      "Aturan uang dijaga database: bukti wajib untuk transfer/QRIS, pembayaran tidak boleh melebihi tagihan, refund tidak boleh melebihi uang masuk, dan revisi tagihan tidak boleh menurunkan total di bawah uang yang sudah terverifikasi. Status tagihan (Belum Bayar, DP, Lunas, Kelebihan Bayar) kini dihitung dari pembayaran.",
      "Butuh migration 011_finance_payments.sql di Supabase (setelah 010). Migration ini juga membuat bucket privat finance-proofs untuk bukti pembayaran.",
    ],
  },
  {
    version: "1.12",
    date: "2026-10-19",
    changes: [
      "Keuangan langkah 6.2 (Tagihan): mesin tagihan per pesanan sudah ada di database dan API — tagihan dihitung dari baris item pesanan × harga per pcs, bisa direvisi (wajib beralasan), versi lama tersimpan, dan tidak bisa diubah atau dihapus. Layar untuk menerbitkan tagihan menyusul di langkah 6.4.",
      "Pesanan yang sudah punya tagihan tidak bisa dihapus permanen dari Sampah (tetap boleh disimpan di Sampah).",
      "Butuh migration 010_finance_invoices.sql di Supabase (setelah 009).",
    ],
  },
  {
    version: "1.11",
    date: "2026-10-19",
    changes: [
      "Menu Keuangan mulai dibangun bertahap. Langkah 6.1 (fondasi): akun kas/bank, kategori pengeluaran, pengaturan, dan log audit yang tidak bisa diubah. Menu Keuangan tampil untuk user yang punya izin Keuangan → Lihat; isinya baru ringkasan fondasi.",
      "Butuh migration 009_finance_foundation.sql di Supabase. Akun, kategori, dan pengaturan awalnya adalah nilai bawaan — sesuaikan sebelum dipakai sungguhan.",
    ],
  },
  {
    version: "1.10",
    date: "2026-10-19",
    changes: [
      "Gaji admin kini bulanan seperti di Sablon: semua user ber-role Admin otomatis muncul di tab Admin menu Gaji & Upah, tanpa perlu ada closing. Gaji = gaji tetap per bulan (berlaku sampai diubah, bulan lalu tidak ikut berubah) + bonus closing + bonus tambahan manual.",
      "Bonus closing tidak lagi otomatis ke pembuat pesanan: pilih sendiri pesanan selesai bulan itu sebagai closing admin (opsional). Rumus bonus tetap: Rp per closing + Rp per pcs di atas batas pcs (Config Harga).",
      "Butuh migration 008_admin_salary.sql di Supabase (tabel gaji tetap, closing, bonus manual).",
    ],
  },
  {
    version: "1.9",
    date: "2026-10-19",
    changes: [
      "Gaji produksi diubah: tidak ada lagi pembagian 70% PJ / 30% tim. PJ dan anggota tim menggarap pcs pesanan sama banyak (pcs dibagi rata). Anggota digaji pcs bagiannya × rate Jahit / Produksi, PJ digaji pcs bagiannya × rate Gaji PJ (boleh sedikit berbeda).",
      "Config Harga: kolom Potong Kain diganti Gaji PJ (yang memotong kain adalah orang yang menjahit). Aturan persen PJ dihapus; sisa pengaturan hanya bonus admin. Rate Potong Kain lama tersimpan di riwayat tetapi tidak dipakai lagi — isi Gaji PJ untuk tiap jenis produksi.",
      "Penanggung Jawab (PJ) kini wajib diisi di Pesanan Baru dan Edit Pesanan. Pesanan lama yang belum punya PJ harus diisi PJ-nya saat diedit.",
    ],
  },
  {
    version: "1.8",
    date: "2026-10-19",
    changes: [
      "Menu baru Config Harga: atur rate gaji per pcs untuk tiap jenis produksi dan tahap (Potong Kain, Jahit, QC, Packing), plus aturan bagian PJ dan bonus admin. Setiap perubahan disimpan sebagai riwayat dengan tanggal berlaku, jadi gaji bulan lalu tidak ikut berubah.",
      "Menu baru Gaji & Upah: gaji per bulan untuk Produksi (PJ + anggota tim), Tim QC (dibagi rata), dan bonus Admin. Ada rincian per pesanan, tandai lunas, dan cetak slip gaji (satu atau banyak sekaligus, bisa disimpan sebagai PDF). Pesanan yang belum punya PJ/tim atau rate-nya belum diatur ditandai di bagian peringatan.",
      "Form Pesanan Baru dan Edit Pesanan kini punya pilihan Penanggung Jawab (PJ). PJ tampil di Detail Pesanan dan perubahannya tercatat di Log Aktivitas.",
      "Susunan PJ dan tim disalin ke pesanan saat produksi selesai, sehingga mengubah anggota tim di Pengaturan tidak mengubah gaji pesanan lama. Butuh menjalankan migration 007.",
    ],
  },
  {
    version: "1.7",
    date: "2026-10-18",
    changes: [
      "Tab baru Pengaturan → Tim: buat tim produksi (mis. Tim Jahit Kaos, Tim Jahit Seragam) dari user yang ada di tab Pengguna. Tiap tim tampil sebagai kartu berisi avatar anggotanya; bisa diubah, dinonaktifkan, atau dihapus. Satu user boleh masuk ke beberapa tim.",
      "Form Pesanan Baru dan Edit Pesanan kini punya pilihan Tim pengerjaan (boleh dikosongkan). Tim beserta avatar anggotanya tampil di Detail Pesanan, dan perubahan tim tercatat di Log Aktivitas.",
      "Hak akses: mengganti tim sebuah pesanan hanya bisa oleh yang boleh mengedit pesanan; user yang dihapus otomatis keluar dari semua tim. Butuh menjalankan migration 006.",
    ],
  },
  {
    version: "1.6",
    date: "2026-10-18",
    changes: [
      "Dashboard kini berisi ringkasan produksi: jumlah pesanan berjalan, telat, mepet deadline, kendala/revisi, siap kirim, dan selesai bulan ini; posisi pesanan per tahap; daftar pesanan yang perlu perhatian (klik untuk membuka detail); jumlah pcs per jenis produksi; dan grafik 6 bulan terakhir.",
      "Perbaikan: hitungan \"Telat\" dan \"Mepet\" sebelumnya meleset sehari (pesanan yang deadline-nya kemarin belum dianggap telat). Kini memakai tanggal kalender: lewat kemarin = Telat, deadline hari ini sampai 2 hari lagi = Mepet. Notifikasi telat/mepet ikut diperbaiki, termasuk pesan \"deadline hari ini\".",
      "Hak akses diperketat di database: kode pesanan dan pembuat tidak bisa diubah; data pemesan, deadline, dan jumlah hanya bisa diubah oleh yang berhak mengedit pesanan; log aktivitas hanya bisa dihapus supervisor. Butuh menjalankan migration 005.",
      "Pembersihan kode kecil (import dan variabel yang tidak terpakai).",
    ],
  },
  {
    version: "1.5",
    date: "2026-10-18",
    changes: [
      "Catatan produksi di detail pesanan: kotak Catatan di kartu Produksi, QC & Packing, dan Pengiriman. Tulis catatan, lihat siapa penulisnya dan kapan; catatan hanya bisa dihapus oleh penulisnya atau supervisor.",
      "Menu baru Catatan Rapat: rekap semua catatan per pesanan untuk rapat mingguan (Minggu ini, Minggu lalu, atau Semua), bisa dicetak atau disimpan sebagai PDF. Kode pesanan bisa diklik untuk membuka detailnya.",
      "Perbaikan: file sisa desain lama (StepCard) yang membuat build gagal sudah dihapus.",
    ],
  },
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
