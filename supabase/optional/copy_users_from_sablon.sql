-- OPSIONAL — salin akun staf dari Sablon ke Konveksi.
--
-- Login memakai Supabase Auth yang SAMA untuk semua unit, tapi tiap unit punya
-- tabel `users` sendiri. Orang yang akan memakai aplikasi Konveksi harus punya
-- baris di monitoring_konveksi.users dengan id yang sama dengan akun login-nya.
--
-- Cara pakai: ganti daftar id di bawah, lalu jalankan SEKALI di SQL Editor.
-- Kolom `password` TIDAK disalin (biarkan kosong). Izin menu (`permissions`)
-- disalin apa adanya dari Sablon — tinjau lagi di Pengaturan → Pengguna karena
-- modul Konveksi berbeda (Pesanan Utama/Non-Utama, dst).

insert into monitoring_konveksi.users
  (id, username, name, role, roles, permissions, address, dob, avatar_url, no_wa)
select id, username, name, role, roles, permissions, address, dob, avatar_url, no_wa
from monitoring_sablon.users
where id in (
  '00000000-0000-0000-0000-000000000000'   -- ← GANTI dengan id user (uuid) yang ikut masuk Konveksi
)
on conflict (id) do nothing;

-- Direksi: salin akses lintas unit supaya UnitSwitcher tampil juga di Konveksi.
insert into monitoring_konveksi.direksi_access (user_id, unit_code, role)
select user_id, unit_code, role
from monitoring_sablon.direksi_access
where user_id in (select id from monitoring_konveksi.users)
on conflict (user_id, unit_code) do nothing;
