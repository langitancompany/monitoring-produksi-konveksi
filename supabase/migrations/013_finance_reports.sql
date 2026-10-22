-- 013_finance_reports.sql  (Bagian 6, LANGKAH 6.6 — Ringkasan, Laporan, Panduan)
--
-- Isi:
--   1. finance_accounts.opening_balance — saldo awal akun (bawaan 0), dasar saldo per akun.
--   2. v_receivable_aging   — piutang per pesanan beserta umur keterlambatan & bucket (hari ini menurut WIB).
--   3. v_account_balances   — saldo per akun = saldo awal + pembayaran terverifikasi (bersih refund) − pengeluaran disetujui.
--   4. fin_overview(from,to) — angka kartu Ringkasan; fin_report(from,to) — laba rugi (basis tagihan) + arus kas
--                              (basis uang); fin_todo() — angka "perlu tindakan" untuk tab Panduan.
--
-- Semua angka dihitung DI DATABASE dengan agregasi SQL — tidak ada batas baris yang diam-diam memotong data
-- (versi yang menarik baris ke server lalu menjumlah di JavaScript bisa terpotong). API hanya meneruskan hasilnya.
--
-- Prasyarat: 001–012 sudah dijalankan. Aman dijalankan ulang (idempotent).
-- Dijalankan di SQL Editor sebagai postgres (pemilik tabel).

begin;

-- ─── 1. Saldo awal akun ──────────────────────────────────────────────────────
alter table monitoring_konveksi.finance_accounts
  add column if not exists opening_balance bigint not null default 0
  check (opening_balance between -100000000000 and 100000000000);

-- ─── 2. Piutang & umurnya ────────────────────────────────────────────────────
-- Hanya tagihan aktif yang masih ada sisa. Tanpa jatuh tempo → bucket sendiri (bukan "telat", tapi tetap
-- terlihat sebagai piutang yang belum punya tenggat). "Hari ini" = tanggal WIB.
create or replace view monitoring_konveksi.v_receivable_aging as
select
  f.order_id,
  f.kode_produksi,
  f.nama_pemesan,
  f.invoice_id,
  f.due_date,
  f.total,
  f.paid_verified,
  f.balance,
  (case when f.due_date is null then 0
        else greatest((timezone('Asia/Jakarta', now()))::date - f.due_date, 0) end)::integer as days_overdue,
  (case
     when f.due_date is null                                            then 'tanpa_jatuh_tempo'
     when f.due_date >= (timezone('Asia/Jakarta', now()))::date         then 'belum_jatuh_tempo'
     when (timezone('Asia/Jakarta', now()))::date - f.due_date <= 7     then 'telat_1_7'
     when (timezone('Asia/Jakarta', now()))::date - f.due_date <= 30    then 'telat_8_30'
     else 'telat_30_plus'
   end)::text as bucket
from monitoring_konveksi.v_order_finance f
where f.invoice_id is not null and f.balance > 0;

-- ─── 3. Saldo per akun ───────────────────────────────────────────────────────
-- cash_in = pembayaran terverifikasi dikurangi refund terverifikasi; cash_out = pengeluaran disetujui.
-- (Transfer antar akun ditambahkan di langkah 6.8 dengan create or replace view — kolom tetap sama.)
create or replace view monitoring_konveksi.v_account_balances as
select
  a.id          as account_id,
  a.code,
  a.name,
  a.type,
  a.is_active,
  a.sort_order,
  a.opening_balance,
  coalesce(i.amt, 0)::bigint as cash_in,
  coalesce(o.amt, 0)::bigint as cash_out,
  (a.opening_balance + coalesce(i.amt, 0) - coalesce(o.amt, 0))::bigint as balance
from monitoring_konveksi.finance_accounts a
left join (
  select account_id, sum(case when kind = 'refund' then -amount else amount end) as amt
    from monitoring_konveksi.order_payments where status = 'verified' group by account_id
) i on i.account_id = a.id
left join (
  select account_id, sum(amount) as amt
    from monitoring_konveksi.finance_expenses where status = 'approved' group by account_id
) o on o.account_id = a.id;

-- ─── 4a. Ringkasan ───────────────────────────────────────────────────────────
-- Kas masuk (bersih refund), tagihan terbit (tanggal masuk pesanan), dan uang keluar mengikuti rentang tanggal;
-- piutang, antrean, dan saldo akun selalu posisi SAAT INI. "Pembayaran menunggu" hanya yang uang MASUK (refund tidak).
create or replace function monitoring_konveksi.fin_overview(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = monitoring_konveksi, public as $$
declare
  v_cash_in  bigint;
  v_billed   bigint;
  v_cash_out bigint;
  v_pp_count integer;
  v_pp_amt   bigint;
  v_pe_count integer;
  v_pe_amt   bigint;
  v_aging    jsonb;
  v_top      jsonb;
  v_accounts jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'FIN: Rentang tanggal tidak valid'; end if;
  if p_to - p_from > 1830 then raise exception 'FIN: Rentang maksimal 5 tahun'; end if;

  select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) into v_cash_in
    from order_payments where status = 'verified' and paid_at between p_from and p_to;
  select coalesce(sum(total), 0) into v_billed
    from v_order_finance where invoice_id is not null and tanggal_masuk between p_from and p_to;
  select coalesce(sum(amount), 0) into v_cash_out
    from finance_expenses where status = 'approved' and spent_at between p_from and p_to;
  select count(*), coalesce(sum(amount), 0) into v_pp_count, v_pp_amt
    from order_payments where status = 'pending' and kind <> 'refund';
  select count(*), coalesce(sum(amount), 0) into v_pe_count, v_pe_amt
    from finance_expenses where status = 'pending';

  select jsonb_agg(jsonb_build_object('bucket', b.bucket, 'count', coalesce(a.cnt, 0), 'amount', coalesce(a.amt, 0)) order by b.ord)
    into v_aging
    from (values ('belum_jatuh_tempo', 1), ('telat_1_7', 2), ('telat_8_30', 3), ('telat_30_plus', 4), ('tanpa_jatuh_tempo', 5)) as b(bucket, ord)
    left join (select bucket, count(*) as cnt, sum(balance)::bigint as amt from v_receivable_aging group by bucket) a
      on a.bucket = b.bucket;

  select coalesce(jsonb_agg(jsonb_build_object('order_id', t.order_id, 'kode_produksi', t.kode_produksi,
           'nama_pemesan', t.nama_pemesan, 'balance', t.balance, 'days_overdue', t.days_overdue)
           order by t.balance desc, t.kode_produksi), '[]'::jsonb)
    into v_top
    from (select * from v_receivable_aging order by balance desc, kode_produksi limit 5) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', account_id, 'code', code, 'name', name, 'type', type, 'balance', balance)
           order by sort_order, code), '[]'::jsonb)
    into v_accounts
    from v_account_balances where is_active;

  return jsonb_build_object(
    'period',                 jsonb_build_object('from', p_from, 'to', p_to),
    'cash_in',                v_cash_in,
    'tagihan_terbit',         v_billed,
    'piutang_total',          (select coalesce(sum(balance), 0) from v_receivable_aging),
    'piutang_count',          (select count(*) from v_receivable_aging),
    'piutang_overdue',        (select coalesce(sum(balance), 0) from v_receivable_aging where bucket like 'telat%'),
    'pending_count',          v_pp_count,
    'pending_amount',         v_pp_amt,
    'cash_out',               v_cash_out,
    'expense_pending_count',  v_pe_count,
    'expense_pending_amount', v_pe_amt,
    'aging',                  v_aging,
    'top_debtors',            v_top,
    'accounts',               v_accounts
  );
end $$;

-- ─── 4b. Laporan ─────────────────────────────────────────────────────────────
--   Pendapatan = nilai tagihan aktif pesanan yang MASUK pada periode (tanggal masuk pesanan) — basis TAGIHAN
--   Biaya      = pengeluaran DISETUJUI pada periode (tanggal pengeluaran)
--   Laba       = Pendapatan − Biaya (perkiraan manajemen, bukan laba pembukuan)
--   Kas masuk  = pembayaran terverifikasi bersih refund — basis UANG; Kas keluar = pengeluaran disetujui
--   Biaya langsung per pesanan = SEMUA pengeluaran disetujui yang ditautkan ke pesanan itu (seluruh waktu).
create or replace function monitoring_konveksi.fin_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = monitoring_konveksi, public as $$
declare
  v_months    jsonb;
  v_revenue   bigint;
  v_expenses  bigint;
  v_cash_in   bigint;
  v_linked    bigint;
  v_unpaid    bigint;
  v_by_cat    jsonb;
  v_orders    jsonb;
  v_orders_n  integer;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'FIN: Rentang tanggal tidak valid'; end if;
  if (extract(year from p_to) * 12 + extract(month from p_to)) - (extract(year from p_from) * 12 + extract(month from p_from)) + 1 > 60 then
    raise exception 'FIN: Rentang maksimal 60 bulan';
  end if;

  with m as (
    select to_char(d, 'YYYY-MM') as ym
      from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') d
  ), rev as (
    select to_char(tanggal_masuk, 'YYYY-MM') as ym, sum(total) as amt
      from v_order_finance where invoice_id is not null and tanggal_masuk between p_from and p_to group by 1
  ), cin as (
    select to_char(paid_at, 'YYYY-MM') as ym, sum(case when kind = 'refund' then -amount else amount end) as amt
      from order_payments where status = 'verified' and paid_at between p_from and p_to group by 1
  ), exp as (
    select to_char(spent_at, 'YYYY-MM') as ym, sum(amount) as amt
      from finance_expenses where status = 'approved' and spent_at between p_from and p_to group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'month', m.ym,
           'revenue',  coalesce(rev.amt, 0),
           'expenses', coalesce(exp.amt, 0),
           'profit',   coalesce(rev.amt, 0) - coalesce(exp.amt, 0),
           'cash_in',  coalesce(cin.amt, 0),
           'cash_out', coalesce(exp.amt, 0),
           'cash_net', coalesce(cin.amt, 0) - coalesce(exp.amt, 0)) order by m.ym)
    into v_months
    from m left join rev on rev.ym = m.ym left join cin on cin.ym = m.ym left join exp on exp.ym = m.ym;

  select coalesce(sum(total), 0), coalesce(sum(balance), 0) into v_revenue, v_unpaid
    from v_order_finance where invoice_id is not null and tanggal_masuk between p_from and p_to;
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where order_id is not null), 0) into v_expenses, v_linked
    from finance_expenses where status = 'approved' and spent_at between p_from and p_to;
  select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) into v_cash_in
    from order_payments where status = 'verified' and paid_at between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'amount', t.amt) order by t.amt desc, t.name), '[]'::jsonb)
    into v_by_cat
    from (select coalesce(c.name, 'Tanpa kategori') as name, sum(e.amount)::bigint as amt
            from finance_expenses e left join finance_categories c on c.id = e.category_id
           where e.status = 'approved' and e.spent_at between p_from and p_to
           group by coalesce(c.name, 'Tanpa kategori')) t;

  select count(*) into v_orders_n
    from v_order_finance where invoice_id is not null and tanggal_masuk between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', t.order_id, 'kode_produksi', t.kode_produksi, 'nama_pemesan', t.nama_pemesan,
           'tanggal_masuk', t.tanggal_masuk, 'total', t.total, 'paid', t.paid_verified,
           'direct_cost', t.dc, 'gross', t.total - t.dc) order by t.tanggal_masuk desc, t.kode_produksi desc), '[]'::jsonb)
    into v_orders
    from (select f.*, coalesce(c.amt, 0)::bigint as dc
            from v_order_finance f
            left join (select order_id, sum(amount) as amt from finance_expenses
                        where status = 'approved' and order_id is not null group by order_id) c on c.order_id = f.order_id
           where f.invoice_id is not null and f.tanggal_masuk between p_from and p_to
           order by f.tanggal_masuk desc, f.kode_produksi desc
           limit 300) t;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', jsonb_build_object(
      'revenue',            v_revenue,
      'expenses',           v_expenses,
      'profit',             v_revenue - v_expenses,
      'cash_in',            v_cash_in,
      'cash_out',           v_expenses,
      'cash_net',           v_cash_in - v_expenses,
      'unpaid_billed',      v_unpaid,
      'expenses_linked',    v_linked,
      'expenses_unlinked',  v_expenses - v_linked),
    'months',       v_months,
    'by_category',  v_by_cat,
    'orders',       v_orders,
    'orders_total', v_orders_n
  );
end $$;

-- ─── 4c. "Perlu tindakan" untuk tab Panduan ──────────────────────────────────
-- Pesanan "belum ditagih" hanya yang SUDAH punya rincian item (aturan yang sama dengan fin_issue_invoice);
-- pesanan utama yang belum Approval tidak dihitung karena memang belum bisa ditagih.
create or replace function monitoring_konveksi.fin_todo()
returns jsonb
language plpgsql stable security definer set search_path = monitoring_konveksi, public as $$
declare
  v_today date := (timezone('Asia/Jakarta', now()))::date;
  v_since date := v_today - 30;
  v_pp    record;
  v_pe    record;
  v_od    record;
  v_ub    integer;
begin
  select count(*) as n, coalesce(sum(amount), 0) as amt, min(recorded_at) as oldest into v_pp
    from order_payments where status = 'pending' and kind <> 'refund';
  select count(*) as n, coalesce(sum(amount), 0) as amt, min(recorded_at) as oldest into v_pe
    from finance_expenses where status = 'pending';
  select count(*) as n, coalesce(sum(balance), 0) as amt into v_od
    from v_receivable_aging where bucket like 'telat%';
  select count(*) into v_ub
    from v_order_finance f join orders o on o.id = f.order_id
   where f.invoice_id is null and f.tanggal_masuk >= v_since
     and jsonb_typeof(o.items) = 'array' and jsonb_array_length(o.items) > 0;

  return jsonb_build_object(
    'pending_payments', jsonb_build_object('count', v_pp.n, 'amount', v_pp.amt,
        'oldest_days', case when v_pp.oldest is null then null else greatest(floor(extract(epoch from (now() - v_pp.oldest)) / 86400), 0) end),
    'pending_expenses', jsonb_build_object('count', v_pe.n, 'amount', v_pe.amt,
        'oldest_days', case when v_pe.oldest is null then null else greatest(floor(extract(epoch from (now() - v_pe.oldest)) / 86400), 0) end),
    'overdue',          jsonb_build_object('count', v_od.n, 'amount', v_od.amt),
    'unbilled_recent',  jsonb_build_object('count', v_ub, 'since', v_since)
  );
end $$;

-- ─── 5. Akses: hanya server (service_role) ───────────────────────────────────
revoke all on monitoring_konveksi.v_receivable_aging, monitoring_konveksi.v_account_balances
  from public, anon, authenticated;
grant select on monitoring_konveksi.v_receivable_aging, monitoring_konveksi.v_account_balances to service_role;

revoke all on function monitoring_konveksi.fin_overview(date, date) from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_report(date, date)   from public, anon, authenticated;
revoke all on function monitoring_konveksi.fin_todo()               from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_overview(date, date) to service_role;
grant execute on function monitoring_konveksi.fin_report(date, date)   to service_role;
grant execute on function monitoring_konveksi.fin_todo()               to service_role;

commit;

notify pgrst, 'reload schema';
