-- 006_teams.sql  (Bagian 8 — Tim produksi)
--
-- Tim = kumpulan user (mis. "Tim Jahit Kaos", "Tim Jahit Seragam"). Dibuat di
-- Pengaturan → Tim, lalu dipilih saat membuat / mengedit pesanan.
--
-- Prasyarat: 001–005 sudah dijalankan. Aman dijalankan ulang.
-- Tidak mengubah data yang sudah ada (hanya menambah tabel & satu kolom).
--
-- KEPUTUSAN DESAIN
--  * Anggota disimpan sebagai `teams.member_ids uuid[]` (bukan tabel terpisah):
--    satu tim disimpan dalam SATU perintah, jadi tidak mungkin "nama tersimpan
--    tapi anggotanya gagal". Satu user boleh ada di banyak tim.
--  * Array tidak punya foreign key, jadi trigger `trg_users_remove_from_teams`
--    mengeluarkan user dari semua tim saat user dihapus.
--  * `orders.team_id` → `on delete set null`: menghapus tim TIDAK menghapus
--    pesanan, hanya mengosongkan timnya. (Cara aman: Nonaktifkan, bukan Hapus.)
--  * Izin memakai modul `settings` (sama seperti Jenis Produksi): lihat/ubah tim
--    = izin Pengaturan; membaca daftar tim = semua staf (agar form pesanan bisa
--    menampilkan pilihan tim walau user tidak boleh membuka Pengaturan).

begin;

-- ─── 1. Tabel tim ────────────────────────────────────────────────────────────
create table if not exists monitoring_konveksi.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null
               check (char_length(btrim(name)) between 1 and 60),
  description  text
               check (description is null or char_length(description) <= 200),
  member_ids   uuid[] not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

-- Nama tim unik (tanpa membedakan huruf besar/kecil & spasi di ujung)
create unique index if not exists teams_name_uidx
  on monitoring_konveksi.teams (lower(btrim(name)));
-- Untuk pencarian "tim mana saja yang berisi user X" (dipakai Bagian 5 / Gaji)
create index if not exists teams_member_ids_idx
  on monitoring_konveksi.teams using gin (member_ids);

drop trigger if exists trg_teams_touch on monitoring_konveksi.teams;
create trigger trg_teams_touch before update on monitoring_konveksi.teams
  for each row execute function monitoring_konveksi.touch_updated_at();

-- ─── 2. Kolom tim di pesanan ─────────────────────────────────────────────────
alter table monitoring_konveksi.orders
  add column if not exists team_id uuid
  references monitoring_konveksi.teams(id) on delete set null;

create index if not exists orders_team_idx
  on monitoring_konveksi.orders (team_id) where team_id is not null;

-- ─── 3. Hapus user → keluarkan dari semua tim ────────────────────────────────
create or replace function monitoring_konveksi.remove_user_from_teams()
returns trigger language plpgsql security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
begin
  update monitoring_konveksi.teams
     set member_ids = array_remove(member_ids, old.id)
   where member_ids @> array[old.id];
  return old;
end;
$$;

drop trigger if exists trg_users_remove_from_teams on monitoring_konveksi.users;
create trigger trg_users_remove_from_teams
  after delete on monitoring_konveksi.users
  for each row execute function monitoring_konveksi.remove_user_from_teams();

-- ─── 4. Akses & RLS ──────────────────────────────────────────────────────────
-- Tanpa grant ke `anon` (Konveksi tidak punya halaman publik).
grant select, insert, update, delete
  on monitoring_konveksi.teams
  to authenticated, service_role;

alter table monitoring_konveksi.teams enable row level security;

drop policy if exists "Tim: baca" on monitoring_konveksi.teams;
create policy "Tim: baca" on monitoring_konveksi.teams
  for select to authenticated using (monitoring_konveksi.is_staff());

drop policy if exists "Tim: tambah" on monitoring_konveksi.teams;
create policy "Tim: tambah" on monitoring_konveksi.teams
  for insert to authenticated
  with check (monitoring_konveksi.has_perm('settings', 'create'));

drop policy if exists "Tim: ubah" on monitoring_konveksi.teams;
create policy "Tim: ubah" on monitoring_konveksi.teams
  for update to authenticated
  using (monitoring_konveksi.has_perm('settings', 'edit'))
  with check (monitoring_konveksi.has_perm('settings', 'edit'));

drop policy if exists "Tim: hapus" on monitoring_konveksi.teams;
create policy "Tim: hapus" on monitoring_konveksi.teams
  for delete to authenticated
  using (monitoring_konveksi.has_perm('settings', 'delete'));

-- ─── 5. Penjaga kolom orders: tambah team_id ─────────────────────────────────
-- Salinan guard_orders_update dari 005, dengan SATU tambahan: mengganti tim
-- pesanan butuh orders.edit (sama seperti assigned_to). Pengecualian: team_id
-- boleh menjadi NULL bila timnya memang baru dihapus (aksi otomatis
-- `on delete set null`), supaya user yang boleh menghapus tim (settings.delete)
-- tidak terhalang walau tidak punya orders.edit.
create or replace function monitoring_konveksi.guard_orders_update()
returns trigger language plpgsql security definer
set search_path to 'monitoring_konveksi', 'pg_temp'
as $$
declare
  v_can_flow boolean;
begin
  -- service role / SQL editor / API server: tidak ada pengguna login → lolos
  if auth.uid() is null then return new; end if;

  -- (a) Kolom identitas tidak pernah boleh berubah dari aplikasi.
  --     created_by boleh menjadi NULL (aksi otomatis saat akun penulisnya dihapus).
  if new.id            is distinct from old.id
     or new.created_at    is distinct from old.created_at
     or new.kode_produksi is distinct from old.kode_produksi
     or new.kategori      is distinct from old.kategori
     or (new.created_by is distinct from old.created_by and new.created_by is not null)
  then
    raise exception 'Kode, kategori, dan pembuat pesanan tidak boleh diubah'
      using errcode = '42501';
  end if;

  -- (b) Pindah ke Sampah / pulihkan (aturan lama, tidak berubah)
  if new.deleted_at is distinct from old.deleted_at then
    if not (   monitoring_konveksi.has_perm('orders', 'delete')
            or monitoring_konveksi.has_perm('trash',  'delete')) then
      raise exception 'Tidak punya izin menghapus/memulihkan pesanan'
        using errcode = '42501';
    end if;
  end if;

  -- (c) Data pemesan, jadwal, catatan, penanggung jawab, tim → hanya yang boleh edit pesanan
  if (   new.nama_pemesan    is distinct from old.nama_pemesan
      or new.no_hp           is distinct from old.no_hp
      or new.alamat_pemesan  is distinct from old.alamat_pemesan
      or new.tanggal_masuk   is distinct from old.tanggal_masuk
      or new.deadline        is distinct from old.deadline
      or new.catatan_pesanan is distinct from old.catatan_pesanan
      or new.assigned_to     is distinct from old.assigned_to
      or (    new.team_id is distinct from old.team_id
          -- kecuali: tim lama sudah tidak ada (dihapus) dan kolom dikosongkan
          and not (    new.team_id is null
                   and not exists (select 1 from monitoring_konveksi.teams t
                                   where t.id = old.team_id))))
     and not monitoring_konveksi.has_perm('orders', 'edit')
  then
    raise exception 'Tidak punya izin mengubah data pesanan'
      using errcode = '42501';
  end if;

  -- (d) Item & jumlah: edit pesanan, atau membuat Approval (produksi.create)
  if (   new.items          is distinct from old.items
      or new.jumlah         is distinct from old.jumlah
      or new.jenis_produksi is distinct from old.jenis_produksi)
     and not (   monitoring_konveksi.has_perm('orders',   'edit')
              or monitoring_konveksi.has_perm('produksi', 'create'))
  then
    raise exception 'Tidak punya izin mengubah item atau jumlah pesanan'
      using errcode = '42501';
  end if;

  -- (e) Tahap, kendala, status: mengerjakan tahap / melapor kendala
  if (   new.steps   is distinct from old.steps
      or new.kendala is distinct from old.kendala
      or new.status  is distinct from old.status)
  then
    v_can_flow :=    monitoring_konveksi.has_perm('orders',    'edit')
                  or monitoring_konveksi.has_perm('produksi',  'create')
                  or monitoring_konveksi.has_perm('produksi',  'edit')
                  or monitoring_konveksi.has_perm('produksi',  'delete')
                  or monitoring_konveksi.has_perm('finishing', 'create')
                  or monitoring_konveksi.has_perm('finishing', 'edit')
                  or monitoring_konveksi.has_perm('finishing', 'delete');
    if not v_can_flow then
      raise exception 'Tidak punya izin mengubah tahap atau status pesanan'
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

commit;

-- Minta PostgREST (API Supabase) memuat ulang daftar tabel, supaya tabel `teams`
-- & kolom `team_id` langsung terbaca aplikasi tanpa restart manual.
notify pgrst, 'reload schema';
