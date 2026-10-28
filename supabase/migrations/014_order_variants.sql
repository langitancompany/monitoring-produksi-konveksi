-- 014_order_variants.sql
--
-- Varian & daftar ukuran per jenis produksi (utama), dipakai form Approval:
--   production_types.varian : ["Abu-abu","Pramuka",...]  (kosong = tanpa varian)
--   production_types.ukuran : ["25","26",...]            (kosong = jumlah satu angka)
-- Rincian pesanan disimpan di orders.items[].rincian (jsonb, tidak perlu kolom baru);
-- orders.items[].jumlah tetap total pcs per jenis, jadi gaji & tagihan tidak berubah.
-- Aman dijalankan ulang. Nilai awal hanya diisi bila masih kosong.

alter table monitoring_konveksi.production_types
  add column if not exists varian jsonb not null default '[]',
  add column if not exists ukuran jsonb not null default '[]';

update monitoring_konveksi.production_types
set ukuran = (select jsonb_agg(n::text order by n) from generate_series(25, 43) n),
    varian = '["Abu-abu","Pramuka","Biru","Lainnya"]'
where value = 'celana_sekolah' and ukuran = '[]'::jsonb;

-- Ukuran awal jenis lain: tebakan umum, ubah di Pengaturan → Jenis Produksi.
update monitoring_konveksi.production_types
set ukuran = '["S","M","L","XL","XXL","3XL"]'
where value in ('seragam_sekolah','kaos_polos','kaos_polo','celana_training','celana_pendek')
  and ukuran = '[]'::jsonb;
