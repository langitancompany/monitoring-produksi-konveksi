-- 019_guard_permission_escalation.sql  (Admin tidak bisa mengangkat izin)
--
-- Prasyarat: 001 dan 016 sudah dijalankan. Aman dijalankan ulang.
-- Tidak mengubah struktur tabel dan tidak menyentuh data.
--
-- ATURAN (cermin lib/permissionRules.ts dan /api/users)
--   Super Admin : bebas.
--   Admin       : • tidak bisa mengubah izin AKUNNYA SENDIRI;
--                 • hanya bisa MENAMBAH izin yang ia sendiri punya
--                   (mengurangi izin tetap boleh);
--                 • tidak bisa memberi role Super Admin, dan tidak bisa mengubah
--                   role/izin/email akun Super Admin;
--                 • user baru: izinnya tidak boleh melebihi izin Admin pembuatnya.
--
-- KENAPA DI DATABASE JUGA
-- /api/users sudah menjaga aturan ini, tetapi policy tabel `users` mengizinkan
-- Admin mengubah/menambah baris langsung lewat API Supabase dengan token-nya
-- sendiri. Trigger di bawah menutup jalan pintas itu. Service role (API server,
-- SQL Editor) tidak terpengaruh karena auth.uid() kosong.

begin;

-- ─── 1. Izin pertama yang ditambahkan tapi tidak dimiliki pemberi ───────────
-- Mengembalikan 'modul.aksi' atau NULL. p_old = izin target sebelumnya.
create or replace function monitoring_konveksi.perms_added_beyond(
  p_new jsonb, p_old jsonb, p_caller jsonb
)
returns text language sql immutable
as $$
  select m.key || '.' || a.key
  from jsonb_each(case when jsonb_typeof(p_new) = 'object' then p_new else '{}'::jsonb end) m,
       lateral jsonb_each_text(case when jsonb_typeof(m.value) = 'object' then m.value else '{}'::jsonb end) a
  where a.value = 'true'
    and coalesce(p_old    -> m.key ->> a.key, 'false') <> 'true'
    and coalesce(p_caller -> m.key ->> a.key, 'false') <> 'true'
  order by m.key, a.key
  limit 1;
$$;

-- ─── 2. UPDATE users ─────────────────────────────────────────────────────────
create or replace function monitoring_konveksi.guard_users_update()
returns trigger language plpgsql security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
declare
  v_role   text;
  v_perms  jsonb;
  v_over   text;
  v_old_super boolean;
  v_new_super boolean;
begin
  -- service role / SQL editor (tanpa auth.uid) dibiarkan
  if auth.uid() is null then return new; end if;

  select u.role::text, u.permissions into v_role, v_perms
    from monitoring_konveksi.users u where u.id = auth.uid();

  -- Super Admin: bebas
  if coalesce(v_role, '') in ('super_admin', 'supervisor') then return new; end if;

  -- Admin: boleh mengelola user, dengan batasan
  if coalesce(v_role, '') = 'admin' then
    v_old_super := old.role::text in ('super_admin', 'supervisor')
                   or coalesce(old.roles::text[], '{}'::text[]) && array['super_admin', 'supervisor']::text[];
    v_new_super := new.role::text in ('super_admin', 'supervisor')
                   or coalesce(new.roles::text[], '{}'::text[]) && array['super_admin', 'supervisor']::text[];

    if v_new_super and not v_old_super then
      raise exception 'Hanya Super Admin yang boleh memberi role Super Admin'
        using errcode = '42501';
    end if;

    if v_old_super and (
         new.role        is distinct from old.role
      or new.roles       is distinct from old.roles
      or new.permissions is distinct from old.permissions
      or new.username    is distinct from old.username) then
      raise exception 'Hanya Super Admin yang boleh mengubah akun Super Admin'
        using errcode = '42501';
    end if;

    if new.permissions is distinct from old.permissions then
      -- Izin akun sendiri: ubah apa pun (tambah ATAU kurang) dilarang.
      -- Dua arah dicek agar perbedaan hanya soal penulisan (false vs tidak tertulis) tidak dihitung.
      if new.id = auth.uid()
         and (   monitoring_konveksi.perms_added_beyond(new.permissions, old.permissions, '{}'::jsonb) is not null
              or monitoring_konveksi.perms_added_beyond(old.permissions, new.permissions, '{}'::jsonb) is not null) then
        raise exception 'Admin tidak bisa mengubah izin akunnya sendiri'
          using errcode = '42501';
      end if;

      v_over := monitoring_konveksi.perms_added_beyond(new.permissions, old.permissions, v_perms);
      if v_over is not null then
        raise exception 'Tidak bisa memberi izin yang tidak Anda miliki: %', v_over
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  -- User biasa hanya boleh mengubah profilnya (nama, alamat, tgl lahir, foto, no WA).
  -- Tidak boleh mengubah id, username, role, ROLES, atau permissions.
  if new.id          is distinct from old.id
  or new.role        is distinct from old.role
  or new.roles       is distinct from old.roles
  or new.permissions is distinct from old.permissions
  or new.username    is distinct from old.username then
    raise exception 'Tidak diizinkan mengubah role, permission, atau kredensial'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_users_update on monitoring_konveksi.users;
create trigger trg_guard_users_update
  before update on monitoring_konveksi.users
  for each row execute function monitoring_konveksi.guard_users_update();

-- ─── 3. INSERT users (user baru) ─────────────────────────────────────────────
-- Izin awal user baru dibandingkan dengan izin DEFAULT aplikasi (DEFAULT_PERMISSIONS
-- di types/index.ts). Ubah di dua tempat bila default berubah.
create or replace function monitoring_konveksi.guard_users_insert()
returns trigger language plpgsql security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
declare
  v_role  text;
  v_perms jsonb;
  v_over  text;
  c_default constant jsonb := '{
    "dashboard": {"view": true},
    "orders":    {"view": true},
    "produksi":  {"view": true},
    "finishing": {"view": true}
  }'::jsonb;
begin
  if auth.uid() is null then return new; end if;

  select u.role::text, u.permissions into v_role, v_perms
    from monitoring_konveksi.users u where u.id = auth.uid();

  if coalesce(v_role, '') in ('super_admin', 'supervisor') then return new; end if;

  if new.role::text in ('super_admin', 'supervisor')
     or coalesce(new.roles::text[], '{}'::text[]) && array['super_admin', 'supervisor']::text[] then
    raise exception 'Hanya Super Admin yang boleh membuat akun Super Admin'
      using errcode = '42501';
  end if;

  v_over := monitoring_konveksi.perms_added_beyond(new.permissions, c_default, v_perms);
  if v_over is not null then
    raise exception 'Tidak bisa memberi izin yang tidak Anda miliki: %', v_over
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_users_insert on monitoring_konveksi.users;
create trigger trg_guard_users_insert
  before insert on monitoring_konveksi.users
  for each row execute function monitoring_konveksi.guard_users_insert();

commit;

notify pgrst, 'reload schema';

-- ─── Uji manual setelah dijalankan (ganti UUID; jalankan di SQL Editor) ──────
--   begin;
--     set local role authenticated;
--     set local request.jwt.claim.sub = '<UUID-ADMIN>';
--     -- harus GAGAL: ubah izin diri sendiri
--     update monitoring_konveksi.users
--        set permissions = jsonb_set(permissions, '{keuangan,delete}', 'true')
--      where id = '<UUID-ADMIN>';
--   rollback;
