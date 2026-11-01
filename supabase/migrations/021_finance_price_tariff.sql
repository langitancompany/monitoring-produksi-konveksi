-- 021_finance_price_tariff.sql  (Keuangan — Daftar harga per kelompok ukuran)
--
-- Sebelumnya tagihan = satu harga per item (jenis produksi). Sekarang harga bisa dibedakan:
--   • per KELOMPOK UKURAN  (mis. S&M satu harga, L&XL satu harga, XXL sendiri, 3XL sendiri, ...;
--                           celana sekolah 21–25, 26–30, ... per kelipatan lima)
--   • per VARIAN           (kelompok khusus varian, mis. celana olahraga panjang vs pendek)
--   • + BIAYA TAMBAHAN menurut nama varian (mis. lengan panjang +5.000, rib +3.000 → "Lengan Panjang Rib" = +8.000)
--
-- Isi:
--   1. finance_price_tiers   — kelompok ukuran + harga per jenis produksi
--   2. finance_price_addons  — tambahan per pcs bila nama varian memuat kata kunci
--   3. fin_save_tariff()     — simpan seluruh daftar harga satu jenis (atomik, tercatat di log audit)
--   4. fin_item_lines()      — hitung baris tagihan satu item dari rincian ukuran × daftar harga
--   5. fin_issue_invoice()   — diganti: item yang punya rincian & berjenis yang sudah punya harga dihitung dari
--                              daftar harga; item lain tetap memakai harga manual (kompatibel dengan data lama)
--   6. Nilai awal            — kelompok & tambahan untuk jenis yang ada (harga 0 = BELUM DIATUR; atur di Config Harga → Harga)
--
-- ATURAN SAMA dengan lib/finance/tariff.ts — ubah salah satu, ubah keduanya.
-- Prasyarat: 001–020 sudah dijalankan. Aman dijalankan ulang (idempotent). Jalankan di SQL Editor sebagai postgres.

begin;

-- ─── 1. Kelompok ukuran & harga ──────────────────────────────────────────────
create table if not exists monitoring_konveksi.finance_price_tiers (
  id             uuid primary key default gen_random_uuid(),
  jenis_produksi text not null references monitoring_konveksi.production_types(value) on update cascade on delete cascade,
  varian         text check (varian is null or char_length(btrim(varian)) <= 60),  -- null/kosong = semua varian
  label          text not null check (char_length(btrim(label)) between 1 and 40),
  ukuran         jsonb not null check (jsonb_typeof(ukuran) = 'array' and jsonb_array_length(ukuran) between 1 and 60),
  harga          bigint not null default 0 check (harga between 0 and 99999999999), -- 0 = belum diatur
  sort_order     integer not null default 0,
  updated_at     timestamptz not null default timezone('utc', now())
);
create index if not exists finance_price_tiers_jenis_idx on monitoring_konveksi.finance_price_tiers (jenis_produksi, sort_order);

-- ─── 2. Biaya tambahan menurut varian ────────────────────────────────────────
create table if not exists monitoring_konveksi.finance_price_addons (
  id             uuid primary key default gen_random_uuid(),
  jenis_produksi text not null references monitoring_konveksi.production_types(value) on update cascade on delete cascade,
  keyword        text not null check (char_length(btrim(keyword)) between 1 and 40),
  label          text not null check (char_length(btrim(label)) between 1 and 40),
  tambahan       bigint not null default 0 check (tambahan between 0 and 99999999999),
  sort_order     integer not null default 0,
  updated_at     timestamptz not null default timezone('utc', now())
);
create index if not exists finance_price_addons_jenis_idx on monitoring_konveksi.finance_price_addons (jenis_produksi, sort_order);

-- ─── 3. Simpan daftar harga satu jenis ───────────────────────────────────────
-- p_tiers : [{"varian": null|"Panjang", "label": "S & M", "ukuran": ["S","M"], "harga": 50000}, ...]
-- p_addons: [{"keyword": "lengan panjang", "label": "Lengan panjang", "tambahan": 5000}, ...]
-- Seluruh daftar jenis itu diganti sekaligus (hapus + isi ulang dalam satu transaksi).
create or replace function monitoring_konveksi.fin_save_tariff(
  p_actor uuid, p_actor_name text, p_jenis text, p_tiers jsonb, p_addons jsonb
) returns void
language plpgsql security definer set search_path = monitoring_konveksi, public as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_e      jsonb;
  v_ord    bigint;
begin
  if not exists (select 1 from production_types where value = p_jenis) then
    raise exception 'FIN: Jenis produksi tidak ditemukan';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 40 then
    raise exception 'FIN: Daftar kelompok harga tidak valid (maksimal 40 kelompok)';
  end if;
  if p_addons is null or jsonb_typeof(p_addons) <> 'array' or jsonb_array_length(p_addons) > 20 then
    raise exception 'FIN: Daftar biaya tambahan tidak valid (maksimal 20)';
  end if;

  for v_e, v_ord in select e, o from jsonb_array_elements(p_tiers) with ordinality as x(e, o) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'FIN: Kelompok harga nomor % tidak valid', v_ord; end if;
    if char_length(btrim(coalesce(v_e ->> 'label', ''))) not between 1 and 40 then
      raise exception 'FIN: Nama kelompok nomor % wajib diisi (maksimal 40 huruf)', v_ord;
    end if;
    if coalesce(jsonb_typeof(v_e -> 'ukuran'), '') <> 'array' or jsonb_array_length(v_e -> 'ukuran') not between 1 and 60 then
      raise exception 'FIN: Kelompok "%" harus punya 1–60 ukuran', v_e ->> 'label';
    end if;
    if exists (select 1 from jsonb_array_elements(v_e -> 'ukuran') u
               where jsonb_typeof(u) <> 'string' or char_length(btrim(u #>> '{}')) not between 1 and 10) then
      raise exception 'FIN: Ukuran pada kelompok "%" tidak valid', v_e ->> 'label';
    end if;
    if coalesce(jsonb_typeof(v_e -> 'harga'), '') <> 'number' or (v_e ->> 'harga') !~ '^\d{1,11}$' then
      raise exception 'FIN: Harga kelompok "%" harus bilangan bulat 0 atau lebih (0 = belum diatur)', v_e ->> 'label';
    end if;
    if v_e ? 'varian' and jsonb_typeof(v_e -> 'varian') not in ('string', 'null') then
      raise exception 'FIN: Varian kelompok "%" tidak valid', v_e ->> 'label';
    end if;
    if char_length(btrim(coalesce(v_e ->> 'varian', ''))) > 60 then
      raise exception 'FIN: Nama varian kelompok "%" terlalu panjang', v_e ->> 'label';
    end if;
  end loop;

  -- Satu ukuran tidak boleh masuk dua kelompok pada varian yang sama (supaya harga tidak ambigu).
  if exists (
    select 1
    from (
      select o, lower(btrim(regexp_replace(coalesce(e ->> 'varian', ''), '\s+', ' ', 'g'))) vk, upper(btrim(u)) sz
      from jsonb_array_elements(p_tiers) with ordinality as x(e, o), jsonb_array_elements_text(e -> 'ukuran') u
    ) a
    join (
      select o, lower(btrim(regexp_replace(coalesce(e ->> 'varian', ''), '\s+', ' ', 'g'))) vk, upper(btrim(u)) sz
      from jsonb_array_elements(p_tiers) with ordinality as x(e, o), jsonb_array_elements_text(e -> 'ukuran') u
    ) b on a.vk = b.vk and a.sz = b.sz and a.o < b.o
  ) then
    raise exception 'FIN: Ada ukuran yang masuk dua kelompok sekaligus. Satu ukuran hanya boleh di satu kelompok';
  end if;

  for v_e, v_ord in select e, o from jsonb_array_elements(p_addons) with ordinality as x(e, o) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'FIN: Biaya tambahan nomor % tidak valid', v_ord; end if;
    if char_length(btrim(coalesce(v_e ->> 'keyword', ''))) not between 1 and 40 then
      raise exception 'FIN: Kata kunci biaya tambahan nomor % wajib diisi (maksimal 40 huruf)', v_ord;
    end if;
    if char_length(btrim(coalesce(v_e ->> 'label', ''))) not between 1 and 40 then
      raise exception 'FIN: Nama biaya tambahan nomor % wajib diisi (maksimal 40 huruf)', v_ord;
    end if;
    if coalesce(jsonb_typeof(v_e -> 'tambahan'), '') <> 'number' or (v_e ->> 'tambahan') !~ '^\d{1,11}$' then
      raise exception 'FIN: Nominal biaya tambahan "%" harus bilangan bulat 0 atau lebih', v_e ->> 'label';
    end if;
  end loop;

  select jsonb_build_object(
           'tiers',  coalesce((select jsonb_agg(jsonb_build_object('varian', varian, 'label', label, 'ukuran', ukuran, 'harga', harga) order by sort_order)
                               from finance_price_tiers where jenis_produksi = p_jenis), '[]'::jsonb),
           'addons', coalesce((select jsonb_agg(jsonb_build_object('keyword', keyword, 'label', label, 'tambahan', tambahan) order by sort_order)
                               from finance_price_addons where jenis_produksi = p_jenis), '[]'::jsonb))
    into v_before;

  delete from finance_price_tiers  where jenis_produksi = p_jenis;
  delete from finance_price_addons where jenis_produksi = p_jenis;

  insert into finance_price_tiers (jenis_produksi, varian, label, ukuran, harga, sort_order)
  select p_jenis,
         nullif(btrim(e ->> 'varian'), ''),
         btrim(e ->> 'label'),
         -- ukuran: huruf besar, tanpa duplikat, urutan asli dipertahankan
         (select jsonb_agg(sz order by first_o)
            from (select upper(btrim(u)) sz, min(uo) first_o
                    from jsonb_array_elements_text(e -> 'ukuran') with ordinality as q(u, uo) group by 1) s),
         (e ->> 'harga')::bigint,
         o::integer
  from jsonb_array_elements(p_tiers) with ordinality as x(e, o);

  insert into finance_price_addons (jenis_produksi, keyword, label, tambahan, sort_order)
  select p_jenis, lower(btrim(e ->> 'keyword')), btrim(e ->> 'label'), (e ->> 'tambahan')::bigint, o::integer
  from jsonb_array_elements(p_addons) with ordinality as x(e, o);

  select jsonb_build_object(
           'tiers',  coalesce((select jsonb_agg(jsonb_build_object('varian', varian, 'label', label, 'ukuran', ukuran, 'harga', harga) order by sort_order)
                               from finance_price_tiers where jenis_produksi = p_jenis), '[]'::jsonb),
           'addons', coalesce((select jsonb_agg(jsonb_build_object('keyword', keyword, 'label', label, 'tambahan', tambahan) order by sort_order)
                               from finance_price_addons where jenis_produksi = p_jenis), '[]'::jsonb))
    into v_after;

  perform fin_audit(p_actor, p_actor_name, 'tariff.save', 'tariff', null, null,
                    v_before || jsonb_build_object('jenis_produksi', p_jenis),
                    v_after  || jsonb_build_object('jenis_produksi', p_jenis), null);
end $$;

revoke all on function monitoring_konveksi.fin_save_tariff(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_save_tariff(uuid, text, text, jsonb, jsonb) to service_role;

-- ─── 4. Baris tagihan satu item dari daftar harga ────────────────────────────
-- Mengembalikan array baris [{item_id, jenis_produksi, nama, jumlah, harga_per_pcs, subtotal, auto:true}]
-- atau NULL bila item ini harus memakai harga manual (jenis belum punya harga, atau item tanpa rincian ukuran).
create or replace function monitoring_konveksi.fin_item_lines(p_item jsonb)
returns jsonb
language plpgsql stable set search_path = monitoring_konveksi, public as $$
declare
  v_jenis   text := p_item ->> 'jenis_produksi';
  v_item_id text := p_item ->> 'id';
  v_jumlah  integer := (p_item ->> 'jumlah')::integer;
  v_nama    text;
  v_blok    jsonb;
  v_u       jsonb;
  v_varian  text;
  v_vkey    text;
  v_ukuran  text;
  v_qty     integer;
  v_tier    record;
  v_gkey    text;
  v_g       jsonb := '{}'::jsonb;
  v_order   text[] := '{}';
  v_total   integer := 0;
  v_lines   jsonb := '[]'::jsonb;
  v_tambah  bigint;
  v_harga   bigint;
  v_gk      text;
begin
  -- Harga manual bila jenis belum punya kelompok berharga, atau item tidak punya rincian ukuran berjumlah > 0.
  if not exists (select 1 from finance_price_tiers where jenis_produksi = v_jenis and harga > 0) then return null; end if;
  if coalesce(jsonb_typeof(p_item -> 'rincian'), '') <> 'array' then return null; end if;
  if not exists (
    select 1
    from jsonb_array_elements(p_item -> 'rincian') b,
         jsonb_array_elements(case when jsonb_typeof(b -> 'ukuran') = 'array' then b -> 'ukuran' else '[]'::jsonb end) u
    where (u ->> 'jumlah') ~ '^\d{1,7}$' and (u ->> 'jumlah')::integer > 0
  ) then return null; end if;

  select coalesce(name, v_jenis) into v_nama from production_types where value = v_jenis;
  v_nama := coalesce(v_nama, v_jenis);

  for v_blok in select * from jsonb_array_elements(p_item -> 'rincian') loop
    v_varian := btrim(coalesce(v_blok ->> 'varian', ''));
    if lower(v_varian) = 'lainnya' and btrim(coalesce(v_blok ->> 'varian_lain', '')) <> '' then
      v_varian := btrim(v_blok ->> 'varian_lain');
    end if;
    v_vkey := lower(btrim(regexp_replace(v_varian, '\s+', ' ', 'g')));

    if coalesce(jsonb_typeof(v_blok -> 'ukuran'), '') <> 'array' then continue; end if;
    for v_u in select * from jsonb_array_elements(v_blok -> 'ukuran') loop
      if (v_u ->> 'jumlah') !~ '^\d{1,7}$' then raise exception 'FIN: Jumlah ukuran pada "%" tidak valid', v_nama; end if;
      v_qty := (v_u ->> 'jumlah')::integer;
      if v_qty = 0 then continue; end if;
      v_ukuran := upper(btrim(coalesce(v_u ->> 'ukuran', '')));

      select t.id, t.label, t.harga, t.varian into v_tier
        from finance_price_tiers t
       where t.jenis_produksi = v_jenis
         and exists (select 1 from jsonb_array_elements_text(t.ukuran) x where upper(btrim(x)) = v_ukuran)
         and (nullif(btrim(coalesce(t.varian, '')), '') is null
              or lower(btrim(regexp_replace(t.varian, '\s+', ' ', 'g'))) = v_vkey)
       order by (case when nullif(btrim(coalesce(t.varian, '')), '') is not null then 0 else 1 end), t.sort_order, t.id
       limit 1;
      if not found then
        raise exception 'FIN: Ukuran "%"% pada "%" belum masuk kelompok harga mana pun. Atur di Config Harga → Harga',
          btrim(v_u ->> 'ukuran'), case when v_varian <> '' then ' (' || v_varian || ')' else '' end, v_nama;
      end if;
      if v_tier.harga <= 0 then
        raise exception 'FIN: Harga kelompok "%" untuk "%" belum diisi. Atur di Config Harga → Harga', v_tier.label, v_nama;
      end if;

      v_gkey := v_vkey || '|' || v_tier.id::text;
      if v_g ? v_gkey then
        v_g := jsonb_set(v_g, array[v_gkey, 'jumlah'], to_jsonb(((v_g -> v_gkey ->> 'jumlah')::integer) + v_qty));
      else
        v_g := v_g || jsonb_build_object(v_gkey, jsonb_build_object(
                 'varian', v_varian, 'vkey', v_vkey, 'label', v_tier.label, 'harga', v_tier.harga, 'jumlah', v_qty));
        v_order := v_order || v_gkey;
      end if;
      v_total := v_total + v_qty;
    end loop;
  end loop;

  if v_total <> v_jumlah then
    raise exception 'FIN: Rincian ukuran "%" berjumlah % pcs, tidak sama dengan jumlah item (% pcs). Perbaiki di Edit Pesanan',
      v_nama, v_total, v_jumlah;
  end if;

  foreach v_gk in array v_order loop
    select coalesce(sum(a.tambahan), 0) into v_tambah
      from finance_price_addons a
     where a.jenis_produksi = v_jenis
       and lower(btrim(a.keyword)) <> ''
       and position(lower(btrim(regexp_replace(a.keyword, '\s+', ' ', 'g'))) in (v_g -> v_gk ->> 'vkey')) > 0;
    v_harga := (v_g -> v_gk ->> 'harga')::bigint + v_tambah;
    if v_harga > 99999999999 then raise exception 'FIN: Harga untuk "%" terlalu besar', v_nama; end if;
    v_lines := v_lines || jsonb_build_object(
      'item_id',        v_item_id,
      'jenis_produksi', v_jenis,
      'nama',           concat_ws(' · ', v_nama, nullif(v_g -> v_gk ->> 'varian', ''), v_g -> v_gk ->> 'label'),
      'jumlah',         (v_g -> v_gk ->> 'jumlah')::integer,
      'harga_per_pcs',  v_harga,
      'subtotal',       v_harga * (v_g -> v_gk ->> 'jumlah')::integer,
      'auto',           true
    );
  end loop;

  return v_lines;
end $$;

revoke all on function monitoring_konveksi.fin_item_lines(jsonb) from public, anon, authenticated;
grant execute on function monitoring_konveksi.fin_item_lines(jsonb) to service_role;

-- ─── 5. Terbit / revisi tagihan (menggantikan versi 010) ─────────────────────
-- Sama dengan 010, kecuali: item yang bisa dihitung dari daftar harga (fin_item_lines) tidak memakai p_prices;
-- hasilnya bisa beberapa baris per item. Harga manual p_prices tetap WAJIB untuk item lainnya.
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
  v_auto      jsonb;
  v_line      jsonb;
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

    -- Dari daftar harga (kelompok ukuran + tambahan varian)?
    v_auto := fin_item_lines(v_item);
    if v_auto is not null then
      for v_line in select * from jsonb_array_elements(v_auto) loop
        v_lines := v_lines || v_line;
        v_subtotal := v_subtotal + (v_line ->> 'subtotal')::bigint;
      end loop;
      v_pcs := v_pcs + v_jumlah;
      v_count := v_count + 1;
      continue;
    end if;

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

-- ─── 6. Akses: hanya server (service_role); tulis lewat fin_save_tariff ─────
alter table monitoring_konveksi.finance_price_tiers  enable row level security;
alter table monitoring_konveksi.finance_price_addons enable row level security;
revoke all on monitoring_konveksi.finance_price_tiers, monitoring_konveksi.finance_price_addons
  from public, anon, authenticated;
grant select on monitoring_konveksi.finance_price_tiers, monitoring_konveksi.finance_price_addons to service_role;

-- ─── 7. Nilai awal ───────────────────────────────────────────────────────────
-- Hanya untuk jenis yang sudah ada dan BELUM punya kelompok. Harga 0 = belum diatur: selama belum ada
-- kelompok berharga, jenis itu tetap ditagih dengan satu harga per item seperti sebelumnya.
-- Blok DO tidak punya search_path sendiri: arahkan ke schema konveksi (hanya berlaku sampai commit).
set local search_path = monitoring_konveksi, public;

do $$
declare
  v_jenis text;
  v_huruf jsonb := '[["S & M",["S","M"]],["L & XL",["L","XL"]],["XXL",["XXL"]],["3XL",["3XL"]],["4XL",["4XL"]],["5XL",["5XL"]]]';
  v_celana jsonb := '[["21–25",["21","22","23","24","25"]],["26–30",["26","27","28","29","30"]],["31–35",["31","32","33","34","35"]],["36–40",["36","37","38","39","40"]],["41–45",["41","42","43","44","45"]]]';
  v_set jsonb;
  g jsonb;
  i integer;
begin
  for v_jenis in select unnest(array['kaos_polos','seragam_sekolah','celana_sekolah','celana_training','celana_pendek']) loop
    if exists (select 1 from production_types where value = v_jenis)
       and not exists (select 1 from finance_price_tiers where jenis_produksi = v_jenis) then
      v_set := case when v_jenis = 'celana_sekolah' then v_celana else v_huruf end;
      i := 0;
      for g in select * from jsonb_array_elements(v_set) loop
        i := i + 1;
        insert into finance_price_tiers (jenis_produksi, varian, label, ukuran, harga, sort_order)
        values (v_jenis, null, g ->> 0, g -> 1, 0, i);
      end loop;
    end if;
  end loop;

  -- Tambahan lengan panjang: kaos polos Rp5.000 (+ rib Rp3.000); seragam sekolah menyusul (isi nominalnya di Config Harga → Harga).
  if exists (select 1 from production_types where value = 'kaos_polos')
     and not exists (select 1 from finance_price_addons where jenis_produksi = 'kaos_polos') then
    insert into finance_price_addons (jenis_produksi, keyword, label, tambahan, sort_order) values
      ('kaos_polos', 'lengan panjang', 'Lengan panjang', 5000, 1),
      ('kaos_polos', 'rib',            'Rib',            3000, 2);
  end if;
  if exists (select 1 from production_types where value = 'seragam_sekolah')
     and not exists (select 1 from finance_price_addons where jenis_produksi = 'seragam_sekolah') then
    insert into finance_price_addons (jenis_produksi, keyword, label, tambahan, sort_order) values
      ('seragam_sekolah', 'lengan panjang', 'Lengan panjang', 0, 1);
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
