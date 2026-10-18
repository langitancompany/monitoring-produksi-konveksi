# PRD — Monitoring Produksi Konveksi (Langitan.co)

> Dokumen serah-terima. Siapa pun (manusia atau AI) yang melanjutkan proyek ini
> **baca dokumen ini dulu**, lalu kerjakan bagian berikutnya di tabel *Status*.
> Perbarui tabel Status dan changelog setiap selesai satu bagian.

Terakhir diperbarui: 18 Oktober 2026 · Versi aplikasi: V.1.5 (Bagian 4 selesai, **belum diuji** di database sungguhan — migration `004` belum dijalankan. Bagian 0–3 sudah diuji pemilik di database sungguhan)

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
| 1 | Fondasi pesanan | Model data, template tahap, status otomatis, Pengaturan → Jenis Produksi, daftar pesanan, form pesanan baru, detail (hanya baca), migration `001` (umum) & `002` (inti) berdasar skema asli Sablon | ✅ selesai, sudah diuji pemilik di database sungguhan (18 Okt 2026) |
| 1.5 | Pengelolaan user | `/api/users` (tambah/ubah/hapus: akun login + profil sekaligus), form Pengguna memakai Email Login, tanpa kolom password | ✅ selesai, sudah diuji pemilik di Supabase sungguhan (18 Okt 2026) |
| 2 | Alur produksi | Aksi tiap tahap di Detail (Approval, Potong, Jahit, QC, Packing, Kirim, Terima — 4 kartu gaya Sablon), upload file, kendala, edit & hapus (ke Sampah), log, notifikasi (penerima dihitung di server — lihat §13.4) | ✅ selesai, sudah diuji pemilik di Supabase/storage sungguhan (18 Okt 2026) |
| 3 | Arsip & pemantauan | Pesanan Selesai, Sampah (pulihkan / hapus permanen + file), Log Aktivitas, Kalender + migration `003` | ✅ selesai, sudah diuji pemilik di database sungguhan (18 Okt 2026) |
| 4 | Catatan Rapat | Catatan per pesanan di kartu 02/03/04 + menu rekap mingguan (ikuti Sablon) + migration `004` | ✅ selesai (belum diuji di database sungguhan — lihat §16) |
| 5 | Config Harga & Gaji | Rate gaji per item/tahap, Gaji & Upah, slip gaji. **Konsep sudah dijawab pemilik (§17); kodenya (termasuk PJ/tim di form pesanan) dibuat di akhir** | ⏸ menunggu urutan dari pemilik |
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
- **Env:** lihat `.env.example`. **Setup database:** README → "Menyiapkan Supabase" (`supabase/migrations/001_base_umum.sql` lalu `002_konveksi_core.sql`, `003_calendar.sql`, lalu `004_production_notes.sql`).

### Struktur folder (inti)
```
app/page.tsx                      kerangka & routing tab
app/components/{auth,layout,ui,misc,dashboard,orders,settings}
app/api/                          users (kelola user) · notify (broadcast per role/semua) · send-notification (1 user) · backup · health · version
hooks/   useAuth useUsers useNotifications useOrders useOrderDetail useOrderNotes useUpload useProductionTypes useUnitAccess useUpdateCheck
lib/     config steps access orderItems utils orderLogic orderArchive meetingNotes notificationHelper pushServer roles changelog tabs apiAuth supabaseAdmin userAdmin
types/   index.ts (user & hak akses)  order.ts (pesanan)
supabase/migrations/              001 base_umum · 002 konveksi_core · 003 calendar · 004 production_notes
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

## 7. Spesifikasi bagian (Bagian 2 sudah dikerjakan — lihat §14)

Acuan Sablon ada di kolom kanan — **baca file itu dulu**.

### Bagian 2 — Alur produksi ✅ (ringkasan hasil di §14)
- `OrderDetail` interaktif: kartu tiap tahap dengan tombol aksi sesuai `type` dan hak akses (`produksi`, `finishing`, `orders`).
- **Approval (utama):** pilih satu/lebih jenis produksi dari `production_types` aktif + jumlah per item (→ `items`, `jenis_produksi` = jenis pertama), upload file/link approval, catatan. Simpan → tahap selesai.
- **Kendala:** tambah/selesaikan, boleh dengan foto bukti → status `Ada Kendala`.
- **Edit pesanan** (data pemesan, deadline, jumlah, items), **hapus** = isi `deleted_at` (ke Sampah), hak akses `orders.delete`.
- Hak akses: `orders` (buat/edit/hapus), `produksi` (potong, jahit, kendala, upload approval/mockup), `finishing` (QC, packing, kirim, terima).
- Acuan Sablon: `app/components/orders/OrderDetail.tsx` + `orders/detail/*`, `hooks/useOrderDetail.ts`, `hooks/useUpload.ts`, `checkAutoStatus` di `hooks/useOrders.ts`, `lib/orderLogic.ts`, `EditOrder.tsx`.
- Tambah ke `useOrders`: `applyStepUpdate(order, stepKey, patch)` (menghitung ulang `deriveStatus`, update, log, notifikasi), `handleEditOrder`, `handleDeleteOrder`.

### Bagian 3 — Arsip & pemantauan ✅ (ringkasan hasil di §15)
- **Pesanan Selesai** (`status = 'Selesai'`, tidak dihapus), pagination. Acuan: `orders/CompletedOrders.tsx`.
- **Sampah** (`deleted_at` terisi): pulihkan / hapus permanen (hapus file storage terkait). Acuan: `orders/TrashView.tsx`, `handleRestoreOrder`, `handlePermanentDelete`.
- **Log Aktivitas** dari `order_logs` (filter kategori, pencarian). Acuan: `apps/ActivityLogView.tsx`.
- **Kalender** deadline & tanggal masuk. Acuan: `apps/CalendarView.tsx`.
- Tab baru: `completed_orders`, `trash`, `logs`, `calendar`; hak akses `logs`, `trash` (tambahkan ke `UserPermissions`).

### Bagian 4 — Catatan Rapat ✅ (ringkasan hasil di §16)
- Terintegrasi dengan menu produksi **seperti Sablon**: catatan ditulis di kartu 02/03/04 detail pesanan (`ProductionNotes`), direkap per minggu di menu Catatan Rapat (`WeeklyNotesView` Sablon → `MeetingNotesView`). Tabel `production_notes` + migration `004` (nomor `003` sudah dipakai Kalender).

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
3. **Pekerja per tahap:** ✅ DIJAWAB pemilik (18 Okt 2026) → lihat §17: konsep sama dengan Sablon (PJ + tim produksi dipilih saat pesanan dibuat; tim QC; admin). `step.doneBy` bukan lagi dasar gaji.
4. **Isi Approval utama:** file/link desain saja, atau juga spesifikasi bahan/warna/ukuran?
5. **Non-utama tanpa Packing** (sesuai alur yang diminta): benar tidak ada packing?
6. **Mockup non-utama:** perlu persetujuan pelanggan (Approve/Revisi) sebelum produksi?
7. **Permak/jahit:** harga bervariasi per jahitan — pencatatan keuangan per pesanan saja atau per item?
8. **Role baru** (penjahit, tukang potong) atau cukup role yang ada? ✅ DIJAWAB: cukup role yang ada (`produksi`, `qc`, `admin`) — lihat §17.
9. **Keuangan:** DP/lunas/invoice sama dengan Sablon?
10. **Catatan Rapat:** bentuk integrasi persis dengan produksi (baca Sablon dulu, konfirmasi bila ragu).

---

## 12. Riwayat

- **V.1.5** — Bagian 4: catatan produksi di detail pesanan (kartu 02/03/04), menu Catatan Rapat (rekap mingguan + cetak/PDF), migration `004`; hapus `StepCard.tsx` sisa lama.
- **V.1.4** — Bagian 3: Pesanan Selesai, Kalender (+ agenda), Log Aktivitas, Sampah (pulihkan / hapus permanen), migration `003`.
- **V.1.0** — Kerangka (zip `monitoring-produksi-konveksi`): login, profil, pengguna, pengumuman, notifikasi, backup, Tentang App, pindah unit.
- **V.1.3** — Bagian 2: aksi tiap tahap, upload bukti, Approval (items), QC & revisi, kendala, edit & hapus ke Sampah, `/api/notify`.
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
- **Kalender:** ✅ dibuat di `003_calendar.sql` (Bagian 3): `calendar_events(id, title, date, color, event_time text, location, created_at)`; policy: staf kelola semua.
- **Catatan Rapat:** ✅ dibuat di `004_production_notes.sql` (Bagian 4), dengan penyesuaian — lihat §16.
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
- ✅ SUDAH dikerjakan di Bagian 2 (`/api/notify`). Catatan awal: Policy `users` hanya mengizinkan baca baris sendiri (atau semua bila admin/supervisor). `lib/notificationHelper.ts` mencari penerima lewat `from('users')` dari browser → untuk user non-admin hasilnya kosong, sehingga notifikasi ke role lain tidak terkirim. **Pindahkan pencarian penerima ke API server** (service role), mis. `/api/notify { roles | all, title, message, orderId }`, dan panggil dari `triggerOrderNotifications`.
- `notifications` INSERT hanya untuk `is_staff()`; baca/ubah hanya milik sendiri.

### 13.5 Hal yang belum terverifikasi
Isi `PGRST_DB_SCHEMAS` (apakah schema pertama dipakai sebagai default bila client tidak menyebut schema — Konveksi selalu menyebut schema eksplisit), publication `supabase_realtime` di Sablon, daftar bucket, dan GRANT tingkat tabel. Trigger/fungsi pada schema `auth` tidak ikut terquery (cek bila ingin memastikan pembuatan user).


---

## 14. Hasil Bagian 2 (V.1.3) — baca sebelum lanjut

**Pintu tunggal perubahan pesanan:** `commitOrder()` di `hooks/useOrders.ts`. Semua aksi
(tahap, kendala, edit) lewat sini: hitung `deriveStatus` → update → log → notifikasi → `fetchOrders`.
Pengaman dua-orang-sekaligus: update memakai `.eq('updated_at', …)`; bila 0 baris berubah,
perubahan ditolak & data dimuat ulang. Sudah diuji pemilik di database sungguhan (18 Okt 2026).

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. `deriveStatus`: *Revisi* hanya selama Produksi Massal belum diselesaikan ulang; setelah itu status *Finishing* (menunggu QC diulang).
2. **Tampilan sama dengan Sablon: 4 kartu bernomor** — 01 Approval · 02 Produksi (Potong Kain & Jahit + Lapor Kendala) · 03 QC & Packing (dua kolom; non-utama hanya QC) · 04 Pengiriman (Bukti Kirim & Bukti Terima). Pemetaan tahap→kartu = `section` di `STEP_TEMPLATES` (`lib/steps.ts`); komponen: `orders/detail/StepApproval|StepProduksi|StepFinishing|stepUi`. **Semua tahap = upload foto** (kecuali Approval = form, QC = Lolos/Revisi). Tiap tahap selesai menampilkan **"Oleh: nama | waktu"** (`step.uploadedBy`, `step.completedAt`). Tidak ada pemilih pekerja: **pengunggah = pekerja** → `step.doneBy` berisi ID pengunggah (bukan nama); saat revisi QC, pekerja lama tetap tercatat dan pengunggah baru ditambahkan (dasar gaji Bagian 5). Tampilan memakai KEY tahap, bukan `step.type` tersimpan.
3. Approval: wajib file (gambar/PDF) **atau** link; jumlah pesanan otomatis = total item.
4. Izin: Approval = `produksi.create` atau `orders.edit`; Potong/Jahit/Mockup = `produksi.edit`; QC/Packing/Kirim/Terima = `finishing.edit`; batalkan tahap = `*.delete`; kendala = `produksi.edit`/`finishing.edit`/`orders.edit`. Approval & Detail tidak bisa dibatalkan (ubah lewat Edit).
5. Notifikasi deadline mepet/telat hanya saat status berpindah atau deadline diubah (bukan tiap klik). Ditambah notifikasi status *Kirim* ke admin & supervisor.
6. File storage: `production-proofs/konveksi/{orderId}/YYYY-MM-DD_Kode_Jenis_HHmmss.ext`. Awalan 3 tingkat ini **wajib**: cron `cleanup-storage` Sablon memindai 2 tingkat dan menghapus file yang tak dikenal. Saran: tambahkan pengecualian folder `konveksi` di cron itu.

**Keterbatasan diketahui:**
- Gaji borongan memakai pengunggah foto sebagai pekerja. Kalau penjahit/tukang potong tidak punya akun sendiri dan yang upload orang lain (mis. admin), gaji tercatat ke pengunggah — butuh keputusan pemilik (§11 no. 3 & 8).
- ✅ Catatan per kartu ("Catatan" di bawah kartu 02/03/04 pada Sablon) sudah ada sejak Bagian 4 (tabel `production_notes`, lihat §16).
- Approval pesanan utama tetap berupa form (jenis produksi + jumlah per item + file/link), bukan hanya upload mockup seperti Sablon, karena item dipakai untuk gaji & tagihan.
- Hapus file dari storage saat tahap dibatalkan **belum** dilakukan (hanya dilepas dari pesanan); pembersihan sudah dikerjakan di Bagian 3 lewat Hapus Permanen (§15).
- Pesanan baru: pesan "Pesanan Baru" memberi notifikasi ke semua user termasuk pembuatnya (perilaku Sablon).
- `npm install` dan `next build` tidak bisa dijalankan di lingkungan pengerjaan (tanpa internet). Verifikasi dilakukan dengan `tsc` + stub tipe dan 28 uji logika (urutan tahap, QC→revisi→QC ulang, validasi item, nama file). **Jalankan `npm install && npx tsc --noEmit && npm run build` di komputer Anda sebelum deploy.**

**Daftar pesanan (gaya Sablon):** `orders/OrderList.tsx` — Kanban desktop 4 kolom (Pesanan Masuk · Produksi · Finishing · Pengiriman, dengan penghitung), kartu + progress bar di HP, filter Semua/Proses/Telat/Kendala/Siap Kirim + bulan + jenis + pencarian, urut paling mendesak (telat → ≤3 hari → tanggal masuk), tombol Hapus (konfirmasi → Sampah). Kolom ditentukan `currentPhase()` (tahap aktif, `lib/steps.ts`), BUKAN `status`, jadi pesanan "Ada Kendala"/"Revisi" tetap di kolom tahap sebenarnya (Sablon memasukkannya ke On Process). "Siap Kirim" = status Kirim saja; pesanan Selesai ada di menu Pesanan Selesai (Bagian 3). Chip PIC/Helper Sablon tidak dibawa (Konveksi belum punya penanggung jawab per pesanan).

**Perubahan nama tahap:** `pengiriman` kini berlabel "Bukti Kirim (Resi)", `penerimaan` "Bukti Terima (User)" (mengikuti Sablon).

**Pertanyaan terbuka yang makin mendesak (§11):** no. 3 & 8 (siapa mengerjakan Potong/Jahit; perlu role penjahit?) — menentukan Bagian 5.

---

## 15. Hasil Bagian 3 (V.1.4) — baca sebelum lanjut

**Menu baru** (tab di `lib/tabs.ts`): `completed_orders` (Pesanan Selesai), `calendar`, `logs`, `trash`.
Izin: Pesanan Selesai & Kalender = `orders.view`; Log = `logs.view`; Sampah = `trash.view`
(pulihkan = `orders.delete` atau `trash.delete`; hapus permanen = `trash.delete`, sesuai RLS/trigger `002`).
User selain supervisor **tidak otomatis** dapat `logs`/`trash` — atur di Pengaturan → Pengguna.

**File:** `orders/CompletedOrders.tsx`, `orders/TrashView.tsx`, `apps/ActivityLogView.tsx`, `apps/CalendarView.tsx`,
`ui/TablePagination.tsx`, `lib/orderArchive.ts` (helper murni), `hooks/useOrders.ts` (+`completedOrders`, `trashedOrders`,
`handleRestoreOrder`, `handlePermanentDelete`), `lib/access.ts` (`can()` kini menerima semua modul & aksi `view`),
migration `003_calendar.sql`.

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. **Tgl. Selesai = waktu tahap terakhir selesai** (`completionDate()`), bukan deadline seperti Sablon; filter bulan memakai bulan+tahun. Sejalan dengan dasar bulan gaji (Bagian 5).
2. **Hapus Permanen:** baris pesanan dihapus DULU, baru file storage (kalau ditolak izin, tidak ada file yang hilang). File yang dihapus = yang dirujuk data pesanan + seluruh isi folder `konveksi/{orderId}/` (termasuk file lepasan dari tahap yang dibatalkan). Pengaman: hanya path berawalan `konveksi/`; tautan luar (Drive) tak disentuh; hanya pesanan yang memang di Sampah.
3. **Log pesanan TIDAK ikut dihapus** (beda dengan Sablon): `order_id` menjadi kosong lewat `on delete set null`, ditambah satu log "Pesanan Dihapus Permanen". Alasan: jejak audit.
4. Tombol Kembali dari detail pesanan pulang ke menu asal (`returnTab` di `app/page.tsx`; tidak tersimpan di URL, jadi setelah refresh kembali ke daftar pesanan).
5. Kalender memakai `Date` bawaan (tanpa `date-fns`), memuat agenda hanya untuk rentang bulan yang tampil. Tanggal masuk bisa dimatikan lewat centang.
6. Tanpa grafik tren di Pesanan Selesai (recharts belum dipasang; masuk Bagian 7). Diganti statistik "selesai tepat waktu".
7. Log Aktivitas memuat 1000 log terbaru (seperti Sablon); filter & cari bekerja di data itu.

**Verifikasi:** `npm install` + `tsc` + `next build` kini bisa dijalankan. 13 uji logika `lib/orderArchive.ts` lulus
(termasuk pengaman path storage). Pemilik sudah menguji semuanya di database/storage sungguhan (18 Okt 2026): `003_calendar.sql`,
pulihkan, hapus permanen (`storage.list/remove`, RLS), dan agenda kalender.

**Temuan lama (bukan dari Bagian 3):** `app/components/orders/detail/StepCard.tsx` adalah sisa desain lama (pemilih pekerja),
tidak diimpor di mana pun, dan mengimpor `STEPS_WITH_WORKER_PICKER` yang sudah tidak ada → `tsc` dan `next build` GAGAL.
✅ Sudah dihapus di Bagian 4 (V.1.5).

**Catatan:** notifikasi lama yang menunjuk pesanan yang sudah dihapus permanen tidak punya tujuan (klik tidak berefek).


---

## 16. Hasil Bagian 4 (V.1.5) — baca sebelum lanjut

**Yang ada:**
- **Catatan di Detail Pesanan:** kotak "Catatan" di bawah kartu 02 Produksi (`section = produksi`), 03 QC & Packing
  (`finishing`), dan 04 Pengiriman (`pengiriman`) — pemetaan sama dengan Sablon. Komponen `orders/detail/ProductionNotes.tsx`;
  data dimuat **sekali** per pesanan oleh `hooks/useOrderNotes.ts` (Sablon memuat tiga kali), diteruskan lewat prop `notes`
  ke `StepProduksi` & `StepFinishing`. `OrderDetail` kini menerima prop `supabase`.
- **Menu Catatan Rapat** (tab `meeting_notes`, ikon `ClipboardList`, di grup UTAMA setelah Kalender): `apps/MeetingNotesView.tsx`.
  Filter Minggu ini / Minggu lalu / Semua, dikelompokkan per pesanan (Produksi · QC & Packing · Pengiriman), kode pesanan bisa
  diklik ke detail (`openOrder(id, "meeting_notes")`, tombol Kembali pulang ke menu ini).
- **Logika murni** di `lib/meetingNotes.ts` (rentang minggu, pengelompokan, validasi teks, pesan galat, HTML laporan cetak).
- **Migration `004_production_notes.sql`** (nomor `003` sudah dipakai Kalender).

**Izin:** tanpa modul izin baru. Menu & tulis catatan = staf yang boleh melihat pesanan (`orders.view`; RLS `is_staff()`).
Hapus catatan = penulisnya atau supervisor (RLS `created_by_id = auth.uid()` atau `is_supervisor()`). Catatan **tidak bisa diubah**
(tidak ada grant/policy `update`) — hanya tambah & hapus.

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. **PDF lewat dialog cetak browser** ("Cetak / Simpan PDF"), bukan `jsPDF` seperti Sablon: satu tombol menggantikan "Print" + "Download PDF",
   tanpa menambah library (jsPDF belum ada di `package.json`), dan teks Indonesia/Unicode aman. Isi catatan di-escape sebelum masuk HTML laporan (diuji).
2. **`order_id` = uuid dengan foreign key `on delete cascade`** (Sablon: teks tanpa FK). Catatan ikut terhapus saat pesanan dihapus permanen;
   jejaknya tetap ada di `order_logs` (Bagian 3 sengaja mempertahankan log). Ubah ke `set null` bila catatan rapat ingin diarsipkan terus.
3. `created_by_id` = uuid (sama dengan `users.id`), default `auth.uid()`, dan policy insert mewajibkan `created_by_id = auth.uid()` (pembuat tidak bisa dipalsukan).
4. **Nama & kode pesanan di rekap memakai data pesanan terbaru**, bukan salinan saat catatan ditulis (tetap disimpan sebagai cadangan). Catatan dari pesanan di **Sampah tidak tampil**
   di rekap (muncul lagi bila dipulihkan).
5. Hapus catatan memakai konfirmasi (Sablon langsung menghapus); gagal simpan/hapus/muat menampilkan pesan (Sablon diam). Bila migration `004` belum dijalankan, pesan galat menunjuk file-nya.
6. Panjang catatan maks 500 karakter (database 1000). Minggu dimulai **Senin**, mengikuti waktu lokal browser.
7. Menulis catatan **tidak** menulis log aktivitas dan **tidak** mengirim notifikasi (sama dengan Sablon) — catatan ini untuk rapat, bukan alur kerja.
8. Rekap memuat maksimal 1000 catatan terbaru (batas PostgREST); bila tercapai ada pemberitahuan. Pesanan dengan banyak catatan dalam "Semua" bisa terpotong — pakai filter minggu.

**Verifikasi:** `npm install` tidak bisa dijalankan penuh di lingkungan pengerjaan (tanpa internet), jadi cek tipe memakai stub; tidak ada galat di file yang diubah.
19 uji logika `lib/meetingNotes.ts` lulus (rentang minggu lintas bulan/tahun, pengelompokan, escape HTML, aturan hapus, pesan galat).
**Jalankan `npm install && npx tsc --noEmit && npm run build` di komputer Anda sebelum deploy.**

**Belum diuji dengan database sungguhan:** migration `004` (grant & 3 policy), simpan/hapus catatan dari browser (RLS), rekap mingguan, dialog cetak
(terutama di Safari/HP), perilaku cascade saat Hapus Permanen pesanan yang punya catatan.

**Berikutnya:** Bagian 5 (Config Harga & Gaji) konsepnya sudah dijawab pemilik — lihat §17. Pemilik meminta kodenya dibuat **di akhir**; tanyakan urutan pengerjaan sebelum melanjutkan.


---

## 17. Keputusan pemilik: model gaji & penanggung jawab (18 Okt 2026) — dasar Bagian 5

**Jawaban pemilik:** alur gaji **sama seperti Sablon**. Penerima gaji ditentukan oleh **role user**: tim produksi (`produksi`),
tim QC (`qc`), dan admin (`admin`). Saat **pesanan dibuat**, diisi **PJ (penanggung jawab)** dan **tim produksinya**.
**Kodenya dibuat di akhir** (bukan sekarang) — jangan membangun field PJ/tim atau perhitungan gaji sebelum diminta.

**Cara kerja di Sablon (dibaca dari `SalaryView.tsx`, `FixedSalaryView.tsx`, `CreateOrder.tsx`, 18 Okt 2026):**
1. **Produksi (per pesanan):** kolom `orders.assigned_to` (PJ, wajib) dan `orders.helper_id` (Helper, opsional) diisi di form Pesanan Baru & Edit.
   Gaji muncul bila semua tahap produksi pesanan selesai. Tanpa Helper, PJ menerima seluruh nominal; dengan Helper, nominal dibagi
   (sistem lama 70% PJ : 30% Helper; sistem baru: upah dasar per profesi + bonus).
2. **Tim QC (tetap, bukan per pesanan):** semua user ber-role `qc` = anggota tim. Pool = total qty semua pesanan yang QC lolos + packing selesai
   × (tarif finishing + packing), **dibagi rata** ke seluruh anggota tim.
3. **Admin:** bonus per pesanan (Sablon: Rp X per closing + Rp Y per pcs di atas batas pcs; parameter di Config Harga). Memakai pembuat pesanan.
4. **Bulan gaji** = bulan tahap terakhir selesai (`completedAt`), bukan bulan pesanan dibuat. **Rate berhistori** (`pricing_configs`, INSERT baru tiap perubahan,
   dipilih menurut `effective_date` ≤ tanggal tahap selesai). Status **lunas** per orang per kategori per bulan (`salary_payments`), slip gaji bisa dicetak.

**Pemetaan ke Konveksi (asumsi saya — konfirmasi saat membangun):**
- Role: tidak perlu role baru (menjawab §11 no. 8). `lib/roles.ts` sudah punya `produksi`, `qc`, `admin`.
- Kolom baru di `orders`: `assigned_to` (PJ) dan `helper_id` (tim produksi) + isian di `CreateOrder`/`EditOrder` (pilihan = user ber-role `produksi`, seperti Sablon).
  Perlu migration baru (nomor berikutnya), mengganti pemakaian `step.doneBy` sebagai dasar gaji (keterbatasan di §14 terselesaikan lewat cara ini).
- Dasar nominal produksi: **rate per item (jenis produksi)** dari `items` (§7 Bagian 5), bukan komposisi gesut Sablon. Cara membagi antara PJ dan tim → pertanyaan di bawah.
- Tim QC & admin: ikuti Sablon (poin 2–3), dengan basis qty = `jumlah` / total `items`.

**Pertanyaan yang harus dikonfirmasi sebelum membangun (jangan menebak):**
1. **Tim produksi** satu orang (seperti `helper_id` Sablon) atau **beberapa orang** per pesanan?
2. **Pembagian PJ : tim** — memakai 70% : 30% seperti sistem lama Sablon, atau persentase lain / upah dasar tetap per profesi?
3. **Admin** — bonus per closing + per pcs seperti Sablon? (PRD §13.2 awalnya menyebut gaji tetap & bonus "tidak dibawa"; keputusan ini perlu dipastikan.)
4. **Tahap yang dihargai** — apakah Potong Kain dan Jahit punya rate berbeda, dan siapa yang mengerjakan Potong (PJ/tim yang sama)?
5. Pesanan **non-utama** (Selempang, Permak) — apakah ikut dihitung gajinya, dan dengan rate apa (harga bervariasi per jahitan, §11 no. 7)?

