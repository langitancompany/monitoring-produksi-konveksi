-- 020_finance_maker_approver.sql  (izin Keuangan: Maker & Approver terpisah)
--
-- Prasyarat: 001 dan 019 sudah dijalankan. Aman dijalankan ulang.
-- Tidak mengubah struktur tabel; hanya mengisi ulang kolom JSON `users.permissions`.
--
-- ATURAN BARU (cermin lib/finance/caps.ts)
--   keuangan.view     → membuka menu, melihat tagihan/transaksi/laporan
--   keuangan.maker    → menerbitkan/merevisi tagihan, mencatat pembayaran & pengeluaran
--   keuangan.approver → memverifikasi/menolak pembayaran & pengeluaran, mencatat refund, Laporan
--   keuangan.delete   → void (tidak berubah)
--
-- DATA LAMA
--   keuangan.create → keuangan.maker
--   keuangan.edit   → keuangan.approver
-- Kunci create/edit dihapus dari bagian keuangan. Nilai maker/approver yang SUDAH tertulis
-- tidak ditimpa. Super Admin tidak terpengaruh (selalu boleh semuanya).
--
-- Penegakan izin keuangan ada di API server (requireFinance), bukan di RLS, jadi tidak ada
-- policy/fungsi yang perlu diubah. Dijalankan lewat SQL Editor (service role), sehingga
-- trigger guard_users_update (019) tidak menghalangi.

begin;

update monitoring_konveksi.users u
set permissions = jsonb_set(
  u.permissions,
  '{keuangan}',
  ((u.permissions -> 'keuangan') - 'create' - 'edit')
  || jsonb_build_object(
       'maker',
       coalesce((u.permissions -> 'keuangan' ->> 'maker') = 'true',
                (u.permissions -> 'keuangan' ->> 'create') = 'true', false),
       'approver',
       coalesce((u.permissions -> 'keuangan' ->> 'approver') = 'true',
                (u.permissions -> 'keuangan' ->> 'edit') = 'true', false)
     )
)
where jsonb_typeof(u.permissions -> 'keuangan') = 'object'
  and (   not (u.permissions -> 'keuangan' ? 'maker')
       or not (u.permissions -> 'keuangan' ? 'approver')
       or u.permissions -> 'keuangan' ? 'create'
       or u.permissions -> 'keuangan' ? 'edit');

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil (jalankan di SQL Editor) ──────────────────────────────────────
--   select name, role,
--          permissions -> 'keuangan' as keuangan
--   from monitoring_konveksi.users
--   where permissions -> 'keuangan' is not null
--   order by name;
