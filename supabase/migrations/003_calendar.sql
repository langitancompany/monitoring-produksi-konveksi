-- 003_calendar.sql
--
-- Bagian 3 (Arsip & pemantauan): agenda manual untuk menu Kalender.
-- Deadline & tanggal masuk pesanan TIDAK disimpan di sini — Kalender membacanya
-- langsung dari tabel orders. Tabel ini hanya untuk agenda tambahan yang dicatat
-- tim (rapat, kunjungan, pengambilan kain, dst).
--
-- Prasyarat: 001_base_umum.sql dan 002_konveksi_core.sql sudah dijalankan.
-- Aman dijalankan ulang. Tidak ada grant ke role `anon` (Konveksi tidak punya halaman publik).
--
-- Hak akses mengikuti Sablon ("staf kelola semua"): siapa pun yang is_staff()
-- boleh melihat, menambah, dan menghapus agenda.

create table if not exists monitoring_konveksi.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  date        date not null,
  event_time  text,                                   -- 'HH:mm', boleh kosong
  location    text,
  color       text not null default 'bg-blue-500',    -- kelas warna Tailwind pilihan pengguna
  created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists calendar_events_date_idx
  on monitoring_konveksi.calendar_events (date);

grant select, insert, update, delete
  on monitoring_konveksi.calendar_events
  to authenticated, service_role;

alter table monitoring_konveksi.calendar_events enable row level security;

drop policy if exists "Staff kelola agenda" on monitoring_konveksi.calendar_events;
create policy "Staff kelola agenda" on monitoring_konveksi.calendar_events
  for all to authenticated
  using (monitoring_konveksi.is_staff())
  with check (monitoring_konveksi.is_staff());
