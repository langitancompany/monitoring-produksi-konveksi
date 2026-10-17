-- 001_get_public_tables.sql
--
-- Dipakai endpoint /api/backup untuk mengetahui tabel apa saja yang harus
-- diekspor. Hanya melihat schema unit ini, dan hanya bisa dipanggil lewat
-- service role (server) — bukan dari browser.
--
-- Jalankan SETELAH schema unit dibuat (lihat README → "Menyiapkan Supabase").

create schema if not exists monitoring_konveksi;

create or replace function monitoring_konveksi.get_public_tables()
returns table (table_name text)
language sql
security definer
set search_path = ''
as $$
  select t.tablename::text
  from pg_catalog.pg_tables t
  where t.schemaname = 'monitoring_konveksi'
  order by t.tablename;
$$;

revoke all on function monitoring_konveksi.get_public_tables() from public, anon, authenticated;
grant execute on function monitoring_konveksi.get_public_tables() to service_role;
