-- 023_production_types_warna.sql  (Jenis Produksi — Varian 2: warna)
--
-- Varian jenis produksi dipisah jadi dua kelompok pilihan:
--   production_types.varian        : Varian 1 (model) — mis. Panjang, Pendek, 1/3. Memengaruhi harga.
--   production_types.varian_warna  : Varian 2 (warna) — mis. Abu-abu, Coklat, Biru, Putih, Pramuka. Tidak memengaruhi harga.
-- Rincian pesanan (orders.items[].rincian) menyimpan `varian` dan `warna` terpisah di jsonb — tidak perlu kolom baru.
--
-- Data lama TIDAK diubah: jenis yang daftar varian-nya berisi warna (mis. Celana Sekolah) tetap bekerja seperti
-- biasa sampai dibuka di Pengaturan → Jenis Produksi (form memisahkan warna ke Varian 2 saat Simpan).
-- Aman dijalankan ulang. Jalankan di SQL Editor sebagai postgres.

alter table monitoring_konveksi.production_types
  add column if not exists varian_warna jsonb not null default '[]';

notify pgrst, 'reload schema';
