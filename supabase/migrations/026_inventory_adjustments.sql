-- 026_inventory_adjustments.sql (Penyesuaian Stok, V.1.26)
--
-- Koreksi salah verifikasi, barang rusak, barang hilang, dan hitung fisik berkala (opname).
-- Semuanya ditulis sebagai baris tambah atau kurang di inventory_movements, tidak pernah mengubah
-- baris lama, jadi riwayat tetap utuh.
--
-- Isi:
--   1. inventory_movements: kolom kind dan adjustment_id; receipt_id, order_id, kode_produksi boleh kosong
--   2. Pemeriksaan: baris non-produksi wajib beralasan dan tidak menempel ke catatan produksi
--   3. Trigger kunci per SKU, supaya saldo yang dibaca fungsi penyesuaian tidak berubah di tengah jalan
--   4. v_inventory_stock: last_in_at hanya dari stok masuk
--   5. inv_adjust_stock: satu transaksi, hanya service_role
--
-- Prasyarat: 024 sudah dijalankan. Aman dijalankan ulang (idempotent).

begin;

alter table monitoring_konveksi.inventory_movements
  add column if not exists kind text not null default 'masuk',
  add column if not exists adjustment_id uuid;

alter table monitoring_konveksi.inventory_movements
  alter column receipt_id drop not null,
  alter column order_id drop not null,
  alter column kode_produksi drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_movements_kind_check'
                  and conrelid = 'monitoring_konveksi.inventory_movements'::regclass) then
    alter table monitoring_konveksi.inventory_movements
      add constraint inventory_movements_kind_check
      check (kind in ('masuk', 'koreksi', 'rusak', 'hilang', 'opname'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_movements_source_check'
                  and conrelid = 'monitoring_konveksi.inventory_movements'::regclass) then
    alter table monitoring_konveksi.inventory_movements
      add constraint inventory_movements_source_check
      check (
        (kind = 'masuk' and receipt_id is not null and order_id is not null and kode_produksi is not null)
        or (kind <> 'masuk' and receipt_id is null and adjustment_id is not null
            and char_length(btrim(coalesce(note, ''))) >= 3)
      );
  end if;
end $$;

create index if not exists inventory_movements_adjustment_idx
  on monitoring_konveksi.inventory_movements (adjustment_id) where adjustment_id is not null;

-- Fungsi verifikasi dan penyesuaian menulis ke SKU yang sama; kunci ini membuat keduanya antre per SKU.
create or replace function monitoring_konveksi.inv_lock_sku()
returns trigger language plpgsql set search_path = monitoring_konveksi, public as $$
begin
  perform pg_advisory_xact_lock(hashtext('inv_sku:' || new.sku_key));
  return new;
end $$;

drop trigger if exists inventory_movements_lock_sku on monitoring_konveksi.inventory_movements;
create trigger inventory_movements_lock_sku
  before insert on monitoring_konveksi.inventory_movements
  for each row execute function monitoring_konveksi.inv_lock_sku();

-- Kolom dan urutan sama dengan versi 024; hanya last_in_at yang kini mengabaikan penyesuaian.
create or replace view monitoring_konveksi.v_inventory_stock as
select
  m.sku_key,
  (array_agg(m.jenis_produksi order by m.created_at desc, m.id))[1] as jenis_produksi,
  (array_agg(m.jenis_name     order by m.created_at desc, m.id))[1] as jenis_name,
  (array_agg(m.varian         order by m.created_at desc, m.id))[1] as varian,
  (array_agg(m.warna          order by m.created_at desc, m.id))[1] as warna,
  (array_agg(m.ukuran         order by m.created_at desc, m.id))[1] as ukuran,
  sum(m.delta)::int       as qty,
  max(m.created_at) filter (where m.kind = 'masuk') as last_in_at
from monitoring_konveksi.inventory_movements m
group by m.sku_key;

-- p_lines disusun SERVER:
--   koreksi, rusak, hilang -> [{sku_key, delta}]  (rusak dan hilang harus negatif)
--   opname                 -> [{sku_key, counted}]  (delta = counted - saldo saat ini)
-- Opname yang hitungannya sama dengan saldo tidak menulis apa-apa.
create or replace function monitoring_konveksi.inv_adjust_stock(
  p_actor uuid, p_actor_name text, p_kind text, p_reason text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor  text := left(coalesce(nullif(btrim(p_actor_name), ''), 'User'), 120);
  v_adj    uuid := gen_random_uuid();
  v_line   jsonb;
  v_key    text;
  v_keys   text[] := '{}';
  v_field  text := case when p_kind = 'opname' then 'counted' else 'delta' end;
  v_raw    text;
  v_cur    integer;
  v_delta  integer;
  v_label  record;
  v_moves  integer := 0;
  v_total  integer := 0;
begin
  if p_kind is null or p_kind not in ('koreksi', 'rusak', 'hilang', 'opname') then
    raise exception 'INV: Jenis penyesuaian tidak dikenal';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'INV: Alasan penyesuaian wajib diisi'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'INV: Pilih minimal satu barang';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_key := v_line ->> 'sku_key';
    v_raw := v_line ->> v_field;
    if v_key is null or btrim(v_key) = '' or char_length(v_key) > 400 then raise exception 'INV: Ada baris tanpa kunci stok'; end if;
    if v_key = any (v_keys) then raise exception 'INV: Ada barang ganda pada daftar'; end if;
    v_keys := v_keys || v_key;
    if v_raw is null or v_raw !~ (case when p_kind = 'opname' then '^\d{1,7}$' else '^-?\d{1,7}$' end) then
      raise exception 'INV: Jumlah harus bilangan bulat';
    end if;
    if p_kind <> 'opname' and v_raw::integer = 0 then raise exception 'INV: Jumlah penyesuaian tidak boleh nol'; end if;
    if p_kind in ('rusak', 'hilang') and v_raw::integer > 0 then raise exception 'INV: Barang rusak atau hilang mengurangi stok'; end if;
  end loop;

  -- Kunci urut supaya dua penyesuaian bersamaan tidak saling menunggu.
  for v_key in select k from unnest(v_keys) k order by k loop
    perform pg_advisory_xact_lock(hashtext('inv_sku:' || v_key));
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_key := v_line ->> 'sku_key';

    select coalesce(sum(delta), 0)::int into v_cur from inventory_movements where sku_key = v_key;
    select jenis_produksi, jenis_name, varian, warna, ukuran into v_label
      from inventory_movements where sku_key = v_key order by created_at desc, id desc limit 1;
    if not found then raise exception 'INV: Barang belum pernah masuk stok, tidak bisa disesuaikan'; end if;

    v_delta := case when p_kind = 'opname' then (v_line ->> 'counted')::integer - v_cur
                    else (v_line ->> 'delta')::integer end;
    continue when v_delta = 0;

    if v_cur + v_delta < 0 then
      raise exception 'INV: Stok % hanya % pcs, tidak cukup untuk dikurangi % pcs',
        concat_ws(' · ', nullif(v_label.jenis_name, ''), nullif(v_label.varian, ''),
                  nullif(v_label.warna, ''), nullif(v_label.ukuran, '')),
        v_cur, abs(v_delta);
    end if;

    insert into inventory_movements
      (kind, adjustment_id, sku_key, jenis_produksi, jenis_name, varian, warna, ukuran, delta, note, by_id, by_name)
    values
      (p_kind, v_adj, v_key, v_label.jenis_produksi, v_label.jenis_name, v_label.varian, v_label.warna,
       v_label.ukuran, v_delta, left(v_reason, 500), p_actor, v_actor);
    v_moves := v_moves + 1;
    v_total := v_total + v_delta;
  end loop;

  return jsonb_build_object('adjustment_id', v_adj, 'movements', v_moves, 'total_delta', v_total);
end $$;

revoke all on function monitoring_konveksi.inv_adjust_stock(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function monitoring_konveksi.inv_adjust_stock(uuid, text, text, text, jsonb)
  to service_role;

commit;

notify pgrst, 'reload schema';

-- Pemeriksaan (manual):
--   select kind, count(*), sum(delta) from monitoring_konveksi.inventory_movements group by kind;
