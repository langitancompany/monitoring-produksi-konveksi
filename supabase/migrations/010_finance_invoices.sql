-- 010_finance_invoices.sql  (Bagian 6, LANGKAH 6.2 — Tagihan)
--
-- Isi:
--   1. order_invoices        — tagihan per pesanan, berversi (terbit → revisi; versi lama 'superseded').
--                              Tidak bisa diubah/dihapus dari aplikasi; hanya fin_issue_invoice() yang menulis.
--   2. fin_issue_invoice()   — menerbitkan / merevisi tagihan. TOTAL DIHITUNG DI DATABASE dari baris item
--                              pesanan (orders.items) × harga per pcs; angka total dari browser tidak dipercaya.
--   3. v_order_finance       — posisi keuangan tiap pesanan. Status ("Belum Ditagih", "Belum Bayar", ...)
--                              DIHITUNG di sini, bukan diinput. Kolom pembayaran masih 0 sampai langkah 6.3
--                              (6.3 mengganti view ini dengan create or replace — kolomnya sudah disiapkan).
--   4. Penjaga hapus pesanan — pesanan yang sudah punya tagihan tidak bisa dihapus permanen dari Sampah.
--
-- Prasyarat: 001–009 sudah dijalankan. Aman dijalankan ulang (idempotent).
-- Dijalankan di SQL Editor sebagai postgres (pemilik tabel).

begin;

-- ─── 1. Tagihan ──────────────────────────────────────────────────────────────
create table if not exists monitoring_konveksi.order_invoices (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references monitoring_konveksi.orders(id) on delete restrict,
  version          integer not null check (version >= 1),
  status           text not null default 'active' check (status in ('active', 'superseded')),
  -- Rincian saat terbit (dibekukan): [{item_id, jenis_produksi, nama, jumlah, harga_per_pcs, subtotal}]
  pricing_snapshot jsonb not null,
  total_pcs        integer not null check (total_pcs >= 1),
  subtotal         bigint  not null check (subtotal > 0),
  discount         bigint  not null default 0 check (discount >= 0),
  total            bigint  not null check (total > 0),
  reason           text,
  due_date         date,
  issued_by        uuid,
  issued_by_name   text,
  issued_at        timestamptz not null default timezone('utc', now()),
  check (total = subtotal - discount),
  unique (order_id, version)
);
-- Satu pesanan hanya boleh punya SATU tagihan aktif.
create unique index if not exists order_invoices_one_active_uq
  on monitoring_konveksi.order_invoices (order_id) where status = 'active';
create index if not exists order_invoices_order_idx on monitoring_konveksi.order_invoices (order_id, version desc);

-- Tagihan tidak pernah dihapus; satu-satunya perubahan yang boleh: active → superseded.
create or replace function monitoring_konveksi.fin_invoice_guard()
returns trigger language plpgsql set search_path = monitoring_konveksi, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'FIN: Tagihan tidak boleh dihapus. Terbitkan revisi bila ada yang salah';
  end if;
  if old.status = 'active' and new.status = 'superseded'
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception 'FIN: Tagihan tidak boleh diubah. Terbitkan revisi bila ada yang salah';
end $$;

drop trigger if exists order_invoices_guard on monitoring_konveksi.order_invoices;
create trigger order_invoices_guard
  before update or delete on monitoring_konveksi.order_invoices
  for each row execute function monitoring_konveksi.fin_invoice_guard();

drop trigger if exists order_invoices_no_truncate on monitoring_konveksi.order_invoices;
create trigger order_invoices_no_truncate
  before truncate on monitoring_konveksi.order_invoices
  for each statement execute function monitoring_konveksi.fin_invoice_guard();

-- ─── 2. Terbit / revisi tagihan ──────────────────────────────────────────────
-- p_prices: objek { "<id item>": harga per pcs (rupiah bulat > 0) } — wajib ada untuk SEMUA item pesanan.
-- Jumlah per item diambil dari orders.items di sini (bukan dari browser).
create or replace function monitoring_konveksi.fin_issue_invoice(
  p_order uuid, p_actor uuid, p_actor_name text,
  p_prices jsonb, p_discount bigint, p_reason text, p_due_date date
) returns uuid
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_order     record;
  v_active    record;
  v_item      jsonb;
  v_item_id   text;
  v_jumlah    integer;
  v_price_txt text;
  v_price     bigint;
  v_lines     jsonb := '[]'::jsonb;
  v_subtotal  bigint := 0;
  v_pcs       integer := 0;
  v_discount  bigint := coalesce(p_discount, 0);
  v_total     bigint;
  v_version   integer := 1;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id        uuid;
  v_count     integer := 0;
  v_key       text;
begin
  select id, kode_produksi, items, tanggal_masuk, deleted_at into v_order
    from orders where id = p_order for update;
  if not found or v_order.deleted_at is not null then raise exception 'FIN: Pesanan tidak ditemukan'; end if;

  if p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'FIN: Harga per item wajib diisi';
  end if;
  if jsonb_typeof(v_order.items) <> 'array' or jsonb_array_length(v_order.items) = 0 then
    raise exception 'FIN: Pesanan belum punya rincian item. Isi item di Edit Pesanan dulu';
  end if;

  for v_item in select * from jsonb_array_elements(v_order.items) loop
    v_item_id := v_item ->> 'id';
    if v_item_id is null or v_item_id = '' then raise exception 'FIN: Ada item pesanan tanpa id. Simpan ulang pesanan di Edit Pesanan'; end if;
    if (v_item ->> 'jumlah') !~ '^\d{1,7}$' or (v_item ->> 'jumlah')::integer < 1 then
      raise exception 'FIN: Jumlah item pesanan tidak valid';
    end if;
    v_jumlah := (v_item ->> 'jumlah')::integer;

    v_price_txt := p_prices ->> v_item_id;
    if v_price_txt is null then
      raise exception 'FIN: Harga untuk item "%" belum diisi',
        coalesce((select name from production_types where value = v_item ->> 'jenis_produksi'), v_item ->> 'jenis_produksi');
    end if;
    if jsonb_typeof(p_prices -> v_item_id) <> 'number' or v_price_txt !~ '^\d{1,11}$' or v_price_txt::bigint < 1 then
      raise exception 'FIN: Harga per pcs harus bilangan bulat lebih dari 0';
    end if;
    v_price := v_price_txt::bigint;

    v_lines := v_lines || jsonb_build_object(
      'item_id',        v_item_id,
      'jenis_produksi', v_item ->> 'jenis_produksi',
      'nama',           coalesce((select name from production_types where value = v_item ->> 'jenis_produksi'), v_item ->> 'jenis_produksi'),
      'jumlah',         v_jumlah,
      'harga_per_pcs',  v_price,
      'subtotal',       v_price * v_jumlah
    );
    v_subtotal := v_subtotal + v_price * v_jumlah;
    v_pcs := v_pcs + v_jumlah;
    v_count := v_count + 1;
  end loop;

  -- Harga untuk item yang tidak ada di pesanan (mis. item dihapus di layar lain) → tolak, jangan diabaikan diam-diam.
  for v_key in select jsonb_object_keys(p_prices) loop
    if not exists (select 1 from jsonb_array_elements(v_order.items) e where e ->> 'id' = v_key) then
      raise exception 'FIN: Rincian item pesanan sudah berubah. Muat ulang lalu isi harga lagi';
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'FIN: Total tagihan harus lebih dari 0'; end if;
  if v_discount < 0 then raise exception 'FIN: Diskon tidak valid'; end if;
  if v_discount >= v_subtotal then raise exception 'FIN: Diskon tidak boleh sama dengan atau melebihi subtotal'; end if;
  v_total := v_subtotal - v_discount;
  if p_due_date is not null and p_due_date < v_order.tanggal_masuk then
    raise exception 'FIN: Jatuh tempo tidak boleh sebelum tanggal pesanan masuk';
  end if;

  select * into v_active from order_invoices where order_id = p_order and status = 'active' for update;
  if found then
    if v_reason is null then raise exception 'FIN: Alasan revisi tagihan wajib diisi'; end if;
    v_version := v_active.version + 1;
    update order_invoices set status = 'superseded' where id = v_active.id;
  end if;

  insert into order_invoices (
    order_id, version, status, pricing_snapshot, total_pcs, subtotal, discount, total,
    reason, due_date, issued_by, issued_by_name
  ) values (
    p_order, v_version, 'active', v_lines, v_pcs, v_subtotal, v_discount, v_total,
    left(v_reason, 500), p_due_date, p_actor, left(p_actor_name, 120)
  ) returning id into v_id;

  perform fin_audit(
    p_actor, p_actor_name,
    case when v_version = 1 then 'invoice.issue' else 'invoice.revise' end,
    'invoice', v_id, p_order,
    case when v_version = 1 then null
         else jsonb_build_object('version', v_active.version, 'subtotal', v_active.subtotal,
                                 'discount', v_active.discount, 'total', v_active.total) end,
    jsonb_build_object('version', v_version, 'subtotal', v_subtotal, 'discount', v_discount,
                       'total', v_total, 'total_pcs', v_pcs, 'pricing_snapshot', v_lines),
    v_reason
  );
  return v_id;
end $$;

revoke all on function monitoring_konveksi.fin_issue_invoice(uuid, uuid, text, jsonb, bigint, text, date)
  from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_issue_invoice(uuid, uuid, text, jsonb, bigint, text, date)
  to service_role;

-- ─── 3. Posisi keuangan per pesanan ──────────────────────────────────────────
-- Kolom pembayaran (paid_*, overpaid) sementara 0; langkah 6.3 menggantinya (create or replace,
-- kolom & tipenya sama). Pesanan di Sampah tidak ikut.
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
  0::bigint                as paid_verified,
  0::bigint                as paid_pending,
  coalesce(i.total, 0)::bigint as balance,
  0::bigint                as overpaid,
  case when i.id is null then 'Belum Ditagih' else 'Belum Bayar' end::text as payment_status,
  o.kategori
from monitoring_konveksi.orders o
left join monitoring_konveksi.order_invoices i on i.order_id = o.id and i.status = 'active'
where o.deleted_at is null;

-- ─── 4. Penjaga hapus permanen pesanan ───────────────────────────────────────
create or replace function monitoring_konveksi.fin_block_order_delete()
returns trigger language plpgsql security definer set search_path = monitoring_konveksi, public as $$
begin
  if exists (select 1 from order_invoices where order_id = old.id) then
    raise exception 'Pesanan % sudah punya tagihan keuangan, jadi tidak bisa dihapus permanen. Pesanan tetap boleh disimpan di Sampah.', old.kode_produksi;
  end if;
  return old;
end $$;

drop trigger if exists trg_fin_block_order_delete on monitoring_konveksi.orders;
create trigger trg_fin_block_order_delete
  before delete on monitoring_konveksi.orders
  for each row execute function monitoring_konveksi.fin_block_order_delete();

-- ─── 5. Akses: hanya server (service_role), tabel tagihan hanya BACA ─────────
alter table monitoring_konveksi.order_invoices enable row level security;
revoke all on monitoring_konveksi.order_invoices, monitoring_konveksi.v_order_finance
  from public, anon, authenticated;
grant select on monitoring_konveksi.order_invoices to service_role;
grant select on monitoring_konveksi.v_order_finance to service_role;

commit;

notify pgrst, 'reload schema';
