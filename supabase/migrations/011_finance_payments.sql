-- 011_finance_payments.sql  (Bagian 6, LANGKAH 6.3 — Pembayaran)
--
-- Isi:
--   1. Pembantu: fin_setting_bool(), fin_rp()
--   2. order_payments     — satu baris per transaksi uang (DP / cicilan / pelunasan / refund).
--                           Alur: pending → verified | rejected, lalu verified/pending → void (koreksi).
--                           Tidak pernah dihapus; hanya kolom status/verifikasi/void yang boleh berubah.
--   3. fin_record_payment / fin_verify_payment / fin_void_payment — SEMUA aturan uang ditegakkan di sini
--                           (bukti wajib, tidak boleh kelebihan bayar, pencatat ≠ pemverifikasi, refund ≤ uang masuk).
--   4. v_order_finance    — DIGANTI (create or replace): paid_verified / paid_pending / sisa / kelebihan
--                           dan status DP / Lunas / Kelebihan Bayar kini dihitung dari pembayaran.
--   5. fin_issue_invoice  — DIGANTI: revisi tagihan tidak boleh menurunkan total di bawah uang terverifikasi.
--   6. Bucket privat `finance-proofs` untuk bukti (bila skema storage ada).
--
-- Prasyarat: 001–010 sudah dijalankan. Aman dijalankan ulang (idempotent).
-- Dijalankan di SQL Editor sebagai postgres (pemilik tabel).

begin;

-- ─── 1. Pembantu ─────────────────────────────────────────────────────────────
create or replace function monitoring_konveksi.fin_setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = monitoring_konveksi, public as $$
  select coalesce(
    (select (value)::text::boolean from monitoring_konveksi.finance_settings
      where key = p_key and jsonb_typeof(value) = 'boolean'),
    p_default);
$$;

-- Rupiah dengan titik ribuan (untuk pesan galat), mis. 1500000 → 1.500.000
create or replace function monitoring_konveksi.fin_rp(p_amount bigint)
returns text language sql immutable as $$
  select replace(to_char(coalesce(p_amount, 0), 'FM999,999,999,999,999'), ',', '.');
$$;

revoke all on function monitoring_konveksi.fin_setting_bool(text, boolean) from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_rp(bigint) from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_setting_bool(text, boolean) to service_role;
grant execute on function monitoring_konveksi.fin_rp(bigint) to service_role;

-- ─── 2. Pembayaran ───────────────────────────────────────────────────────────
create table if not exists monitoring_konveksi.order_payments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references monitoring_konveksi.orders(id) on delete restrict,
  invoice_id       uuid references monitoring_konveksi.order_invoices(id) on delete restrict,
  kind             text not null check (kind in ('dp', 'cicilan', 'pelunasan', 'refund')),
  amount           bigint not null check (amount > 0 and amount <= 100000000000),
  paid_at          date not null,
  method           text not null check (method in ('transfer', 'tunai', 'qris', 'lainnya')),
  account_id       uuid not null references monitoring_konveksi.finance_accounts(id) on delete restrict,
  reference_no     text check (char_length(reference_no) <= 100),
  payer_name       text check (char_length(payer_name) <= 100),
  note             text check (char_length(note) <= 500),
  proof_path       text,
  status           text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'void')),
  recorded_by      uuid,
  recorded_by_name text,
  recorded_at      timestamptz not null default timezone('utc', now()),
  verified_by      uuid,
  verified_by_name text,
  verified_at      timestamptz,
  reject_reason    text,
  void_by          uuid,
  void_by_name     text,
  void_at          timestamptz,
  void_reason      text,
  -- status harus selalu disertai bukti prosesnya
  check (status <> 'verified' or (verified_at is not null and verified_by_name is not null)),
  check (status <> 'rejected' or (verified_at is not null and nullif(btrim(reject_reason), '') is not null)),
  check (status <> 'void'     or (void_at is not null and nullif(btrim(void_reason), '') is not null))
);
create index if not exists order_payments_order_idx  on monitoring_konveksi.order_payments (order_id, paid_at desc);
create index if not exists order_payments_status_idx on monitoring_konveksi.order_payments (status, paid_at desc);

-- Penjaga: tidak boleh hapus; ubah hanya kolom proses (status, verifikasi, void) dan hanya lewat alur sah:
--   pending → verified | rejected | void ,  verified → void.
create or replace function monitoring_konveksi.fin_payment_guard()
returns trigger language plpgsql set search_path = monitoring_konveksi, public as $$
declare
  v_mutable constant text[] := array['status', 'verified_by', 'verified_by_name', 'verified_at',
                                      'reject_reason', 'void_by', 'void_by_name', 'void_at', 'void_reason'];
begin
  if tg_op <> 'UPDATE' then
    raise exception 'FIN: Transaksi tidak boleh dihapus. Gunakan void (koreksi) beserta alasannya';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'FIN: Data transaksi tidak boleh diubah. Void lalu catat ulang bila ada yang salah';
  end if;
  if not ((old.status = 'pending'  and new.status in ('verified', 'rejected', 'void'))
       or (old.status = 'verified' and new.status = 'void')
       or (old.status = new.status)) then
    raise exception 'FIN: Perubahan status transaksi tidak diizinkan (% → %)', old.status, new.status;
  end if;
  if old.status = new.status and to_jsonb(new) <> to_jsonb(old) then
    raise exception 'FIN: Transaksi yang sudah diproses tidak boleh diubah';
  end if;
  return new;
end $$;

drop trigger if exists order_payments_guard on monitoring_konveksi.order_payments;
create trigger order_payments_guard
  before update or delete on monitoring_konveksi.order_payments
  for each row execute function monitoring_konveksi.fin_payment_guard();

drop trigger if exists order_payments_no_truncate on monitoring_konveksi.order_payments;
create trigger order_payments_no_truncate
  before truncate on monitoring_konveksi.order_payments
  for each statement execute function monitoring_konveksi.fin_payment_guard();

-- ─── 3a. Catat pembayaran ────────────────────────────────────────────────────
-- p_kind: null (jenis DP/cicilan/pelunasan ditentukan database dari sisa tagihan) atau 'refund'.
-- p_auto_verify hanya berlaku bila pengaturan auto_verify_own_payment aktif dan require_separate_verifier mati;
-- refund TIDAK PERNAH auto-verifikasi. Hak (create/edit) sudah diperiksa API; aturan uangnya di sini.
create or replace function monitoring_konveksi.fin_record_payment(
  p_order uuid, p_actor uuid, p_actor_name text,
  p_amount bigint, p_kind text, p_method text, p_account uuid, p_paid_at date,
  p_reference text, p_payer text, p_proof_path text, p_note text, p_auto_verify boolean
) returns uuid
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_order     record;
  v_inv       record;
  v_acc       record;
  v_kind      text;
  v_committed bigint;
  v_verified  bigint;
  v_pend_ref  bigint;
  v_auto      boolean;
  v_status    text;
  v_id        uuid;
begin
  select id, kode_produksi, deleted_at into v_order from orders where id = p_order for update;
  if not found or v_order.deleted_at is not null then raise exception 'FIN: Pesanan tidak ditemukan'; end if;

  select * into v_inv from order_invoices where order_id = p_order and status = 'active';
  if not found then raise exception 'FIN: Pesanan belum ditagih. Terbitkan tagihan dulu'; end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000000000 then raise exception 'FIN: Nominal tidak valid'; end if;
  if p_kind is not null and p_kind <> 'refund' then raise exception 'FIN: Jenis pembayaran tidak valid'; end if;
  if p_method is null or p_method not in ('transfer', 'tunai', 'qris', 'lainnya') then
    raise exception 'FIN: Metode pembayaran tidak valid';
  end if;
  select * into v_acc from finance_accounts where id = p_account;
  if not found or not v_acc.is_active then raise exception 'FIN: Akun kas/bank tidak valid atau nonaktif'; end if;
  if p_paid_at is null or p_paid_at > (timezone('Asia/Jakarta', now()))::date then
    raise exception 'FIN: Tanggal pembayaran tidak boleh di masa depan';
  end if;
  if p_proof_path is not null and left(p_proof_path, 37) <> p_order::text || '/' then
    raise exception 'FIN: Bukti tidak valid';
  end if;
  if p_method <> 'tunai' and p_proof_path is null and fin_setting_bool('require_proof_non_cash', true) then
    raise exception 'FIN: Bukti wajib dilampirkan untuk pembayaran non-tunai';
  end if;

  -- Posisi uang saat ini (pesanan sudah dikunci, jadi tidak balapan dengan pencatatan lain)
  select coalesce(sum(case when kind = 'refund' then -amount else amount end) filter (where status = 'verified'), 0),
         coalesce(sum(amount) filter (where status = 'pending' and kind <> 'refund'), 0),
         coalesce(sum(amount) filter (where status = 'pending' and kind = 'refund'), 0)
    into v_verified, v_committed, v_pend_ref
    from order_payments where order_id = p_order;
  v_committed := v_verified + v_committed;   -- terverifikasi (bersih) + menunggu verifikasi

  if p_kind = 'refund' then
    v_kind := 'refund';
    if p_amount > v_verified - v_pend_ref then
      raise exception 'FIN: Refund (Rp %) melebihi pembayaran terverifikasi yang tersisa (Rp %)',
        fin_rp(p_amount), fin_rp(greatest(v_verified - v_pend_ref, 0));
    end if;
  else
    if not fin_setting_bool('allow_overpayment', false) and v_committed + p_amount > v_inv.total then
      raise exception 'FIN: Nominal (Rp %) melebihi sisa tagihan (Rp %)',
        fin_rp(p_amount), fin_rp(greatest(v_inv.total - v_committed, 0));
    end if;
    v_kind := case when v_committed + p_amount >= v_inv.total then 'pelunasan'
                   when v_committed <= 0 then 'dp'
                   else 'cicilan' end;
  end if;

  v_auto := coalesce(p_auto_verify, false) and v_kind <> 'refund'
            and fin_setting_bool('auto_verify_own_payment', false)
            and not fin_setting_bool('require_separate_verifier', false);
  v_status := case when v_auto then 'verified' else 'pending' end;

  insert into order_payments (
    order_id, invoice_id, kind, amount, paid_at, method, account_id, reference_no, payer_name, note,
    proof_path, status, recorded_by, recorded_by_name, verified_by, verified_by_name, verified_at
  ) values (
    p_order, v_inv.id, v_kind, p_amount, p_paid_at, p_method, p_account,
    nullif(left(btrim(coalesce(p_reference, '')), 100), ''),
    nullif(left(btrim(coalesce(p_payer, '')), 100), ''),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    p_proof_path, v_status, p_actor, left(p_actor_name, 120),
    case when v_auto then p_actor end, case when v_auto then left(p_actor_name, 120) end,
    case when v_auto then timezone('utc', now()) end
  ) returning id into v_id;

  perform fin_audit(p_actor, p_actor_name, 'payment.record', 'payment', v_id, p_order, null,
    jsonb_build_object('kind', v_kind, 'amount', p_amount, 'method', p_method, 'account', v_acc.code,
                       'paid_at', p_paid_at, 'status', v_status, 'has_proof', p_proof_path is not null),
    null);
  if v_auto then
    perform fin_audit(p_actor, p_actor_name, 'payment.verify', 'payment', v_id, p_order,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'verified', 'auto', true), null);
  end if;
  return v_id;
end $$;

-- ─── 3b. Verifikasi / tolak ──────────────────────────────────────────────────
create or replace function monitoring_konveksi.fin_verify_payment(
  p_payment uuid, p_actor uuid, p_actor_name text, p_is_supervisor boolean,
  p_approve boolean, p_reason text
) returns text
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_pay       order_payments%rowtype;
  v_inv       record;
  v_verified  bigint;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select order_id into v_pay.order_id from order_payments where id = p_payment;
  if not found then raise exception 'FIN: Transaksi tidak ditemukan'; end if;
  -- kunci pesanan dulu (urutan sama dengan fin_record_payment) lalu transaksi
  perform 1 from orders where id = v_pay.order_id for update;
  select * into v_pay from order_payments where id = p_payment for update;

  if v_pay.status <> 'pending' then
    raise exception 'FIN: Transaksi ini sudah diproses (status: %)', v_pay.status;
  end if;
  if fin_setting_bool('require_separate_verifier', false)
     and v_pay.recorded_by is not null and v_pay.recorded_by = p_actor
     and not coalesce(p_is_supervisor, false) then
    raise exception 'FIN: Pencatat tidak boleh memverifikasi transaksinya sendiri';
  end if;

  if not coalesce(p_approve, false) then
    if v_reason is null then raise exception 'FIN: Alasan penolakan wajib diisi'; end if;
    update order_payments
       set status = 'rejected', verified_by = p_actor, verified_by_name = left(p_actor_name, 120),
           verified_at = timezone('utc', now()), reject_reason = left(v_reason, 500)
     where id = p_payment;
    perform fin_audit(p_actor, p_actor_name, 'payment.reject', 'payment', p_payment, v_pay.order_id,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'rejected'), v_reason);
    return 'rejected';
  end if;

  -- Periksa ulang saat diverifikasi (tagihan bisa direvisi / pembayaran lain sudah diverifikasi sejak dicatat)
  select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) into v_verified
    from order_payments where order_id = v_pay.order_id and status = 'verified';
  if v_pay.kind = 'refund' then
    if v_pay.amount > v_verified then
      raise exception 'FIN: Refund (Rp %) melebihi pembayaran terverifikasi (Rp %)', fin_rp(v_pay.amount), fin_rp(v_verified);
    end if;
  else
    select * into v_inv from order_invoices where order_id = v_pay.order_id and status = 'active';
    if found and not fin_setting_bool('allow_overpayment', false) and v_verified + v_pay.amount > v_inv.total then
      raise exception 'FIN: Memverifikasi transaksi ini membuat pembayaran (Rp %) melebihi tagihan (Rp %)',
        fin_rp(v_verified + v_pay.amount), fin_rp(v_inv.total);
    end if;
  end if;

  update order_payments
     set status = 'verified', verified_by = p_actor, verified_by_name = left(p_actor_name, 120),
         verified_at = timezone('utc', now())
   where id = p_payment;
  perform fin_audit(p_actor, p_actor_name, 'payment.verify', 'payment', p_payment, v_pay.order_id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'verified'), null);
  return 'verified';
end $$;

-- ─── 3c. Void (koreksi) ──────────────────────────────────────────────────────
create or replace function monitoring_konveksi.fin_void_payment(
  p_payment uuid, p_actor uuid, p_actor_name text, p_reason text
) returns void
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_pay    order_payments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select order_id into v_pay.order_id from order_payments where id = p_payment;
  if not found then raise exception 'FIN: Transaksi tidak ditemukan'; end if;
  perform 1 from orders where id = v_pay.order_id for update;
  select * into v_pay from order_payments where id = p_payment for update;

  if v_reason is null or char_length(v_reason) < 3 then raise exception 'FIN: Alasan void wajib diisi'; end if;
  if v_pay.status not in ('pending', 'verified') then
    raise exception 'FIN: Transaksi dengan status % tidak bisa di-void', v_pay.status;
  end if;

  update order_payments
     set status = 'void', void_by = p_actor, void_by_name = left(p_actor_name, 120),
         void_at = timezone('utc', now()), void_reason = left(v_reason, 500)
   where id = p_payment;
  perform fin_audit(p_actor, p_actor_name, 'payment.void', 'payment', p_payment, v_pay.order_id,
    jsonb_build_object('status', v_pay.status, 'amount', v_pay.amount, 'kind', v_pay.kind),
    jsonb_build_object('status', 'void'), v_reason);
end $$;

revoke all on function monitoring_konveksi.fin_record_payment(uuid, uuid, text, bigint, text, text, uuid, date, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_verify_payment(uuid, uuid, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_void_payment(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_record_payment(uuid, uuid, text, bigint, text, text, uuid, date, text, text, text, text, boolean) to service_role;
grant execute on function monitoring_konveksi.fin_verify_payment(uuid, uuid, text, boolean, boolean, text) to service_role;
grant execute on function monitoring_konveksi.fin_void_payment(uuid, uuid, text, text) to service_role;

-- ─── 4. v_order_finance: kini dihitung dari pembayaran ───────────────────────
-- Kolom, urutan, dan tipe SAMA dengan versi 010 (syarat create or replace view).
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
where o.deleted_at is null;

-- ─── 5. fin_issue_invoice: + pemeriksaan pembayaran terverifikasi ────────────
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
  v_verified  bigint;
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

  -- (6.3) Revisi tidak boleh menurunkan total di bawah uang yang sudah TERVERIFIKASI,
  -- kecuali kelebihan bayar diizinkan di pengaturan.
  select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) into v_verified
    from order_payments where order_id = p_order and status = 'verified';
  if v_verified > v_total and not fin_setting_bool('allow_overpayment', false) then
    raise exception 'FIN: Total baru (Rp %) lebih kecil dari pembayaran terverifikasi (Rp %). Refund/void pembayaran dulu, atau izinkan kelebihan bayar di pengaturan',
      fin_rp(v_total), fin_rp(v_verified);
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
end $$;;

revoke all on function monitoring_konveksi.fin_issue_invoice(uuid, uuid, text, jsonb, bigint, text, date)
  from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_issue_invoice(uuid, uuid, text, jsonb, bigint, text, date)
  to service_role;

-- ─── 6. Akses tabel + bucket bukti ───────────────────────────────────────────
alter table monitoring_konveksi.order_payments enable row level security;
revoke all on monitoring_konveksi.order_payments from public, anon, authenticated;
grant select on monitoring_konveksi.order_payments to service_role;
grant select on monitoring_konveksi.v_order_finance to service_role;

-- Bucket PRIVAT untuk bukti pembayaran: tanpa policy, hanya server (service role) yang bisa membaca/menulis;
-- browser membuka bukti lewat signed URL berumur 60 detik dari API.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('finance-proofs', 'finance-proofs', false, 4194304,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update
      set public = false, file_size_limit = 4194304,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
