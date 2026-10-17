-- 002_konveksi_core.sql
--
-- Tabel inti Konveksi: jenis produksi, pesanan, log aktivitas. Aturan hak
-- akses mengikuti pola Sablon (has_perm per modul/aksi + penjaga trigger).
-- Prasyarat: 001_base_umum.sql sudah dijalankan. Aman dijalankan ulang.
--
-- Modul hak akses yang dirujuk: orders, produksi, finishing, keuangan, salary,
-- settings, logs, trash (lihat UserPermissions di types/index.ts).
-- Supervisor selalu lolos semua pengecekan.

-- ─── Jenis produksi (master data, diatur di Pengaturan) ──────────────────────
create table if not exists monitoring_konveksi.production_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  value       text not null unique,
  kategori    text not null check (kategori in ('utama', 'non_utama')),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default timezone('utc', now())
);

insert into monitoring_konveksi.production_types (name, value, kategori, sort_order) values
  ('Seragam Sekolah',            'seragam_sekolah', 'utama',     1),
  ('Celana Sekolah',             'celana_sekolah',  'utama',     2),
  ('Kaos Polos',                 'kaos_polos',      'utama',     3),
  ('Kaos Polo',                  'kaos_polo',       'utama',     4),
  ('Celana Training',            'celana_training', 'utama',     5),
  ('Celana Pendek',              'celana_pendek',   'utama',     6),
  ('Pembuatan Selempang Wisuda', 'selempang_wisuda','non_utama', 1),
  ('Jasa Permak / Jahit',        'permak_jahit',    'non_utama', 2)
on conflict (value) do nothing;

-- ─── Pesanan ─────────────────────────────────────────────────────────────────
create table if not exists monitoring_konveksi.orders (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  kode_produksi    text not null unique,
  kategori         text not null check (kategori in ('utama', 'non_utama')),
  nama_pemesan     text not null,
  no_hp            text,
  alamat_pemesan   text,
  jumlah           integer not null default 0,
  tanggal_masuk    date not null default current_date,
  deadline         date not null,
  jenis_produksi   text,                          -- utama: diisi saat Approval · non_utama: saat dibuat
  items            jsonb not null default '[]',   -- [{id, jenis_produksi, jumlah, catatan}]
  catatan_pesanan  text,
  status           text not null default 'Pesanan Masuk',
  steps            jsonb not null default '[]',   -- lihat lib/steps.ts
  kendala          jsonb not null default '[]',
  assigned_to      uuid references monitoring_konveksi.users(id) on delete set null,
  created_by       uuid references monitoring_konveksi.users(id) on delete set null,
  deleted_at       timestamptz
);
create index if not exists orders_status_idx   on monitoring_konveksi.orders (status) where deleted_at is null;
create index if not exists orders_deadline_idx on monitoring_konveksi.orders (deadline);
create index if not exists orders_kategori_idx on monitoring_konveksi.orders (kategori);

create or replace function monitoring_konveksi.touch_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_orders_touch on monitoring_konveksi.orders;
create trigger trg_orders_touch before update on monitoring_konveksi.orders
  for each row execute function monitoring_konveksi.touch_updated_at();

-- Penjaga: memindahkan pesanan ke Sampah / memulihkannya hanya untuk yang berhak.
-- (Bagian 6 — Keuangan — menambah penjaga kolom harga/pembayaran di sini.)
create or replace function monitoring_konveksi.guard_orders_update()
returns trigger language plpgsql security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
begin
  if auth.uid() is null then return new; end if;   -- service role / SQL editor

  if new.deleted_at is distinct from old.deleted_at then
    if not (   monitoring_konveksi.has_perm('orders', 'delete')
            or monitoring_konveksi.has_perm('trash', 'delete')) then
      raise exception 'Tidak punya izin menghapus/memulihkan pesanan'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_orders_update on monitoring_konveksi.orders;
create trigger trg_guard_orders_update
  before update on monitoring_konveksi.orders
  for each row execute function monitoring_konveksi.guard_orders_update();

-- ─── Log aktivitas ───────────────────────────────────────────────────────────
create table if not exists monitoring_konveksi.order_logs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz default now(),
  order_id       uuid references monitoring_konveksi.orders(id) on delete set null,
  kode_produksi  text,
  category       text,        -- STATUS | FILE | KENDALA | QC | REVISI | SISTEM
  event_name     text,
  description    text,
  old_value      text,
  new_value      text,
  oleh           text,
  metadata       jsonb
);
create index if not exists order_logs_order_idx on monitoring_konveksi.order_logs (order_id, created_at desc);

-- ─── Akses & RLS ─────────────────────────────────────────────────────────────
grant select, insert, update, delete on
  monitoring_konveksi.production_types,
  monitoring_konveksi.orders,
  monitoring_konveksi.order_logs
to authenticated, service_role;

alter table monitoring_konveksi.production_types enable row level security;
alter table monitoring_konveksi.orders           enable row level security;
alter table monitoring_konveksi.order_logs       enable row level security;

-- production_types: staf boleh baca; ubah sesuai izin Pengaturan
drop policy if exists "Staff baca jenis produksi" on monitoring_konveksi.production_types;
create policy "Staff baca jenis produksi" on monitoring_konveksi.production_types
  for select to authenticated using (monitoring_konveksi.is_staff());
drop policy if exists "Tambah jenis produksi sesuai permission" on monitoring_konveksi.production_types;
create policy "Tambah jenis produksi sesuai permission" on monitoring_konveksi.production_types
  for insert to authenticated with check (monitoring_konveksi.has_perm('settings', 'create'));
drop policy if exists "Ubah jenis produksi sesuai permission" on monitoring_konveksi.production_types;
create policy "Ubah jenis produksi sesuai permission" on monitoring_konveksi.production_types
  for update to authenticated
  using (monitoring_konveksi.has_perm('settings', 'edit'))
  with check (monitoring_konveksi.has_perm('settings', 'edit'));
drop policy if exists "Hapus jenis produksi sesuai permission" on monitoring_konveksi.production_types;
create policy "Hapus jenis produksi sesuai permission" on monitoring_konveksi.production_types
  for delete to authenticated using (monitoring_konveksi.has_perm('settings', 'delete'));

-- orders (pola sama dengan Sablon)
drop policy if exists "Staff baca pesanan" on monitoring_konveksi.orders;
create policy "Staff baca pesanan" on monitoring_konveksi.orders
  for select to authenticated using (monitoring_konveksi.is_staff());

drop policy if exists "Buat pesanan sesuai permission" on monitoring_konveksi.orders;
create policy "Buat pesanan sesuai permission" on monitoring_konveksi.orders
  for insert to authenticated with check (monitoring_konveksi.has_perm('orders', 'create'));

drop policy if exists "Update pesanan sesuai permission" on monitoring_konveksi.orders;
create policy "Update pesanan sesuai permission" on monitoring_konveksi.orders
  for update to authenticated
  using (
       monitoring_konveksi.has_perm('orders',    'edit')
    or monitoring_konveksi.has_perm('orders',    'delete')
    or monitoring_konveksi.has_perm('trash',     'delete')
    or monitoring_konveksi.has_perm('produksi',  'create')
    or monitoring_konveksi.has_perm('produksi',  'edit')
    or monitoring_konveksi.has_perm('produksi',  'delete')
    or monitoring_konveksi.has_perm('finishing', 'create')
    or monitoring_konveksi.has_perm('finishing', 'edit')
    or monitoring_konveksi.has_perm('finishing', 'delete')
    or monitoring_konveksi.has_perm('keuangan',  'edit')
    or monitoring_konveksi.has_perm('salary',    'edit')
  )
  with check (true);

drop policy if exists "Hapus permanen sesuai permission" on monitoring_konveksi.orders;
create policy "Hapus permanen sesuai permission" on monitoring_konveksi.orders
  for delete to authenticated using (monitoring_konveksi.has_perm('trash', 'delete'));

-- order_logs
drop policy if exists "Log: baca" on monitoring_konveksi.order_logs;
create policy "Log: baca" on monitoring_konveksi.order_logs
  for select to authenticated using (monitoring_konveksi.has_perm('logs', 'view'));
drop policy if exists "Log: tulis" on monitoring_konveksi.order_logs;
create policy "Log: tulis" on monitoring_konveksi.order_logs
  for insert to authenticated with check (monitoring_konveksi.is_staff());
drop policy if exists "Log: hapus" on monitoring_konveksi.order_logs;
create policy "Log: hapus" on monitoring_konveksi.order_logs
  for delete to authenticated using (monitoring_konveksi.has_perm('trash', 'delete'));

-- Realtime pesanan (opsional, dipakai saat daftar pesanan disegarkan otomatis)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table monitoring_konveksi.orders;
    exception when duplicate_object then null; end;
  end if;
end $$;
