-- 004_production_notes.sql
--
-- Bagian 4 (Catatan Rapat): catatan produksi per pesanan.
-- Tim menulis catatan di detail pesanan (kartu 02 Produksi, 03 QC & Packing,
-- 04 Pengiriman). Menu "Catatan Rapat" merangkum semuanya per minggu untuk
-- rapat mingguan, dan bisa dicetak / disimpan sebagai PDF.
--
-- Prasyarat: 001_base_umum.sql, 002_konveksi_core.sql sudah dijalankan.
-- Aman dijalankan ulang. Tidak ada grant ke role `anon` (Konveksi tidak punya halaman publik).
--
-- Beda kecil dari Sablon (sengaja):
--   * order_id berupa uuid + foreign key `on delete cascade` — catatan ikut terhapus
--     bila pesanannya dihapus permanen (catatan adalah isi pesanan; jejak audit tetap
--     ada di order_logs). Sablon memakai teks tanpa foreign key.
--   * created_by_id berupa uuid (sama dengan users.id), default auth.uid().
--   * Catatan tidak bisa DIUBAH, hanya ditambah atau dihapus (tidak ada policy update).

create table if not exists monitoring_konveksi.production_notes (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references monitoring_konveksi.orders(id) on delete cascade,
  kode_produksi    text,                       -- salinan saat catatan dibuat (tampilan memakai data pesanan terbaru)
  nama_pemesan     text,                       -- idem
  content          text not null
                   check (char_length(btrim(content)) between 1 and 1000),
  section          text not null
                   check (section in ('produksi', 'finishing', 'pengiriman')),
  created_by_id    uuid not null default auth.uid(),
  created_by_name  text not null,
  created_at       timestamptz not null default timezone('utc', now())
);

create index if not exists production_notes_order_idx
  on monitoring_konveksi.production_notes (order_id, created_at);
create index if not exists production_notes_created_idx
  on monitoring_konveksi.production_notes (created_at desc);

-- Tanpa `update`: catatan rapat tidak boleh diam-diam diubah setelah ditulis.
grant select, insert, delete
  on monitoring_konveksi.production_notes
  to authenticated, service_role;

alter table monitoring_konveksi.production_notes enable row level security;

-- Baca: semua staf.
drop policy if exists "Catatan: baca" on monitoring_konveksi.production_notes;
create policy "Catatan: baca" on monitoring_konveksi.production_notes
  for select to authenticated
  using (monitoring_konveksi.is_staff());

-- Tulis: staf, dan hanya atas nama dirinya sendiri (tidak bisa memalsukan pembuat).
drop policy if exists "Catatan: tulis" on monitoring_konveksi.production_notes;
create policy "Catatan: tulis" on monitoring_konveksi.production_notes
  for insert to authenticated
  with check (
    monitoring_konveksi.is_staff()
    and created_by_id = auth.uid()
  );

-- Hapus: pembuat catatan, atau supervisor.
drop policy if exists "Catatan: hapus" on monitoring_konveksi.production_notes;
create policy "Catatan: hapus" on monitoring_konveksi.production_notes
  for delete to authenticated
  using (
    created_by_id = auth.uid()
    or monitoring_konveksi.is_supervisor()
  );
