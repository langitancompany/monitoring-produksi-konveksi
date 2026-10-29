-- 018_orders_view_all_permission.sql  (izin "akses semua pesanan")
--
-- Prasyarat: 001–007, 016, 017 sudah dijalankan. Aman dijalankan ulang.
-- Tidak mengubah struktur tabel. MENGUBAH DATA di satu tempat: bagian 4 memberi
-- izin baru ke user ber-role QC / Admin / Manager (lihat di sana; boleh dihapus
-- bila ingin mengatur manual dari Pengaturan Admin > Pengguna).
--
-- LATAR BELAKANG
-- Migration 017 membatasi pesanan ke PJ & tim. QC, Admin, dan Manager tetap harus
-- melihat dan memproses SEMUA pesanan (QC memeriksa semua pesanan), tetapi hak
-- membuat/edit/hapus pesanan harus tetap diatur terpisah di tabel hak akses.
-- Sebelumnya satu-satunya jalan "lihat semua" adalah memberi orders.edit/delete
-- (ikut bisa edit semua pesanan) atau keuangan.view/salary.view (hanya lihat).
--
-- ATURAN BARU: izin `orders.view_all` ("Pesanan: akses semua pesanan")
--   • boleh MELIHAT semua pesanan;
--   • boleh MENGERJAKAN tahap pesanan mana pun — tetap butuh izin produksi /
--     finishing yang sesuai (penjaga kolom guard_orders_update tidak berubah);
--   • TIDAK otomatis boleh buat/edit/hapus pesanan: itu tetap orders.create /
--     orders.edit / orders.delete.
--   Super Admin selalu punya akses ini. Cermin di aplikasi: lib/orderAccess.ts
--   (hasAllOrdersAccess).

begin;

-- ─── 1. Fungsi bantu ─────────────────────────────────────────────────────────
create or replace function monitoring_konveksi.has_all_orders_access()
returns boolean language sql stable security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
  select coalesce((
    select u.role::text in ('super_admin', 'supervisor')
        or (u.permissions -> 'orders' ->> 'view_all') = 'true'
    from monitoring_konveksi.users u
    where u.id = auth.uid()
  ), false);
$$;

create or replace function monitoring_konveksi.can_view_all_orders()
returns boolean language sql stable security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
  select coalesce((
    select monitoring_konveksi.can_manage_all_orders()
        or monitoring_konveksi.has_all_orders_access()
        or (u.permissions -> 'keuangan' ->> 'view') = 'true'
        or (u.permissions -> 'salary'   ->> 'view') = 'true'
    from monitoring_konveksi.users u
    where u.id = auth.uid()
  ), false);
$$;

grant execute on function monitoring_konveksi.has_all_orders_access() to authenticated, service_role;
grant execute on function monitoring_konveksi.can_view_all_orders()   to authenticated, service_role;

-- ─── 2. orders: ubah — pemegang akses semua pesanan diperlakukan seperti kru ──
drop policy if exists "Pesanan: ubah sesuai penugasan" on monitoring_konveksi.orders;
create policy "Pesanan: ubah sesuai penugasan" on monitoring_konveksi.orders
  for update to authenticated
  using (
    (select monitoring_konveksi.is_staff())
    and (
         (select monitoring_konveksi.can_manage_all_orders())
      or (
            (   (select monitoring_konveksi.has_all_orders_access())
             or monitoring_konveksi.is_order_crew(created_by, assigned_to, team_id))
        and (   monitoring_konveksi.has_perm('produksi',  'create')
             or monitoring_konveksi.has_perm('produksi',  'edit')
             or monitoring_konveksi.has_perm('produksi',  'delete')
             or monitoring_konveksi.has_perm('finishing', 'create')
             or monitoring_konveksi.has_perm('finishing', 'edit')
             or monitoring_konveksi.has_perm('finishing', 'delete'))
      )
    )
  )
  with check (
    (select monitoring_konveksi.is_staff())
    and (
         (select monitoring_konveksi.can_manage_all_orders())
      or (
            (   (select monitoring_konveksi.has_all_orders_access())
             or monitoring_konveksi.is_order_crew(created_by, assigned_to, team_id))
        and (   monitoring_konveksi.has_perm('produksi',  'create')
             or monitoring_konveksi.has_perm('produksi',  'edit')
             or monitoring_konveksi.has_perm('produksi',  'delete')
             or monitoring_konveksi.has_perm('finishing', 'create')
             or monitoring_konveksi.has_perm('finishing', 'edit')
             or monitoring_konveksi.has_perm('finishing', 'delete'))
      )
    )
  );

-- ─── 3. production_notes: tulis ──────────────────────────────────────────────
drop policy if exists "Catatan: tulis" on monitoring_konveksi.production_notes;
create policy "Catatan: tulis" on monitoring_konveksi.production_notes
  for insert to authenticated
  with check (
    (select monitoring_konveksi.is_staff())
    and created_by_id = auth.uid()
    and exists (
      select 1 from monitoring_konveksi.orders o
      where o.id = production_notes.order_id
        and (   (select monitoring_konveksi.can_manage_all_orders())
             or (select monitoring_konveksi.has_all_orders_access())
             or monitoring_konveksi.is_order_crew(o.created_by, o.assigned_to, o.team_id))
    )
  );

-- ─── 4. Beri izin ke user QC / Admin / Manager yang sudah ada ────────────────
-- Tanpa ini mereka kehilangan akses ke pesanan yang bukan miliknya sampai izinnya
-- dicentang manual. Hapus bagian ini bila tidak diinginkan. Super Admin tidak
-- perlu (selalu punya). Aturan per user bisa diubah lagi di Pengaturan Admin.
update monitoring_konveksi.users u
   set permissions = coalesce(u.permissions, '{}'::jsonb)
         || jsonb_build_object(
              'orders',
              coalesce(u.permissions -> 'orders', '{}'::jsonb)
                || jsonb_build_object('view_all', true)
            )
 where (   u.role::text in ('qc', 'admin', 'manager')
        or coalesce(u.roles::text[], '{}'::text[]) && array['qc', 'admin', 'manager']::text[])
   and coalesce(u.permissions -> 'orders' ->> 'view_all', 'false') <> 'true';

commit;

-- Muat ulang cache schema PostgREST.
notify pgrst, 'reload schema';

-- ─── Pemeriksaan setelah dijalankan (manual, bukan bagian migration) ─────────
--   select name, role, permissions -> 'orders' ->> 'view_all' as view_all
--   from monitoring_konveksi.users order by role, name;
