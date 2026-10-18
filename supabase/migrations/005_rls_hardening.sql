-- 005_rls_hardening.sql  (Bagian 7 — pengetatan RLS)
--
-- Prasyarat: 001–004 sudah dijalankan. Aman dijalankan ulang.
-- Tidak mengubah struktur tabel dan tidak menyentuh data.
--
-- MASALAH YANG DIPERBAIKI
-- Policy UPDATE `orders` (002) hanya mengecek "punya salah satu izin produksi/
-- finishing/orders/…", lalu `with check (true)`. Akibatnya siapa pun yang boleh
-- menekan satu tombol tahap bisa — lewat API Supabase langsung, tanpa lewat
-- layar aplikasi — juga mengubah deadline, nama pemesan, jumlah, items, kode
-- produksi, atau pembuat pesanan. Menu di UI hanya lapisan kedua (PRD §10).
--
-- YANG DILAKUKAN
--  1. guard_orders_update diperluas (trigger, per kolom):
--       • kode_produksi, kategori, created_at, id, created_by → tidak boleh berubah
--       • nama_pemesan, no_hp, alamat_pemesan, tanggal_masuk, deadline,
--         catatan_pesanan, assigned_to → butuh orders.edit
--       • items, jumlah, jenis_produksi → orders.edit ATAU produksi.create
--         (yang kedua = membuat Approval)
--       • steps, kendala, status → salah satu izin orders.edit / produksi.* /
--         finishing.* (sama seperti syarat tombol tahap di aplikasi)
--       • deleted_at → tetap: orders.delete atau trash.delete
--  2. INSERT pesanan: `created_by` wajib = pengguna yang login, dan tidak boleh
--     langsung dibuat dalam keadaan sudah di Sampah.
--  3. Log aktivitas: hapus hanya oleh supervisor (sebelumnya siapa pun dengan
--     trash.delete). Aplikasi tidak pernah menghapus log dari browser; pada
--     Hapus Permanen log sengaja dipertahankan (PRD §15 no. 3).
--
-- BELUM DIKETATKAN (lihat PRD §18)
--  • Per-tahap: pengguna `produksi.edit` secara teknis masih bisa mengubah tahap
--    QC lewat API langsung (trigger hanya membedakan steps/kendala/status
--    sebagai satu kelompok). Alasan: QC gagal harus bisa membuka lagi tahap
--    Produksi Massal dalam satu update, jadi pemisahan per-tahap perlu didesain
--    bersama Bagian 5.
--  • Isi `order_logs.oleh` bisa dipalsukan pengirimnya (log ditulis dari browser).
--  • Policy storage bucket `production-proofs` bersama Sablon (di luar migration).
--  • `notifications` INSERT masih terbuka untuk staf (notificationHelper.ts
--    masih menulis dari browser).
-- Penjaga kolom harga/pembayaran dan gaji ditambahkan di Bagian 6 dan 5.

begin;

-- ─── 1. Penjaga kolom pesanan ────────────────────────────────────────────────
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

  -- (c) Data pemesan, jadwal, catatan, penanggung jawab → hanya yang boleh edit pesanan
  if (   new.nama_pemesan    is distinct from old.nama_pemesan
      or new.no_hp           is distinct from old.no_hp
      or new.alamat_pemesan  is distinct from old.alamat_pemesan
      or new.tanggal_masuk   is distinct from old.tanggal_masuk
      or new.deadline        is distinct from old.deadline
      or new.catatan_pesanan is distinct from old.catatan_pesanan
      or new.assigned_to     is distinct from old.assigned_to)
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

-- Trigger-nya sudah ada sejak 002; dibuat ulang supaya pasti terpasang.
drop trigger if exists trg_guard_orders_update on monitoring_konveksi.orders;
create trigger trg_guard_orders_update
  before update on monitoring_konveksi.orders
  for each row execute function monitoring_konveksi.guard_orders_update();

-- ─── 2. INSERT pesanan: pembuat harus diri sendiri, tidak langsung di Sampah ──
drop policy if exists "Buat pesanan sesuai permission" on monitoring_konveksi.orders;
create policy "Buat pesanan sesuai permission" on monitoring_konveksi.orders
  for insert to authenticated
  with check (
    monitoring_konveksi.has_perm('orders', 'create')
    and created_by = auth.uid()
    and deleted_at is null
  );

-- ─── 3. Log aktivitas: hanya supervisor yang boleh menghapus ─────────────────
drop policy if exists "Log: hapus" on monitoring_konveksi.order_logs;
create policy "Log: hapus" on monitoring_konveksi.order_logs
  for delete to authenticated using (monitoring_konveksi.is_supervisor());

commit;
