-- PATCH UNTUK DATABASE **SABLON** (schema monitoring_sablon), bukan Konveksi.
--
-- Masalah: trigger guard_users_update menjaga role, permissions, username,
-- password — tapi TIDAK menjaga kolom `roles` (array). Policy RLS
-- "Update profil sendiri" mengizinkan user mengubah barisnya sendiri, jadi
-- user biasa bisa menjalankan:
--     update users set roles = '{supervisor}' where id = auth.uid();
-- Setelah itu fin_perm() menganggapnya supervisor (membaca semua data
-- Keuangan) dan policy SELECT orders ("Super App Role Logic") menganggapnya
-- admin/supervisor (membaca semua pesanan).
--
-- Perbaikan: tambahkan `roles` ke daftar kolom yang dijaga. Admin & supervisor
-- tetap bebas; edit profil biasa (nama, alamat, tgl lahir, foto, no WA) tidak
-- terpengaruh karena tidak menyentuh kolom roles.

create or replace function monitoring_sablon.guard_users_update()
returns trigger
language plpgsql
security definer
set search_path to 'monitoring_sablon', 'pg_temp'
as $function$
begin
  -- service role / SQL editor (tanpa auth.uid) dibiarkan
  if auth.uid() is null then return new; end if;

  -- admin & supervisor boleh mengelola user
  if monitoring_sablon.is_admin_or_supervisor() then return new; end if;

  -- user biasa hanya boleh ubah profil (name, address, dob, avatar_url, no_wa)
  if new.id          is distinct from old.id
  or new.role        is distinct from old.role
  or new.roles       is distinct from old.roles        -- ← TAMBAHAN
  or new.permissions is distinct from old.permissions
  or new.username    is distinct from old.username
  or new.password    is distinct from old.password then
    raise exception 'Tidak diizinkan mengubah role, permission, atau kredensial'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
