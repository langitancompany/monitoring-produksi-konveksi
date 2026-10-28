-- 015_pesanan_umum.sql
--
-- Jenis "Pesanan Umum" (tender/instansi, desain khusus):
--   production_types.is_custom : true = tiap pesanan punya nama model, bagian, dan mockup sendiri
--   production_types.bagian    : [{"nama":"Atasan","ukuran":["S",...]},{"nama":"Bawahan","ukuran":["21",...]}]
-- Data pesanan tetap di orders.items[] (jsonb): nama_model, bagian, mockup_url, rincian.
-- Aman dijalankan ulang.

alter table monitoring_konveksi.production_types
  add column if not exists is_custom boolean not null default false,
  add column if not exists bagian jsonb not null default '[]';

insert into monitoring_konveksi.production_types (name, value, kategori, sort_order, is_custom, bagian)
select 'Pesanan Umum', 'pesanan_umum', 'utama',
       coalesce((select max(sort_order) from monitoring_konveksi.production_types where kategori = 'utama'), 0) + 1,
       true,
       jsonb_build_array(
         jsonb_build_object('nama', 'Atasan',  'ukuran', '["S","M","L","XL","XXL","3XL"]'::jsonb),
         jsonb_build_object('nama', 'Bawahan', 'ukuran', (select jsonb_agg(n::text order by n) from generate_series(21, 41) n))
       )
on conflict (value) do nothing;
