-- 024_inventory.sql  (Stok Barang Jadi / Inventori, V.1.24)
--
-- Isi:
--   1. orders.tujuan            — 'pelanggan' (bawaan) atau 'stok'; tidak bisa diubah setelah dibuat
--   2. inventory_receipts       — catatan hasil produksi stok (pending → verified / cancelled)
--   3. inventory_movements      — buku besar stok, HANYA TAMBAH (trigger menolak ubah/hapus)
--   4. v_inventory_stock        — saldo per SKU (jumlah semua pergerakan)
--   5. inv_on_order_qc          — trigger: QC lolos → catatan "menunggu verifikasi" muncul otomatis
--   6. inv_verify_receipt       — fungsi verifikasi (satu transaksi), hanya service_role
--   7. Pesanan stok tidak ditagih: v_order_finance mengecualikannya + trigger menolak tagihan/pembayaran
--   8. Penjaga hapus permanen pesanan stok
--   9. Akses: hanya server (service_role); browser tidak menyentuh tabel stok
--
-- Prinsip (sama dengan Keuangan, migration 009): semua tulis lewat API server, aturan dijaga database.
-- Pesan galat berawalan "INV:" ditulis sengaja dan aman ditampilkan ke pengguna.
--
-- Prasyarat: 001–023 sudah dijalankan. Aman dijalankan ulang (idempotent).
-- Jalankan di SQL Editor Supabase sebagai postgres (pemilik tabel).

begin;

-- ─── 1. orders.tujuan ────────────────────────────────────────────────────────
alter table monitoring_konveksi.orders
  add column if not exists tujuan text not null default 'pelanggan'
  check (tujuan in ('pelanggan', 'stok'));

-- Pesanan stok hanya untuk kategori utama (PRD inventori §3). Dibuat terpisah supaya aman diulang.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'orders_tujuan_utama_check'
       and conrelid = 'monitoring_konveksi.orders'::regclass
  ) then
    alter table monitoring_konveksi.orders
      add constraint orders_tujuan_utama_check check (tujuan = 'pelanggan' or kategori = 'utama');
  end if;
end $$;

-- Dibuat TERPISAH dari guard_orders_update (yang sudah didefinisikan ulang di 005, 006, 007)
-- supaya tidak menimpa versi terbaru fungsi itu.
create or replace function monitoring_konveksi.orders_tujuan_immutable()
returns trigger language plpgsql set search_path = monitoring_konveksi, public as $$
begin
  raise exception 'INV: Tujuan pesanan (pelanggan / stok) tidak bisa diubah setelah pesanan dibuat';
end $$;

drop trigger if exists trg_orders_tujuan_immutable on monitoring_konveksi.orders;
create trigger trg_orders_tujuan_immutable
  before update of tujuan on monitoring_konveksi.orders
  for each row when (old.tujuan is distinct from new.tujuan)
  execute function monitoring_konveksi.orders_tujuan_immutable();

-- ─── 2. Catatan hasil produksi stok ──────────────────────────────────────────
create table if not exists monitoring_konveksi.inventory_receipts (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references monitoring_konveksi.orders(id) on delete restrict,
  kode_produksi    text not null,
  status           text not null default 'pending' check (status in ('pending', 'verified', 'cancelled')),
  qc_done_at       timestamptz not null default timezone('utc', now()),
  -- snapshot saat verifikasi: [{sku_key, jenis_produksi, jenis_name, varian, warna, ukuran, expected, counted}]
  -- kosong selama pending (daftar baris dihitung live dari orders.items)
  lines            jsonb not null default '[]'::jsonb,
  total_expected   integer,
  total_counted    integer,
  note             text,
  verified_by      uuid,
  verified_by_name text,
  verified_at      timestamptz,
  created_at       timestamptz not null default timezone('utc', now()),
  check (status <> 'verified' or (verified_at is not null and total_counted is not null))
);
create index if not exists inventory_receipts_status_idx on monitoring_konveksi.inventory_receipts (status, qc_done_at desc);

-- ─── 3. Buku besar stok (hanya tambah) ───────────────────────────────────────
create table if not exists monitoring_konveksi.inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default timezone('utc', now()),
  receipt_id      uuid not null references monitoring_konveksi.inventory_receipts(id) on delete restrict,
  order_id        uuid not null references monitoring_konveksi.orders(id) on delete restrict,
  kode_produksi   text not null,
  sku_key         text not null check (char_length(sku_key) between 1 and 400),
  jenis_produksi  text not null,
  jenis_name      text not null default '',
  varian          text not null default '',
  warna           text not null default '',
  ukuran          text not null default '',
  delta           integer not null check (delta <> 0),
  note            text,
  by_id           uuid,
  by_name         text,
  unique (receipt_id, sku_key)
);
create index if not exists inventory_movements_sku_idx     on monitoring_konveksi.inventory_movements (sku_key, created_at desc);
create index if not exists inventory_movements_created_idx on monitoring_konveksi.inventory_movements (created_at desc);
create index if not exists inventory_movements_order_idx   on monitoring_konveksi.inventory_movements (order_id);

create or replace function monitoring_konveksi.inv_movements_immutable()
returns trigger language plpgsql set search_path = monitoring_konveksi, public as $$
begin
  raise exception 'INV: Buku besar stok tidak boleh diubah atau dihapus';
end $$;

drop trigger if exists inventory_movements_no_change on monitoring_konveksi.inventory_movements;
create trigger inventory_movements_no_change
  before update or delete on monitoring_konveksi.inventory_movements
  for each row execute function monitoring_konveksi.inv_movements_immutable();

drop trigger if exists inventory_movements_no_truncate on monitoring_konveksi.inventory_movements;
create trigger inventory_movements_no_truncate
  before truncate on monitoring_konveksi.inventory_movements
  for each statement execute function monitoring_konveksi.inv_movements_immutable();

-- ─── 4. Saldo per SKU ────────────────────────────────────────────────────────
-- Dikelompokkan per sku_key (identitas stok). Label (nama jenis, varian, warna, ukuran) diambil dari
-- pergerakan TERBARU, jadi ejaan label yang berbeda untuk kunci yang sama tidak memecah baris.
create or replace view monitoring_konveksi.v_inventory_stock as
select
  m.sku_key,
  (array_agg(m.jenis_produksi order by m.created_at desc, m.id))[1] as jenis_produksi,
  (array_agg(m.jenis_name     order by m.created_at desc, m.id))[1] as jenis_name,
  (array_agg(m.varian         order by m.created_at desc, m.id))[1] as varian,
  (array_agg(m.warna          order by m.created_at desc, m.id))[1] as warna,
  (array_agg(m.ukuran         order by m.created_at desc, m.id))[1] as ukuran,
  sum(m.delta)::int       as qty,
  max(m.created_at)       as last_in_at
from monitoring_konveksi.inventory_movements m
group by m.sku_key;

-- ─── 5. Trigger otomatis saat QC ─────────────────────────────────────────────
-- QC dianggap lolos bila tahap `qc` isCompleted = true dan qc.passed = true (lihat submitQC di
-- hooks/useOrderDetail.ts). Dibuat lewat trigger, bukan kode klien, supaya benar untuk jalur apa pun
-- yang mengubah pesanan.
create or replace function monitoring_konveksi.inv_on_order_qc()
returns trigger language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_qc      jsonb;
  v_passed  boolean;
  v_done_at timestamptz;
  v_rec     record;
  v_found   boolean;
begin
  if new.tujuan is distinct from 'stok' then return new; end if;

  select e.value into v_qc
    from jsonb_array_elements(case when jsonb_typeof(new.steps) = 'array' then new.steps else '[]'::jsonb end) e
   where e.value ->> 'key' = 'qc'
   limit 1;

  v_passed := coalesce((v_qc ->> 'isCompleted')::boolean, false)
          and coalesce((v_qc -> 'qc' ->> 'passed')::boolean, false);

  select id, status into v_rec from inventory_receipts where order_id = new.id for update;
  v_found := found;

  if v_passed then
    begin
      v_done_at := coalesce(nullif(v_qc ->> 'completedAt', '')::timestamptz, now());
    exception when others then
      v_done_at := now();
    end;

    if not v_found then
      insert into inventory_receipts (order_id, kode_produksi, status, qc_done_at)
        values (new.id, new.kode_produksi, 'pending', v_done_at);
      insert into order_logs (order_id, kode_produksi, category, event_name, description, old_value, new_value, oleh)
        values (new.id, new.kode_produksi, 'SISTEM', 'Menunggu Verifikasi Stok',
                'QC lolos: hasil produksi stok menunggu verifikasi petugas', new.status, new.status, 'Sistem');
    elsif v_rec.status = 'cancelled' then
      update inventory_receipts set status = 'pending', qc_done_at = v_done_at, kode_produksi = new.kode_produksi
       where id = v_rec.id;
      insert into order_logs (order_id, kode_produksi, category, event_name, description, old_value, new_value, oleh)
        values (new.id, new.kode_produksi, 'SISTEM', 'Menunggu Verifikasi Stok',
                'QC lolos lagi: hasil produksi stok kembali menunggu verifikasi', new.status, new.status, 'Sistem');
    end if;
    -- pending / verified: tidak berbuat apa-apa
  else
    if v_found then
      if v_rec.status = 'verified' then
        raise exception 'INV: Stok pesanan ini sudah diverifikasi, QC tidak bisa dibatalkan';
      elsif v_rec.status = 'pending' then
        update inventory_receipts set status = 'cancelled' where id = v_rec.id;
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_orders_inv_qc on monitoring_konveksi.orders;
create trigger trg_orders_inv_qc
  after update on monitoring_konveksi.orders
  for each row
  when (old.steps is distinct from new.steps and new.tujuan = 'stok')
  execute function monitoring_konveksi.inv_on_order_qc();

-- ─── 6. Verifikasi ───────────────────────────────────────────────────────────
-- p_lines (disusun SERVER dari orders.items, bukan dari klien):
--   [{sku_key, jenis_produksi, jenis_name, varian, warna, ukuran, expected, counted}]
create or replace function monitoring_konveksi.inv_verify_receipt(
  p_receipt uuid, p_actor uuid, p_actor_name text, p_lines jsonb, p_note text
) returns jsonb
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_rec      record;
  v_order    record;
  v_qc       jsonb;
  v_line     jsonb;
  v_seen     text[] := '{}';
  v_key      text;
  v_exp      integer;
  v_cnt      integer;
  v_diff     boolean := false;
  v_tot_exp  integer := 0;
  v_tot_cnt  integer := 0;
  v_moves    integer := 0;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_actor    text := left(coalesce(nullif(btrim(p_actor_name), ''), 'User'), 120);
begin
  select * into v_rec from inventory_receipts where id = p_receipt for update;
  if not found then raise exception 'INV: Catatan stok tidak ditemukan'; end if;
  if v_rec.status = 'verified'  then raise exception 'INV: Catatan ini sudah diverifikasi'; end if;
  if v_rec.status = 'cancelled' then raise exception 'INV: Catatan ini dibatalkan karena QC dibuka lagi'; end if;

  select id, kode_produksi, status, tujuan, deleted_at, steps into v_order
    from orders where id = v_rec.order_id for update;
  if not found or v_order.deleted_at is not null then raise exception 'INV: Pesanan ada di Sampah, pulihkan dulu sebelum verifikasi'; end if;
  if v_order.tujuan is distinct from 'stok' then raise exception 'INV: Pesanan ini bukan pesanan stok'; end if;

  select e.value into v_qc
    from jsonb_array_elements(case when jsonb_typeof(v_order.steps) = 'array' then v_order.steps else '[]'::jsonb end) e
   where e.value ->> 'key' = 'qc' limit 1;
  if not (coalesce((v_qc ->> 'isCompleted')::boolean, false) and coalesce((v_qc -> 'qc' ->> 'passed')::boolean, false)) then
    raise exception 'INV: QC pesanan ini belum lolos';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'INV: Baris hasil produksi kosong. Isi rincian pesanan di Edit Pesanan dulu';
  end if;

  -- Validasi semua baris dulu, baru menulis apa pun.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_key := v_line ->> 'sku_key';
    if v_key is null or btrim(v_key) = '' or char_length(v_key) > 400 then raise exception 'INV: Ada baris tanpa kunci stok'; end if;
    if v_key = any (v_seen) then raise exception 'INV: Ada baris ganda pada daftar verifikasi'; end if;
    v_seen := v_seen || v_key;
    if (v_line ->> 'expected') is null or (v_line ->> 'expected') !~ '^\d{1,7}$' then raise exception 'INV: Hasil produksi tidak valid'; end if;
    if (v_line ->> 'counted')  is null or (v_line ->> 'counted')  !~ '^\d{1,7}$' then raise exception 'INV: Hitungan fisik harus bilangan bulat, tidak negatif'; end if;
    v_exp := (v_line ->> 'expected')::integer;
    v_cnt := (v_line ->> 'counted')::integer;
    if v_cnt <> v_exp then v_diff := true; end if;
    v_tot_exp := v_tot_exp + v_exp;
    v_tot_cnt := v_tot_cnt + v_cnt;
  end loop;

  if v_diff and (v_note is null or char_length(v_note) < 3) then
    raise exception 'INV: Alasan selisih wajib diisi';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_exp := (v_line ->> 'expected')::integer;
    v_cnt := (v_line ->> 'counted')::integer;
    if v_cnt > 0 then
      insert into inventory_movements
        (receipt_id, order_id, kode_produksi, sku_key, jenis_produksi, jenis_name, varian, warna, ukuran, delta, note, by_id, by_name)
      values
        (v_rec.id, v_rec.order_id, v_rec.kode_produksi, v_line ->> 'sku_key',
         coalesce(v_line ->> 'jenis_produksi', ''), left(coalesce(v_line ->> 'jenis_name', ''), 120),
         left(coalesce(v_line ->> 'varian', ''), 120), left(coalesce(v_line ->> 'warna', ''), 120),
         left(coalesce(v_line ->> 'ukuran', ''), 60), v_cnt,
         case when v_cnt <> v_exp then left(v_note, 500) else null end,
         p_actor, v_actor);
      v_moves := v_moves + 1;
    end if;
  end loop;

  update inventory_receipts set
      status = 'verified',
      lines = p_lines,
      total_expected = v_tot_exp,
      total_counted = v_tot_cnt,
      note = left(v_note, 500),
      verified_by = p_actor,
      verified_by_name = v_actor,
      verified_at = now()
    where id = v_rec.id;

  insert into order_logs (order_id, kode_produksi, category, event_name, description, old_value, new_value, oleh, metadata)
  values (v_rec.order_id, v_rec.kode_produksi, 'SISTEM', 'Stok Diverifikasi',
          'Stok diverifikasi: ' || v_tot_cnt || ' dari ' || v_tot_exp || ' pcs'
            || case when v_diff then ' (ada selisih: ' || left(v_note, 200) || ')' else '' end,
          v_order.status, v_order.status, v_actor,
          jsonb_build_object('receipt_id', v_rec.id, 'total_expected', v_tot_exp, 'total_counted', v_tot_cnt));

  return jsonb_build_object('receipt_id', v_rec.id, 'total_expected', v_tot_exp, 'total_counted', v_tot_cnt, 'movements', v_moves);
end $$;

-- ─── 7. Pesanan stok tidak ditagih ───────────────────────────────────────────
-- v_order_finance dibaca view lain (v_receivable_aging, fin_overview, fin_report, fin_todo), jadi
-- cukup mengecualikan pesanan stok di sini. Kolom, urutan, dan tipe SAMA dengan versi migration 011.
create or replace view monitoring_konveksi.v_order_finance as
select
  o.id                     as order_id,
  o.kode_produksi,
  o.nama_pemesan,
  o.jenis_produksi,
  o.jumlah,
  o.tanggal_masuk,
  o.deadline,
  o.status                 as order_status,
  i.id                     as invoice_id,
  i.version                as invoice_version,
  i.due_date,
  coalesce(i.total, 0)::bigint as total,
  coalesce(p.paid_verified, 0)::bigint as paid_verified,
  coalesce(p.paid_pending, 0)::bigint  as paid_pending,
  greatest(coalesce(i.total, 0) - coalesce(p.paid_verified, 0), 0)::bigint as balance,
  greatest(coalesce(p.paid_verified, 0) - coalesce(i.total, 0), 0)::bigint as overpaid,
  (case
     when i.id is null                                  then 'Belum Ditagih'
     when coalesce(p.paid_verified, 0) <= 0             then 'Belum Bayar'
     when coalesce(p.paid_verified, 0) > i.total        then 'Kelebihan Bayar'
     when coalesce(p.paid_verified, 0) = i.total        then 'Lunas'
     else 'DP'
   end)::text              as payment_status,
  o.kategori
from monitoring_konveksi.orders o
left join monitoring_konveksi.order_invoices i on i.order_id = o.id and i.status = 'active'
left join (
  select order_id,
         sum(case when kind = 'refund' then -amount else amount end) filter (where status = 'verified') as paid_verified,
         sum(amount) filter (where status = 'pending' and kind <> 'refund')                              as paid_pending
    from monitoring_konveksi.order_payments
   group by order_id
) p on p.order_id = o.id
where o.deleted_at is null
  and o.tujuan <> 'stok';

-- Lapis kedua: database menolak tagihan atau pembayaran untuk pesanan stok, apa pun jalurnya.
create or replace function monitoring_konveksi.inv_block_stock_finance()
returns trigger language plpgsql security definer set search_path = monitoring_konveksi, public as $$
begin
  if exists (select 1 from orders where id = new.order_id and tujuan = 'stok') then
    raise exception 'FIN: Pesanan stok tidak ditagih';
  end if;
  return new;
end $$;

drop trigger if exists trg_inv_block_invoice on monitoring_konveksi.order_invoices;
create trigger trg_inv_block_invoice
  before insert on monitoring_konveksi.order_invoices
  for each row execute function monitoring_konveksi.inv_block_stock_finance();

drop trigger if exists trg_inv_block_payment on monitoring_konveksi.order_payments;
create trigger trg_inv_block_payment
  before insert on monitoring_konveksi.order_payments
  for each row execute function monitoring_konveksi.inv_block_stock_finance();

-- ─── 8. Penjaga hapus permanen ───────────────────────────────────────────────
-- Pesanan stok yang sudah menambah stok tidak boleh dihapus permanen (jejak stok harus tetap ada).
-- Catatan yang belum diverifikasi (pending / cancelled) ikut dibuang bersama pesanannya.
-- Foreign key `on delete restrict` tetap jadi pengaman terakhir.
create or replace function monitoring_konveksi.inv_block_order_delete()
returns trigger language plpgsql security definer set search_path = monitoring_konveksi, public as $$
begin
  if exists (select 1 from inventory_receipts where order_id = old.id and status = 'verified') then
    raise exception 'INV: Pesanan stok ini sudah menambah stok, tidak bisa dihapus permanen';
  end if;
  delete from inventory_receipts where order_id = old.id and status <> 'verified';
  return old;
end $$;

drop trigger if exists trg_orders_inv_delete on monitoring_konveksi.orders;
create trigger trg_orders_inv_delete
  before delete on monitoring_konveksi.orders
  for each row execute function monitoring_konveksi.inv_block_order_delete();

-- ─── 9. Akses: hanya server (service_role) ───────────────────────────────────
alter table monitoring_konveksi.inventory_receipts  enable row level security;
alter table monitoring_konveksi.inventory_movements enable row level security;

revoke all on monitoring_konveksi.inventory_receipts,
              monitoring_konveksi.inventory_movements,
              monitoring_konveksi.v_inventory_stock
  from public, anon, authenticated;

grant select on monitoring_konveksi.inventory_receipts,
                monitoring_konveksi.inventory_movements,
                monitoring_konveksi.v_inventory_stock
  to service_role;

revoke all on function monitoring_konveksi.inv_verify_receipt(uuid, uuid, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function monitoring_konveksi.inv_verify_receipt(uuid, uuid, text, jsonb, text)
  to service_role;

commit;

notify pgrst, 'reload schema';
