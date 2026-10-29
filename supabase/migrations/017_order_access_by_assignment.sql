-- 017_order_access_by_assignment.sql  (akses pesanan mengikuti PJ & tim)
--
-- Prasyarat: 001–007 dan 016 sudah dijalankan. Aman dijalankan ulang.
-- Tidak mengubah struktur tabel dan tidak menyentuh data.
--
-- MASALAH YANG DIPERBAIKI
-- Sebelumnya policy baca `orders` hanya mengecek is_staff(), dan policy ubah
-- hanya mengecek "punya salah satu izin produksi/finishing". Penanggung jawab
-- (orders.assigned_to) dan tim (orders.team_id) hanya label: siapa pun yang
-- berstatus staf bisa membuka SEMUA pesanan, dan siapa pun yang punya izin
-- produksi/finishing bisa menekan tombol tahap di pesanan MILIK TIM LAIN —
-- termasuk lewat API Supabase langsung, tanpa melewati layar aplikasi.
--
-- ATURAN BARU
--  Siapa yang BOLEH MELIHAT pesanan (SELECT):
--    a. "Pengelola" — Super Admin, atau pemegang izin orders.edit,
--       orders.delete, trash.delete (kelola/hapus/pulihkan pesanan);
--    b. Pemantau lintas pesanan — pemegang izin keuangan.view atau salary.view
--       (menu Keuangan dan Gaji memang butuh membaca semua pesanan);
--    c. Kru pesanan itu: PEMBUAT pesanan, PJ (assigned_to), atau ANGGOTA TIM
--       (teams.member_ids berisi user itu).
--  Siapa yang BOLEH MENGUBAH pesanan (UPDATE):
--    a. Pengelola (butir a di atas) untuk semua pesanan;
--    b. Kru pesanan itu (butir c) — dan tetap harus punya izin produksi /
--       finishing yang sesuai (dijaga trigger guard_orders_update, tidak berubah).
--    Pemantau saja (butir b) hanya bisa MELIHAT.
--  Catatan produksi (production_notes): dibaca mengikuti hak lihat pesanannya;
--    ditulis hanya oleh pengelola atau kru pesanan itu.
--  Nomor urut kode produksi: dihitung fungsi next_kode_produksi() di database,
--    karena query dari browser kini hanya melihat sebagian pesanan (akan bentrok).
--
-- SATU TEMPAT UNTUK MENGUBAH ATURAN
--  Daftar izin "pengelola" dan "pemantau" ada di can_manage_all_orders() dan
--  can_view_all_orders() di bawah. Ubah di situ (dan lib/orderAccess.ts yang
--  mencerminkannya di sisi aplikasi), jangan di tiap policy.
--
-- BELUM DICAKUP (lihat docs/PRD.md §23)
--  • order_logs: dibaca semua pemegang izin logs.view (menu Log Aktivitas).
--  • Bucket storage `production-proofs` (di luar migration).
--  • Notifikasi lama yang sudah tersimpan di lonceng pengguna.

begin;

-- ─── 1. Fungsi bantu ─────────────────────────────────────────────────────────

-- Pengelola: boleh melihat DAN mengubah semua pesanan.
create or replace function monitoring_konveksi.can_manage_all_orders()
returns boolean language sql stable security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
  select coalesce((
    select u.role::text in ('super_admin', 'supervisor')
        or (u.permissions -> 'orders' ->> 'edit')   = 'true'
        or (u.permissions -> 'orders' ->> 'delete') = 'true'
        or (u.permissions -> 'trash'  ->> 'delete') = 'true'
    from monitoring_konveksi.users u
    where u.id = auth.uid()
  ), false);
$$;

-- Boleh MELIHAT semua pesanan: pengelola + pemantau keuangan/gaji.
create or replace function monitoring_konveksi.can_view_all_orders()
returns boolean language sql stable security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
  select coalesce((
    select monitoring_konveksi.can_manage_all_orders()
        or (u.permissions -> 'keuangan' ->> 'view') = 'true'
        or (u.permissions -> 'salary'   ->> 'view') = 'true'
    from monitoring_konveksi.users u
    where u.id = auth.uid()
  ), false);
$$;

-- Kru satu pesanan: pembuat, PJ, atau anggota tim (tim nonaktif tetap dihitung,
-- supaya anggota tidak kehilangan akses ke pesanan lamanya).
create or replace function monitoring_konveksi.is_order_crew(
  p_created_by uuid, p_assigned_to uuid, p_team_id uuid
)
returns boolean language sql stable security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
  select coalesce(
    auth.uid() is not null
    and (
         p_created_by  = auth.uid()
      or p_assigned_to = auth.uid()
      or (p_team_id is not null and exists (
            select 1 from monitoring_konveksi.teams t
            where t.id = p_team_id
              and t.member_ids @> array[auth.uid()]))
    ),
    false
  );
$$;

grant execute on function monitoring_konveksi.can_manage_all_orders()              to authenticated, service_role;
grant execute on function monitoring_konveksi.can_view_all_orders()                to authenticated, service_role;
grant execute on function monitoring_konveksi.is_order_crew(uuid, uuid, uuid)      to authenticated, service_role;

-- ─── 2. orders: baca ─────────────────────────────────────────────────────────
-- (select fn()) membuat Postgres menghitungnya SEKALI per query, bukan per baris.
drop policy if exists "Staff baca pesanan"              on monitoring_konveksi.orders;
drop policy if exists "Pesanan: baca sesuai penugasan"  on monitoring_konveksi.orders;
create policy "Pesanan: baca sesuai penugasan" on monitoring_konveksi.orders
  for select to authenticated
  using (
    (select monitoring_konveksi.is_staff())
    and (
         (select monitoring_konveksi.can_view_all_orders())
      or monitoring_konveksi.is_order_crew(created_by, assigned_to, team_id)
    )
  );

-- ─── 3. orders: ubah ─────────────────────────────────────────────────────────
-- Pengelola: semua pesanan. Kru: pesanan miliknya, dengan izin tahap (seperti
-- sebelumnya). Penjaga kolom guard_orders_update (007) tetap berjalan di atasnya.
-- WITH CHECK dibuat sama dengan USING supaya baris tidak bisa "dilempar" ke
-- orang lain lewat update (sebelumnya `with check (true)`).
drop policy if exists "Update pesanan sesuai permission"   on monitoring_konveksi.orders;
drop policy if exists "Pesanan: ubah sesuai penugasan"     on monitoring_konveksi.orders;
create policy "Pesanan: ubah sesuai penugasan" on monitoring_konveksi.orders
  for update to authenticated
  using (
    (select monitoring_konveksi.is_staff())
    and (
         (select monitoring_konveksi.can_manage_all_orders())
      or (
            monitoring_konveksi.is_order_crew(created_by, assigned_to, team_id)
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
            monitoring_konveksi.is_order_crew(created_by, assigned_to, team_id)
        and (   monitoring_konveksi.has_perm('produksi',  'create')
             or monitoring_konveksi.has_perm('produksi',  'edit')
             or monitoring_konveksi.has_perm('produksi',  'delete')
             or monitoring_konveksi.has_perm('finishing', 'create')
             or monitoring_konveksi.has_perm('finishing', 'edit')
             or monitoring_konveksi.has_perm('finishing', 'delete'))
      )
    )
  );

-- INSERT dan DELETE permanen tidak diubah: INSERT tetap mewajibkan
-- created_by = pengguna yang login (005, jadi pembuat selalu bisa melihat
-- pesanannya sendiri); hapus permanen butuh trash.delete (termasuk pengelola).

-- ─── 4. production_notes: ikut hak pesanan induknya ──────────────────────────
-- Subquery ke `orders` dievaluasi dengan RLS pengguna yang sama, jadi
-- "bisa baca catatan" = "bisa membaca pesanannya".
drop policy if exists "Catatan: baca" on monitoring_konveksi.production_notes;
create policy "Catatan: baca" on monitoring_konveksi.production_notes
  for select to authenticated
  using (
    (select monitoring_konveksi.is_staff())
    and exists (
      select 1 from monitoring_konveksi.orders o
      where o.id = production_notes.order_id
    )
  );

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
             or monitoring_konveksi.is_order_crew(o.created_by, o.assigned_to, o.team_id))
    )
  );

-- "Catatan: hapus" (pembuat catatan atau Super Admin) tidak diubah.

-- ─── 5. Nomor urut kode produksi dihitung di database ────────────────────────
-- Sebelumnya browser mencari kode terakhir bulan ini lewat query `orders`. Setelah
-- akses dibatasi, pembuat biasa hanya "melihat" sebagian pesanan, sehingga nomor
-- urutnya bisa BENTROK dengan pesanan orang lain (kode_produksi unik) dan pesanan
-- gagal dibuat. Fungsi ini security definer: membaca SEMUA baris (termasuk yang di
-- Sampah, seperti perilaku lama), tetapi hanya mengembalikan satu kode, tanpa data
-- pesanan. Awalan divalidasi ketat (juga mencegah wildcard LIKE).
create or replace function monitoring_konveksi.next_kode_produksi(p_prefix text)
returns text language plpgsql stable security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
declare
  v_max bigint;
begin
  if auth.uid() is null or not monitoring_konveksi.is_staff() then
    raise exception 'Tidak berhak membuat kode produksi' using errcode = '42501';
  end if;
  if p_prefix is null or p_prefix !~ '^KNV-[0-9]{2}/[0-9]{2}-$' then
    raise exception 'Awalan kode produksi tidak valid' using errcode = '22023';
  end if;

  select coalesce(max((substring(o.kode_produksi from '([0-9]+)$'))::bigint), 0)
    into v_max
    from monitoring_konveksi.orders o
   where left(o.kode_produksi, length(p_prefix)) = p_prefix;

  return p_prefix || lpad((v_max + 1)::text, 4, '0');
end;
$$;

grant execute on function monitoring_konveksi.next_kode_produksi(text) to authenticated, service_role;

commit;

-- Muat ulang cache schema PostgREST.
notify pgrst, 'reload schema';

-- ─── Pemeriksaan setelah dijalankan (jalankan manual, bukan bagian migration) ─
-- 1) Pesanan yang HANYA bisa dilihat pengelola (tanpa PJ, tanpa tim, pembuat
--    sudah dihapus) — periksa dan isi PJ/timnya lewat Edit Pesanan:
--      select kode_produksi, nama_pemesan, status
--      from monitoring_konveksi.orders
--      where assigned_to is null and team_id is null and created_by is null
--        and deleted_at is null;
-- 2) Uji sebagai pengguna tertentu (ganti UUID), harus hanya mengembalikan
--    pesanan yang menjadi hak user itu:
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000';
--        select kode_produksi from monitoring_konveksi.orders;
--      rollback;
