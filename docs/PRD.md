# PRD — Monitoring Produksi Konveksi (Langitan.co)

> Dokumen serah-terima. Siapa pun (manusia atau AI) yang melanjutkan proyek ini
> **baca dokumen ini dulu**, lalu kerjakan bagian berikutnya di tabel *Status*.
> Perbarui tabel Status dan changelog setiap selesai satu bagian.

Terakhir diperbarui: 17 Oktober 2026 · Versi aplikasi: V.1.2 (Bagian 1 + pengelolaan user selesai; skema database dicocokkan dengan skema asli Sablon)

---

## 1. Ringkasan

Aplikasi web internal untuk memantau produksi unit usaha **Konveksi** milik
Langitan.co. Dibuat terpisah dari aplikasi Sablon (`monitoring-produksi-sablon`)
tetapi memakai kerangka, tema, dan pola kode yang sama. Pemilik/pengembang:
Majid (membangun dengan bantuan AI, "vibe coder" — jelaskan implikasi teknis
dengan bahasa sederhana, tulis kode dengan komentar berbahasa Indonesia).

**Tujuan:** admin, tim produksi, QC, dan manajemen melihat posisi setiap
pesanan (sudah sampai tahap apa, siapa yang mengerjakan, telat atau tidak),
menghitung gaji produksi per item, dan mencatat keuangan.

### Produk yang dibuat
- **Jahitan utama:** Seragam Sekolah, Celana Sekolah, Kaos Polos, Kaos Polo, Celana Training, Celana Pendek — dan bisa ditambah kapan saja lewat Pengaturan.
- **Pesanan non-utama:** Pembuatan Selempang Wisuda, Jasa Permak/Jahit — dan bisa ditambah lewat Pengaturan.

Ada **dua menu pesanan**, seperti Sablon (Kaos / Merchandise): **Pesanan Utama**
dan **Pesanan Non-Utama**.

---

## 2. Status pembangunan (UPDATE DI SINI)

| # | Bagian | Isi | Status |
|---|---|---|---|
| 0 | Kerangka | Login, profil, pengguna & hak akses, pengumuman, notifikasi, backup, Tentang App, pindah unit | ✅ selesai |
| 1 | Fondasi pesanan | Model data, template tahap, status otomatis, Pengaturan → Jenis Produksi, daftar pesanan, form pesanan baru, detail (hanya baca), migration `001` (umum) & `002` (inti) berdasar skema asli Sablon | ✅ selesai (belum diuji di database sungguhan) |
| 1.5 | Pengelolaan user | `/api/users` (tambah/ubah/hapus: akun login + profil sekaligus), form Pengguna memakai Email Login, tanpa kolom password | ✅ selesai (belum diuji di Supabase sungguhan) |
| 2 | Alur produksi | Aksi tiap tahap di Detail (Approval, Potong, Jahit, QC, Packing, Kirim, Terima), upload file, kendala, edit & hapus (ke Sampah), log, notifikasi (penerima dihitung di server — lihat §13.4) | ⬜ berikutnya |
| 3 | Arsip & pemantauan | Pesanan Selesai, Sampah, Log Aktivitas, Kalender | ⬜ |
| 4 | Catatan Rapat | Terintegrasi dengan menu produksi (ikuti Sablon) | ⬜ |
| 5 | Config Harga & Gaji | Rate gaji per item/tahap, Gaji & Upah, slip gaji | ⬜ |
| 6 | Keuangan | Tagihan → pembayaran → verifikasi (ikuti Keuangan v2 Sablon) | ⬜ |
| 7 | Dashboard & finishing | Dashboard ringkasan, tampilan Kanban, pengetatan RLS, rapikan lint | ⬜ |

Pekerjaan dibagi per bagian **sengaja** (batas token). Selesaikan satu bagian
penuh (kode + `npx tsc --noEmit` bersih + changelog + tabel ini) sebelum lanjut.

---

## 3. Aturan untuk pelanjut proyek

1. **Adopsi dari Sablon, jangan menulis ulang.** Folder referensi:
   `monitoring-produksi-sablon-main` (zip dari pemilik). Salin pola/UI-nya lalu
   sesuaikan ke model konveksi (bagian 5). Jangan menyalin hal khusus Sablon:
   DTF, gesut, merchandise, PO/reseller, WhatsApp gateway, `/tv`, `/tracking`.
2. **Tema sama dengan Sablon** (lihat bagian 9). Jangan mengganti gaya.
3. **Satu sumber konfigurasi unit:** `lib/config.ts`. Jangan hardcode
   `monitoring_konveksi` atau domain di file lain.
4. **Client Supabase hanya lewat `createClient()`** (`lib/supabase/client.ts`),
   dibuat sekali per komponen (`useState(() => createClient())` / `useMemo`),
   **tidak boleh** di badan render (membanjiri Supabase dengan refresh token).
5. **Tahapan produksi hanya didefinisikan di `lib/steps.ts`.** Status pesanan
   selalu dihitung `deriveStatus()`, tidak pernah diisi manual.
6. **Menambah modul/halaman:** `types/index.ts` (hak akses) → `lib/tabs.ts` →
   `Sidebar.tsx` → `Header.tsx` (judul) → `PermissionTable.tsx` → render di
   `app/page.tsx`.
7. **Verifikasi tiap bagian:** `npm install`, `npx tsc --noEmit` (wajib bersih).
   `next build` butuh akses Google Fonts; di lingkungan offline matikan font
   sementara di `app/layout.tsx` hanya untuk uji, jangan di-commit.
8. Tulis komentar dan teks UI dalam **bahasa Indonesia**. Kode `any` masih
   ditoleransi (sama seperti Sablon); jangan menambah `localStorage` untuk data bisnis.
9. Pesan commit/ringkasan ke pemilik: jelaskan *apa yang berubah dan kenapa*,
   sebutkan risiko, dan tandai hal yang **belum diuji dengan database sungguhan**.

---

## 4. Arsitektur

- **Stack:** Next.js 16 (App Router, Turbopack, `proxy.ts` — bukan `middleware.ts`), React 19, Tailwind 4, Supabase self-hosted, Firebase Cloud Messaging.
- **Satu halaman utama** `app/page.tsx` dengan tab (`lib/tabs.ts`) dan state URL (`?tab=&view=&orderId=`). Komponen halaman dimuat `next/dynamic`.
- **Supabase:** satu instance, **schema per unit** (`monitoring_konveksi`). Sesi login dibagi lintas subdomain lewat cookie domain `.langitan.co` (`authCookieOptions()` di `lib/config.ts`; dimatikan saat localhost).
- **Server-only:** route API di `app/api/*` memakai `getSupabaseAdmin()` (service role) + `requireUser()` (cek sesi & role). Operasi sensitif (uang, hapus user) harus lewat API, bukan langsung dari browser.
- **Deploy:** Coolify di VPS sendiri, `Dockerfile` standalone, health check `/api/health`. Variabel `NEXT_PUBLIC_*` = Build Variable.
- **Env:** lihat `.env.example`. **Setup database:** README → "Menyiapkan Supabase" (`supabase/migrations/001_base_umum.sql` lalu `002_konveksi_core.sql`).

### Struktur folder (inti)
```
app/page.tsx                      kerangka & routing tab
app/components/{auth,layout,ui,misc,dashboard,orders,settings}
app/api/                          users (kelola user) · send-notification · backup · health · version
hooks/   useAuth useUsers useNotifications useOrders useProductionTypes useUnitAccess useUpdateCheck
lib/     config steps utils orderLogic notificationHelper roles changelog tabs apiAuth supabaseAdmin userAdmin
types/   index.ts (user & hak akses)  order.ts (pesanan)
supabase/migrations/              001 base_umum · 002 konveksi_core
supabase/optional/                salin user dari Sablon (hanya untuk supervisor pertama)
supabase/patches/                 perbaikan untuk database SABLON (bukan Konveksi)
docs/PRD.md                       dokumen ini
```

---

## 5. Model data

Tabel di schema `monitoring_konveksi` (DDL: `supabase/migrations/002_konveksi_core.sql`).
Tabel umum (`users`, `notifications`, `user_fcm_tokens`, `announcements`, `direksi_access`)
lihat README.

### `production_types` — master jenis produksi
`id, name, value (unik, kode tetap), kategori ('utama'|'non_utama'), is_active, sort_order`.
`value` dibuat otomatis dari nama dan **tidak boleh diubah** setelah dipakai
(pesanan menyimpan `value`). Menonaktifkan = hilang dari pilihan, data lama aman.

### `orders` — pesanan
| Kolom | Catatan |
|---|---|
| `kode_produksi` | `KNV-MM/YY-0001`, nomor urut per bulan dari database |
| `kategori` | `utama` / `non_utama` — menentukan template tahap |
| `nama_pemesan, no_hp, alamat_pemesan, jumlah, tanggal_masuk, deadline, catatan_pesanan` | diisi saat close order |
| `jenis_produksi` | utama: kosong sampai Approval · non_utama: dipilih saat dibuat |
| `items` (jsonb) | `[{id, jenis_produksi, jumlah, catatan?}]` — dasar hitung gaji per item (utama diisi di Approval, Bagian 2) |
| `steps` (jsonb) | `ProductionStep[]` (lihat `types/order.ts`), tersalin dari template saat dibuat |
| `kendala` (jsonb) | `KendalaNote[]` |
| `status` | hasil `deriveStatus()`; "Telat" tidak disimpan (dari deadline) |
| `assigned_to, created_by, deleted_at` | `deleted_at` = di Sampah (soft delete) |

### `order_logs` — log aktivitas
`order_id, kode_produksi, category (STATUS|FILE|KENDALA|QC|REVISI|SISTEM), event_name, description, old_value, new_value, oleh, metadata`.
Tulis lewat `writeLog()` di `hooks/useOrders.ts`.

---

## 6. Alur produksi & status

Template di `lib/steps.ts` (`STEP_TEMPLATES`):

**Pesanan Utama**
1. **Approval & Jenis Produksi** — setelah close order, admin membuat approval dan memilih jenis produksi *(form)*
2. **Potong Kain** *(tombol selesai)*
3. **Produksi Massal (Jahit)** *(tombol selesai)*
4. **QC** *(lolos/gagal + catatan)*
5. **Packing** *(upload foto)*
6. **Pengiriman** *(upload bukti)*
7. **Penerimaan** *(upload bukti)*

**Pesanan Non-Utama**
1. **Detail Pesanan** — admin mengisi detail pemesan, jumlah, kategori pemesanan *(selesai otomatis saat form disimpan)*
2. **Upload Mockup** *(upload gambar)*
3. **Produksi Massal** *(tombol selesai)*
4. **QC** *(lolos/gagal + catatan)*
5. **Pengiriman** *(upload bukti)*
6. **Penerimaan** *(upload bukti)*

**Status otomatis (`deriveStatus`)** — urutan prioritas:
`Ada Kendala` (ada kendala belum selesai) → `Selesai` (semua tahap selesai) →
`Revisi` (QC gagal + ada catatan) → status tahap aktif pertama:
Approval/Detail = *Pesanan Masuk* · Mockup/Potong/Jahit/Produksi = *On Process* ·
QC/Packing = *Finishing* · Pengiriman/Penerimaan = *Kirim*.

**Aturan tahap (diadopsi dari Sablon, terapkan di Bagian 2):**
- Tahap hanya bisa dikerjakan berurutan; tahap sebelumnya harus selesai.
- QC gagal → catatan wajib → status *Revisi* → tahap Produksi Massal dibuka lagi (reset `isCompleted`) → setelah selesai, QC diulang.
- Setiap aksi menulis log, memanggil `triggerOrderNotifications`, dan `fetchOrders`.
- Upload: kompres gambar (`browser-image-compression`), nama file konsisten (lihat `generateStorageFilename`/`getDocumentLabel` di Sablon), bucket storage yang sama dengan Sablon.

---

## 7. Spesifikasi bagian yang belum dikerjakan

Acuan Sablon ada di kolom kanan — **baca file itu dulu**.

### Bagian 2 — Alur produksi
- `OrderDetail` interaktif: kartu tiap tahap dengan tombol aksi sesuai `type` dan hak akses (`produksi`, `finishing`, `orders`).
- **Approval (utama):** pilih satu/lebih jenis produksi dari `production_types` aktif + jumlah per item (→ `items`, `jenis_produksi` = jenis pertama), upload file/link approval, catatan. Simpan → tahap selesai.
- **Kendala:** tambah/selesaikan, boleh dengan foto bukti → status `Ada Kendala`.
- **Edit pesanan** (data pemesan, deadline, jumlah, items), **hapus** = isi `deleted_at` (ke Sampah), hak akses `orders.delete`.
- Hak akses: `orders` (buat/edit/hapus), `produksi` (potong, jahit, kendala, upload approval/mockup), `finishing` (QC, packing, kirim, terima).
- Acuan Sablon: `app/components/orders/OrderDetail.tsx` + `orders/detail/*`, `hooks/useOrderDetail.ts`, `hooks/useUpload.ts`, `checkAutoStatus` di `hooks/useOrders.ts`, `lib/orderLogic.ts`, `EditOrder.tsx`.
- Tambah ke `useOrders`: `applyStepUpdate(order, stepKey, patch)` (menghitung ulang `deriveStatus`, update, log, notifikasi), `handleEditOrder`, `handleDeleteOrder`.

### Bagian 3 — Arsip & pemantauan
- **Pesanan Selesai** (`status = 'Selesai'`, tidak dihapus), pagination. Acuan: `orders/CompletedOrders.tsx`.
- **Sampah** (`deleted_at` terisi): pulihkan / hapus permanen (hapus file storage terkait). Acuan: `orders/TrashView.tsx`, `handleRestoreOrder`, `handlePermanentDelete`.
- **Log Aktivitas** dari `order_logs` (filter kategori, pencarian). Acuan: `apps/ActivityLogView.tsx`.
- **Kalender** deadline & tanggal masuk. Acuan: `apps/CalendarView.tsx`.
- Tab baru: `completed_orders`, `trash`, `logs`, `calendar`; hak akses `logs`, `trash` (tambahkan ke `UserPermissions`).

### Bagian 4 — Catatan Rapat
- Terintegrasi dengan menu produksi **seperti Sablon**: baca `apps/WeeklyNotesView.tsx` untuk melihat bentuk catatan dan cara terhubung ke produksi, lalu tiru. Tabel baru + migration `003`.

### Bagian 5 — Config Harga & Gaji
- **Config Harga** = rate gaji produksi **per item** (jenis produksi) karena tiap item beda rate. Asumsi model: tabel `pricing_configs` riwayat harga (`effective_date`, INSERT baru tiap perubahan — jangan UPDATE, supaya gaji lampau tidak berubah), kunci `(jenis_produksi, tahap)` → rate per pcs.
- **Gaji & Upah** hanya **gaji produksi dari item yang diproduksi**: per pekerja per bulan = Σ (jumlah item × rate jenis tersebut) untuk tahap yang ia kerjakan (`step.doneBy`). Bulan gaji mengikuti tanggal tahap selesai (`completedAt`), bukan tanggal pesanan dibuat. Slip gaji bisa dicetak.
- Acuan Sablon: `apps/ConfigPriceView.tsx`, `apps/SalaryView.tsx`, `settings/tabs/GesutSalaryTab.tsx`, `types/index.ts` → `PricingConfig`. Jangan bawa sistem gesut/DTF.
- Hak akses: `config_harga` (lihat/edit), `salary` (lihat, cetak, edit) — `salary` sudah ada di `UserPermissions`.

### Bagian 6 — Keuangan
- Ikuti Keuangan v2 Sablon (Tagihan → Pembayaran → Verifikasi → Void, status pembayaran dihitung database, invoice PDF, log audit, semua operasi uang lewat API server). Acuan: `app/components/finance/*`, `lib/finance/*`, `hooks/useFinanceApi.ts`, `supabase/migrations/010_finance_*.sql`.
- Pangkas yang terkait harga kaos/ukuran besar/lengan panjang; ganti dengan baris item konveksi (`items`).

### Bagian 7 — Dashboard & finishing
- Dashboard ringkasan (jumlah per status, telat, pesanan menurut jenis, grafik bulanan). Acuan: `dashboard/Dashboard.tsx`, `useDashboard.ts`, `ChartBar/ChartPie/ActionList/HeroSection`. Pakai `recharts` (tambahkan lagi ke `package.json`).
- Tampilan Kanban di daftar pesanan (Sablon: `KanbanBoard` di `OrderList.tsx`).
- **Kencangkan RLS** (lihat bagian 10) dan rapikan lint.

---

## 8. Hak akses

Tipe: `UserPermissions` (`types/index.ts`). Saat ini: `dashboard, orders, produksi, finishing, salary, keuangan, settings`. `supervisor` selalu boleh semuanya.
Role bawaan: supervisor, manager, admin, produksi, qc, designer (`lib/roles.ts`; satu user boleh banyak role). Tambah role baru bila perlu (mis. penjahit) — **tanyakan pemilik**.

---

## 9. Panduan UI/tema (samakan dengan Sablon)

- Palet netral **`zinc`** (bukan slate/stone); dark mode hampir hitam (`dark:bg-zinc-950`), kartu `bg-white dark:bg-zinc-950`, tepi `border-zinc-200 dark:border-zinc-800`.
- Aksen hijau gelap **`#124540`** (tombol utama, tab/filter aktif, hover `#0d332f`); hijau terang **`#49BFB4`** hanya untuk aksen di dark mode/spinner. Fokus input: `focus:ring-[#124540]`.
- Bentuk: kartu `rounded-xl`, tombol/input `rounded-md`, `font-semibold` (bukan bold), judul `tracking-tight`, label kecil `text-[10px] uppercase tracking-[0.12em]`, angka `font-mono tabular-nums`. Transisi `duration-150`. Gaya datar (tanpa bayangan besar).
- Ikon: `lucide-react`. Warna status: `getStatusColor()` di `lib/utils.ts`.
- Komponen dan style form bersama: `settingsShared.ts` (`inputCls`, `labelCls`).

---

## 10. Keamanan (WAJIB dibaca)

- **RLS Konveksi mengikuti Sablon** (`001`/`002`): izin dicek di database lewat
  `has_perm(modul, aksi)`, `is_staff()`, `is_admin_or_supervisor()`; menu di UI
  hanyalah lapisan kedua. Jangan menambah tabel tanpa `enable row level security`
  dan policy; jangan memberi `grant` ke role `anon` (Konveksi tidak punya halaman publik).
- **Kolom `roles` dijaga** di `guard_users_update` (Konveksi). Di **Sablon** kolom ini
  belum dijaga → user biasa bisa mengubah `roles` miliknya menjadi `{supervisor}` dan
  lolos `fin_perm()` serta policy SELECT `orders`. Perbaikan: `supabase/patches/sablon_guard_users_roles.sql` (jalankan di database Sablon).
- **Pengelolaan user lewat API server** (`app/api/users/route.ts`, `lib/userAdmin.ts`): akun login
  dibuat di Supabase Auth dan profil di `users` dengan id yang sama dalam satu langkah (rollback bila
  gagal). Tabel `users` Konveksi **tidak punya kolom password**; browser tidak menulis ke `users`
  untuk tambah/ubah/hapus dan tidak memuat kolom sensitif (`useUsers` memilih kolom eksplisit).
  Akun login dipakai bersama semua unit → email tidak bisa diubah, penghapusan akun login dicek
  terhadap `OTHER_UNIT_SCHEMAS`, email yang sudah punya akun ditautkan (password tidak diubah).
  Hanya supervisor yang boleh mengurus akun/role supervisor.
- Edit profil sendiri (nama, alamat, tgl lahir, no WA, foto) tetap langsung ke `users` dan dijaga
  trigger `guard_users_update` (role, roles, permissions, username tidak bisa diubah user biasa).
- Di **Sablon** kolom `users.password` masih ada dan dimuat ke browser admin (`select *`); cek isinya
  dan hentikan penyimpanannya bila password asli.
- Operasi uang/gaji harus lewat API server + fungsi database (pola `fin_*` Sablon), bukan
  insert langsung dari browser.
- Jangan commit `.env*`. `SUPABASE_SERVICE_ROLE_KEY` dan `FIREBASE_PRIVATE_KEY` hanya di server.
- Firebase web config & VAPID key masih memakai project yang sama dengan Sablon.
- Policy storage bucket `production-proofs` berlaku untuk seluruh bucket (bukan per folder).
  Pakai awalan `konveksi/{orderId}/...` untuk file Konveksi.

---

## 11. Asumsi & pertanyaan terbuka (tanyakan ke pemilik sebelum membangun bagian terkait)

1. **Item per pesanan:** apakah satu pesanan utama bisa memuat beberapa jenis sekaligus (mis. seragam + celana untuk satu sekolah)? *Asumsi: ya (`items`).*
2. **Rincian ukuran:** perlu tabel ukuran per item (S–XXL / ukuran anak)? Sablon punya `detail_ukuran`. *Belum dibuat.*
3. **Pekerja per tahap:** siapa mengerjakan Potong Kain & Jahit (borongan per orang/tim)? Rate gaji per jenis dibedakan per tahap (potong vs jahit vs QC/packing)? *Asumsi: ya, dicatat di `step.doneBy`.*
4. **Isi Approval utama:** file/link desain saja, atau juga spesifikasi bahan/warna/ukuran?
5. **Non-utama tanpa Packing** (sesuai alur yang diminta): benar tidak ada packing?
6. **Mockup non-utama:** perlu persetujuan pelanggan (Approve/Revisi) sebelum produksi?
7. **Permak/jahit:** harga bervariasi per jahitan — pencatatan keuangan per pesanan saja atau per item?
8. **Role baru** (penjahit, tukang potong) atau cukup role yang ada?
9. **Keuangan:** DP/lunas/invoice sama dengan Sablon?
10. **Catatan Rapat:** bentuk integrasi persis dengan produksi (baca Sablon dulu, konfirmasi bila ragu).

---

## 12. Riwayat

- **V.1.0** — Kerangka (zip `monitoring-produksi-konveksi`): login, profil, pengguna, pengumuman, notifikasi, backup, Tentang App, pindah unit.
- **V.1.2** — Pengelolaan user lewat `/api/users` (akun login + profil sekaligus); kolom password dihapus dari skema.
- **V.1.1** — Bagian 1: model pesanan, template tahap, status otomatis, Jenis Produksi di Pengaturan, daftar & form pesanan (utama/non-utama), detail hanya-baca, migration `002`.

---

## 13. Referensi skema Sablon (terverifikasi 17 Okt 2026)

Hasil query `information_schema`/`pg_policies`/`pg_proc` pada schema `monitoring_sablon`.
Dipakai sebagai acuan agar Konveksi tidak menebak-nebak.

### 13.1 Dipakai ulang di Konveksi (sudah ada di `001`/`002`)
`users, notifications, user_fcm_tokens, announcements, direksi_access, production_types, orders (struktur baru), order_logs`,
fungsi `is_staff, is_supervisor, is_admin_or_supervisor, has_perm, get_user_units, get_public_tables`, trigger `guard_users_update`, `guard_orders_update`.

### 13.2 Untuk Bagian 3–5 (belum dibuat; buat migration `003+`)
- **Kalender:** `calendar_events(id, title, date, color, event_time text, location, created_at)`; policy: staf kelola semua.
- **Catatan Rapat:** `production_notes(id, order_id, kode_produksi, nama_pemesan, content, section, created_by_id text, created_by_name, created_at)`; policy: staf baca & tulis (`created_by_id = auth.uid()`), hanya pembuat yang boleh hapus.
- **Config Harga:** `pricing_configs(id int, category, key_name, display_name, value_amount numeric, unit, effective_date date)` — riwayat per tanggal efektif; SELECT semua user login, INSERT/UPDATE `has_perm('config_harga','edit')`.
  Rencana pemakaian di Konveksi: `category='PRODUKSI'`, `key_name='{jenis_produksi.value}:{step_key}'` (mis. `kaos_polo:produksi_massal`), `unit='per_pcs'`, **tambah baris baru** tiap perubahan (jangan UPDATE).
- **Gaji:** `salary_payments(user_id uuid, period_month, period_year, kategori, total_amount, paid_at)` (policy: admin/manager/supervisor), `salary_closings(user_id text, order_id text, period_month, period_year)` (penanda order sudah dihitung gajinya), `salary_fixed`, `salary_bonus_manual`, `salary_fixed_payments` (gaji tetap & bonus — **tidak dibawa**, Konveksi hanya gaji produksi per item).
  ⚠️ Di Sablon, policy `salary_closings`, `salary_fixed`, `salary_bonus_manual`, `salary_fixed_payments` bernilai `true` untuk semua user login. Di Konveksi buat dengan `has_perm('salary', ...)`.

### 13.3 Untuk Bagian 6 (Keuangan)
Sablon: `finance_accounts, finance_categories, finance_vendors, finance_expenses, finance_transfers, finance_periods, finance_settings, finance_audit_log, order_invoices, order_payments`, view `v_account_balances, v_cashbook, v_order_finance, v_receivable_aging`, fungsi `fin_*` (issue_invoice, record_payment, verify_payment, void_payment, record_expense, decide_expense, void_expense, record_transfer, close/reopen_period, post/unpost_salary, purge_order, audit, perm, setting_*) dan trigger penjaga (`fin_no_delete`, `fin_period_guard`, `fin_audit_immutable`, `fin_lock_orders_payment_cols`).
- Yang **khusus kaos dan harus diganti**: `order_invoices.harga_dasar / biaya_ukuran_besar / biaya_lengan_panjang`, parameter `fin_issue_invoice`, kolom harga di `orders` (`harga_per_pcs, total_harga, dp_masuk, status_pembayaran, biaya_*`, `bukti_pembayaran`) — di Konveksi pakai **baris item** (`orders.items`) dan simpan rincian di `pricing_snapshot` (jsonb).
- `fin_post_salary` menerima jenis `'manual','qc','tetap'` → ganti ke jenis gaji Konveksi.
- **Butuh data seed** dari Sablon sebelum Bagian 6 (minta ke pemilik): `select * from finance_accounts / finance_categories / finance_settings` dan definisi `finance_expense_seq`, indeks unik `finance_expenses(source, source_ref)`, serta grant/policy kolom lain yang belum terlihat.

### 13.4 Catatan desain untuk Bagian 2
- Policy `users` hanya mengizinkan baca baris sendiri (atau semua bila admin/supervisor). `lib/notificationHelper.ts` mencari penerima lewat `from('users')` dari browser → untuk user non-admin hasilnya kosong, sehingga notifikasi ke role lain tidak terkirim. **Pindahkan pencarian penerima ke API server** (service role), mis. `/api/notify { roles | all, title, message, orderId }`, dan panggil dari `triggerOrderNotifications`.
- `notifications` INSERT hanya untuk `is_staff()`; baca/ubah hanya milik sendiri.

### 13.5 Hal yang belum terverifikasi
Isi `PGRST_DB_SCHEMAS` (apakah schema pertama dipakai sebagai default bila client tidak menyebut schema — Konveksi selalu menyebut schema eksplisit), publication `supabase_realtime` di Sablon, daftar bucket, dan GRANT tingkat tabel. Trigger/fungsi pada schema `auth` tidak ikut terquery (cek bila ingin memastikan pembuatan user).

