-- 025_inventori_grant_super_admin.sql
-- Beri izin Stok Barang Jadi (lihat + verifikasi) ke semua Super Admin yang sudah ada.
-- Aman diulang. Izin user lain tetap diatur dari Pengaturan Admin > Hak Akses.
begin;

update monitoring_konveksi.users u
   set permissions = coalesce(u.permissions, '{}'::jsonb)
         || jsonb_build_object(
              'inventori',
              coalesce(u.permissions -> 'inventori', '{}'::jsonb)
                || jsonb_build_object('view', true, 'edit', true))
 where u.role::text in ('super_admin', 'supervisor')
    or coalesce(u.roles::text[], '{}'::text[]) && array['super_admin', 'supervisor']::text[];

commit;

notify pgrst, 'reload schema';

-- Pemeriksaan (manual):
--   select name, role, permissions -> 'inventori' as inventori
--     from monitoring_konveksi.users order by role;
