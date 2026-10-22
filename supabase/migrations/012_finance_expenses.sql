-- 012_finance_expenses.sql  (Bagian 6, LANGKAH 6.5 — Pengeluaran / uang keluar)
--
-- Isi:
--   1. finance_vendors      — vendor / pemasok (nama unik tanpa membedakan huruf besar-kecil).
--   2. finance_expenses     — satu baris per pengeluaran (nomor EXP-YYMM-nnnnn). Alur sama dengan pembayaran:
--                             pending → approved | rejected, lalu pending/approved → void (koreksi).
--                             Tidak pernah dihapus; hanya kolom proses (status, persetujuan, void) yang boleh berubah.
--   3. fin_record_expense / fin_decide_expense / fin_void_expense — semua aturan uang keluar ditegakkan di sini
--                             (bukti wajib di atas ambang, pencatat ≠ penyetuju, alasan wajib, tak bisa dobel).
--   4. Pembantu fin_setting_int(); fin_block_order_delete diperluas (pesanan yang punya biaya langsung tak bisa
--                             dihapus permanen).
--   5. KOREKSI hak akses: server (service_role) tidak lagi bisa menulis langsung ke tabel uang & log audit
--                             (lihat bagian 6 di bawah) — berlaku juga untuk tabel dari 009–011.
--
-- Kolom & nama fungsi sengaja SAMA dengan Keuangan Sablon, supaya posting gaji ke Keuangan (langkah 6.8) bisa
-- memakai pola migration 010 Sablon (source = 'salary', source_ref unik, nomor dari finance_expense_seq).
--
-- Prasyarat: 001–011 sudah dijalankan. Aman dijalankan ulang (idempotent).
-- Dijalankan di SQL Editor sebagai postgres (pemilik tabel).

begin;

-- ─── 1. Vendor ───────────────────────────────────────────────────────────────
create table if not exists monitoring_konveksi.finance_vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  phone       text check (char_length(phone) <= 30),
  is_active   boolean not null default true,
  created_at  timestamptz not null default timezone('utc', now())
);
create unique index if not exists finance_vendors_name_uq
  on monitoring_konveksi.finance_vendors (lower(btrim(name)));

-- ─── 2. Pengeluaran ──────────────────────────────────────────────────────────
create sequence if not exists monitoring_konveksi.finance_expense_seq;

create table if not exists monitoring_konveksi.finance_expenses (
  id               uuid primary key default gen_random_uuid(),
  expense_no       text unique,
  category_id      uuid not null references monitoring_konveksi.finance_categories(id) on delete restrict,
  account_id       uuid not null references monitoring_konveksi.finance_accounts(id) on delete restrict,
  vendor_id        uuid references monitoring_konveksi.finance_vendors(id) on delete restrict,
  -- biaya langsung untuk satu pesanan (opsional; dasar laba per pesanan di langkah 6.6)
  order_id         uuid references monitoring_konveksi.orders(id) on delete restrict,
  source           text not null default 'manual' check (source in ('manual', 'salary', 'purchase')),
  source_ref       text check (char_length(source_ref) <= 200),
  description      text not null check (char_length(btrim(description)) between 3 and 200),
  amount           bigint not null check (amount > 0 and amount <= 100000000000),
  spent_at         date not null,
  note             text check (char_length(note) <= 500),
  proof_path       text,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'void')),
  recorded_by      uuid,
  recorded_by_name text,
  recorded_at      timestamptz not null default timezone('utc', now()),
  approved_by      uuid,
  approved_by_name text,
  approved_at      timestamptz,
  reject_reason    text,
  void_by          uuid,
  void_by_name     text,
  void_at          timestamptz,
  void_reason      text,
  check (status <> 'approved' or (approved_at is not null and approved_by_name is not null)),
  check (status <> 'rejected' or (approved_at is not null and nullif(btrim(reject_reason), '') is not null)),
  check (status <> 'void'     or (void_at is not null and nullif(btrim(void_reason), '') is not null))
);
create index if not exists finance_expenses_spent_idx  on monitoring_konveksi.finance_expenses (spent_at desc);
create index if not exists finance_expenses_status_idx on monitoring_konveksi.finance_expenses (status, spent_at desc);
create index if not exists finance_expenses_order_idx  on monitoring_konveksi.finance_expenses (order_id) where order_id is not null;
-- Anti-dobel untuk pengeluaran otomatis (mis. gaji): satu source_ref hanya boleh punya SATU baris yang masih hidup.
-- Setelah di-void/ditolak, boleh dicatat ulang.
create unique index if not exists finance_expenses_source_uq
  on monitoring_konveksi.finance_expenses (source, source_ref)
  where source_ref is not null and status in ('pending', 'approved');

-- Penjaga: tidak boleh hapus/truncate; ubah hanya kolom proses lewat alur sah:
--   pending → approved | rejected | void ,  approved → void.
create or replace function monitoring_konveksi.fin_expense_guard()
returns trigger language plpgsql set search_path = monitoring_konveksi, public as $$
declare
  v_mutable constant text[] := array['status', 'approved_by', 'approved_by_name', 'approved_at',
                                      'reject_reason', 'void_by', 'void_by_name', 'void_at', 'void_reason'];
begin
  if tg_op <> 'UPDATE' then
    raise exception 'FIN: Pengeluaran tidak boleh dihapus. Gunakan void (koreksi) beserta alasannya';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'FIN: Data pengeluaran tidak boleh diubah. Void lalu catat ulang bila ada yang salah';
  end if;
  if not ((old.status = 'pending'  and new.status in ('approved', 'rejected', 'void'))
       or (old.status = 'approved' and new.status = 'void')
       or (old.status = new.status)) then
    raise exception 'FIN: Perubahan status pengeluaran tidak diizinkan (% → %)', old.status, new.status;
  end if;
  if old.status = new.status and to_jsonb(new) <> to_jsonb(old) then
    raise exception 'FIN: Pengeluaran yang sudah diproses tidak boleh diubah';
  end if;
  return new;
end $$;

drop trigger if exists finance_expenses_guard on monitoring_konveksi.finance_expenses;
create trigger finance_expenses_guard
  before update or delete on monitoring_konveksi.finance_expenses
  for each row execute function monitoring_konveksi.fin_expense_guard();

drop trigger if exists finance_expenses_no_truncate on monitoring_konveksi.finance_expenses;
create trigger finance_expenses_no_truncate
  before truncate on monitoring_konveksi.finance_expenses
  for each statement execute function monitoring_konveksi.fin_expense_guard();

-- ─── 3a. Pembantu ────────────────────────────────────────────────────────────
-- Bilangan bulat ≥ 0 dari finance_settings; nilai hilang / bertipe salah → p_default.
create or replace function monitoring_konveksi.fin_setting_int(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = monitoring_konveksi, public as $$
  select coalesce(
    (select (value)::text::bigint from monitoring_konveksi.finance_settings
      where key = p_key and jsonb_typeof(value) = 'number' and (value)::text ~ '^\d{1,12}$'),
    p_default);
$$;
revoke all on function monitoring_konveksi.fin_setting_int(text, bigint) from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_setting_int(text, bigint) to service_role;

-- ─── 3b. Catat pengeluaran ───────────────────────────────────────────────────
-- p_auto_approve hanya berlaku bila pengaturan auto_approve_own_expense aktif dan require_separate_verifier mati
-- (hak edit sudah diperiksa API). Bukti wajib untuk pengeluaran MANUAL di/atas ambang expense_proof_required_above.
create or replace function monitoring_konveksi.fin_record_expense(
  p_actor uuid, p_actor_name text,
  p_category uuid, p_account uuid, p_vendor uuid, p_order uuid,
  p_source text, p_source_ref text,
  p_description text, p_amount bigint, p_spent_at date,
  p_proof_path text, p_note text, p_auto_approve boolean
) returns uuid
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_cat       record;
  v_acc       record;
  v_vendor    record;
  v_order     record;
  v_desc      text := btrim(coalesce(p_description, ''));
  v_threshold bigint;
  v_auto      boolean;
  v_status    text;
  v_no        text;
  v_id        uuid;
begin
  select * into v_cat from finance_categories where id = p_category;
  if not found or not v_cat.is_active or v_cat.kind <> 'expense' then
    raise exception 'FIN: Kategori pengeluaran tidak valid atau nonaktif';
  end if;
  select * into v_acc from finance_accounts where id = p_account;
  if not found or not v_acc.is_active then raise exception 'FIN: Akun kas/bank tidak valid atau nonaktif'; end if;
  if p_vendor is not null then
    select * into v_vendor from finance_vendors where id = p_vendor;
    if not found or not v_vendor.is_active then raise exception 'FIN: Vendor tidak valid atau nonaktif'; end if;
  end if;
  if p_order is not null then
    select id, deleted_at into v_order from orders where id = p_order;
    if not found or v_order.deleted_at is not null then raise exception 'FIN: Pesanan tidak ditemukan'; end if;
  end if;

  if p_source is null or p_source not in ('manual', 'salary', 'purchase') then raise exception 'FIN: Sumber pengeluaran tidak valid'; end if;
  if char_length(v_desc) < 3 then raise exception 'FIN: Keterangan wajib diisi (minimal 3 karakter)'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000000 then raise exception 'FIN: Nominal tidak valid'; end if;
  if p_spent_at is null or p_spent_at > (timezone('Asia/Jakarta', now()))::date then
    raise exception 'FIN: Tanggal pengeluaran tidak boleh di masa depan';
  end if;
  if p_proof_path is not null and left(p_proof_path, 9) <> 'expenses/' then raise exception 'FIN: Bukti tidak valid'; end if;

  -- Anti-dobel pengeluaran otomatis (mis. gaji): pesan jelas, bukan galat unik mentah. Indeks unik tetap jaring pengaman terakhir.
  if nullif(btrim(coalesce(p_source_ref, '')), '') is not null
     and exists (select 1 from finance_expenses
                  where source = p_source and source_ref = nullif(btrim(p_source_ref), '')
                    and status in ('pending', 'approved')) then
    raise exception 'FIN: Pengeluaran ini sudah tercatat (tidak boleh dobel)';
  end if;

  v_threshold := fin_setting_int('expense_proof_required_above', 500000);
  if p_source = 'manual' and v_threshold > 0 and p_amount >= v_threshold and p_proof_path is null then
    raise exception 'FIN: Bukti/nota wajib untuk pengeluaran Rp % atau lebih', fin_rp(v_threshold);
  end if;

  v_auto := coalesce(p_auto_approve, false)
            and fin_setting_bool('auto_approve_own_expense', false)
            and not fin_setting_bool('require_separate_verifier', false);
  v_status := case when v_auto then 'approved' else 'pending' end;
  v_no := 'EXP-' || to_char(p_spent_at, 'YYMM') || '-' || lpad(nextval('monitoring_konveksi.finance_expense_seq')::text, 5, '0');

  insert into finance_expenses (
    expense_no, category_id, account_id, vendor_id, order_id, source, source_ref, description, amount, spent_at,
    note, proof_path, status, recorded_by, recorded_by_name, approved_by, approved_by_name, approved_at
  ) values (
    v_no, p_category, p_account, p_vendor, p_order, p_source, nullif(btrim(coalesce(p_source_ref, '')), ''),
    left(v_desc, 200), p_amount, p_spent_at,
    nullif(left(btrim(coalesce(p_note, '')), 500), ''), p_proof_path, v_status, p_actor, left(p_actor_name, 120),
    case when v_auto then p_actor end, case when v_auto then left(p_actor_name, 120) end,
    case when v_auto then timezone('utc', now()) end
  ) returning id into v_id;

  perform fin_audit(p_actor, p_actor_name, 'expense.record', 'expense', v_id, p_order, null,
    jsonb_build_object('expense_no', v_no, 'amount', p_amount, 'category', v_cat.code, 'account', v_acc.code,
                       'spent_at', p_spent_at, 'status', v_status, 'source', p_source, 'has_proof', p_proof_path is not null),
    null);
  if v_auto then
    perform fin_audit(p_actor, p_actor_name, 'expense.approve', 'expense', v_id, p_order,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'approved', 'auto', true), null);
  end if;
  return v_id;
end $$;

-- ─── 3c. Setujui / tolak ─────────────────────────────────────────────────────
create or replace function monitoring_konveksi.fin_decide_expense(
  p_expense uuid, p_actor uuid, p_actor_name text, p_is_supervisor boolean,
  p_approve boolean, p_reason text
) returns text
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_x      finance_expenses%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_x from finance_expenses where id = p_expense for update;
  if not found then raise exception 'FIN: Pengeluaran tidak ditemukan'; end if;
  if v_x.status <> 'pending' then raise exception 'FIN: Pengeluaran ini sudah diproses (status: %)', v_x.status; end if;

  if fin_setting_bool('require_separate_verifier', false)
     and v_x.recorded_by is not null and v_x.recorded_by = p_actor
     and not coalesce(p_is_supervisor, false) then
    raise exception 'FIN: Pencatat tidak boleh menyetujui pengeluarannya sendiri';
  end if;

  if not coalesce(p_approve, false) then
    if v_reason is null then raise exception 'FIN: Alasan penolakan wajib diisi'; end if;
    update finance_expenses
       set status = 'rejected', approved_by = p_actor, approved_by_name = left(p_actor_name, 120),
           approved_at = timezone('utc', now()), reject_reason = left(v_reason, 500)
     where id = p_expense;
    perform fin_audit(p_actor, p_actor_name, 'expense.reject', 'expense', p_expense, v_x.order_id,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'rejected'), v_reason);
    return 'rejected';
  end if;

  update finance_expenses
     set status = 'approved', approved_by = p_actor, approved_by_name = left(p_actor_name, 120),
         approved_at = timezone('utc', now())
   where id = p_expense;
  perform fin_audit(p_actor, p_actor_name, 'expense.approve', 'expense', p_expense, v_x.order_id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'approved'), null);
  return 'approved';
end $$;

-- ─── 3d. Void (koreksi) ──────────────────────────────────────────────────────
-- Pengeluaran bersumber 'salary' hanya boleh dibatalkan lewat "Batal lunas" di menu Gaji (langkah 6.8), supaya
-- status lunas gaji dan catatan kas tidak saling bertentangan.
create or replace function monitoring_konveksi.fin_void_expense(
  p_expense uuid, p_actor uuid, p_actor_name text, p_reason text
) returns void
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_x      finance_expenses%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_x from finance_expenses where id = p_expense for update;
  if not found then raise exception 'FIN: Pengeluaran tidak ditemukan'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'FIN: Alasan void wajib diisi'; end if;
  if v_x.status not in ('pending', 'approved') then
    raise exception 'FIN: Pengeluaran dengan status % tidak bisa di-void', v_x.status;
  end if;
  if v_x.source = 'salary' then
    raise exception 'FIN: Pengeluaran gaji hanya bisa dibatalkan lewat "Batal lunas" di menu Gaji';
  end if;

  update finance_expenses
     set status = 'void', void_by = p_actor, void_by_name = left(p_actor_name, 120),
         void_at = timezone('utc', now()), void_reason = left(v_reason, 500)
   where id = p_expense;
  perform fin_audit(p_actor, p_actor_name, 'expense.void', 'expense', p_expense, v_x.order_id,
    jsonb_build_object('status', v_x.status, 'amount', v_x.amount, 'expense_no', v_x.expense_no),
    jsonb_build_object('status', 'void'), v_reason);
end $$;

revoke all on function monitoring_konveksi.fin_record_expense(uuid, text, uuid, uuid, uuid, uuid, text, text, text, bigint, date, text, text, boolean) from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_decide_expense(uuid, uuid, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_void_expense(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_record_expense(uuid, text, uuid, uuid, uuid, uuid, text, text, text, bigint, date, text, text, boolean) to service_role;
grant execute on function monitoring_konveksi.fin_decide_expense(uuid, uuid, text, boolean, boolean, text) to service_role;
grant execute on function monitoring_konveksi.fin_void_expense(uuid, uuid, text, text) to service_role;

-- ─── 4. Penjaga hapus permanen pesanan: + biaya langsung ─────────────────────
create or replace function monitoring_konveksi.fin_block_order_delete()
returns trigger language plpgsql security definer set search_path = monitoring_konveksi, public as $$
begin
  if exists (select 1 from order_invoices where order_id = old.id)
     or exists (select 1 from finance_expenses where order_id = old.id) then
    raise exception 'Pesanan % sudah punya catatan keuangan (tagihan atau biaya), jadi tidak bisa dihapus permanen. Pesanan tetap boleh disimpan di Sampah.', old.kode_produksi;
  end if;
  return old;
end $$;

-- ─── 5. Akses: hanya server (service_role) ───────────────────────────────────
alter table monitoring_konveksi.finance_vendors  enable row level security;
alter table monitoring_konveksi.finance_expenses enable row level security;
revoke all on monitoring_konveksi.finance_vendors, monitoring_konveksi.finance_expenses from public, anon, authenticated;
grant select, insert, update on monitoring_konveksi.finance_vendors to service_role;   -- ubah nama/nonaktifkan: layar pengaturan (6.8)
grant select on monitoring_konveksi.finance_expenses to service_role;                 -- tulis HANYA lewat fungsi
grant usage on sequence monitoring_konveksi.finance_expense_seq to service_role;

-- ─── 6. Pengetatan hak server (KOREKSI untuk 009–011 dan tabel di atas) ──────
-- Migration 001 memberi `service_role` hak tulis penuh pada SEMUA tabel baru lewat default privileges, sedangkan
-- `revoke` di 009–011 hanya mencabut dari `authenticated`. Akibatnya server masih bisa INSERT/UPDATE/DELETE langsung
-- ke tabel uang tanpa lewat fungsi fin_* (tanpa pemeriksaan aturan, tanpa audit). Di sini dicabut: tabel uang dan
-- log audit hanya boleh ditulis oleh fungsi fin_* (security definer, milik postgres). Pengaturan, akun, dan kategori
-- tetap bisa ditulis server (layar pengaturan, langkah 6.8); vendor tidak bisa dihapus (hanya dinonaktifkan).
revoke insert, update, delete on
  monitoring_konveksi.order_invoices,
  monitoring_konveksi.order_payments,
  monitoring_konveksi.finance_expenses,
  monitoring_konveksi.finance_audit_log
  from service_role;
revoke delete on monitoring_konveksi.finance_vendors from service_role;

commit;

notify pgrst, 'reload schema';
