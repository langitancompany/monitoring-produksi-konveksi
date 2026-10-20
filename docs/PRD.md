# PRD — Monitoring Produksi Konveksi (Langitan.co)

> Dokumen serah-terima. Siapa pun (manusia atau AI) yang melanjutkan proyek ini
> **baca dokumen ini dulu**, lalu kerjakan bagian berikutnya di tabel *Status*.
> Perbarui tabel Status dan changelog setiap selesai satu bagian.

Terakhir diperbarui: 20 Oktober 2026 · Versi aplikasi: V.1.14 (Bagian 6 langkah 6.4 — layar Tagihan & Pembayaran — selesai di kode: 44 uji keuangan lulus dan cek tipe bersih dengan stub modul pihak ketiga (`npm install` tidak bisa dijalankan di lingkungan pengerjaan), tetapi **layar belum pernah dilihat di browser** dan migration `009`–`011` **belum dijalankan di Supabase pemilik**; rincian & daftar uji di §21.7. Bagian lain: lihat tabel Status dan §14–§21 — Bagian 5, 7, 8 juga masih menunggu uji pemilik.)

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
| 4 | Catatan Rapat | Catatan per pesanan di kartu 02/03/04 + menu rekap mingguan (ikuti Sablon) + migration `004` | ✅ selesai, sudah diuji pemilik di database & browser (18 Okt 2026) |
| 5 | Config Harga & Gaji | Menu Config Harga (rate per jenis × tahap, parameter PJ/bonus admin, riwayat), menu Gaji & Upah (produksi PJ+tim, pool QC, bonus admin, tandai lunas, slip cetak), PJ di form pesanan, salinan PJ/tim di pesanan, migration `007` | ✅ selesai di kode, logika teruji; **migration `007` & semua layar belum diuji** di Supabase/browser pemilik. Jawaban §17 diganti **asumsi bawaan yang bisa diubah di Config Harga** — rincian di §20 |
| 6 | Keuangan | Tagihan → pembayaran → verifikasi (ikuti Keuangan v2 Sablon). **Dibangun bertahap, 8 langkah (6.1–6.8)** — rencana & status tiap langkah di §21 | 🟡 **6.1–6.4 selesai di kode** (migration `009`–`011` diuji di Postgres lokal; layar 6.4 belum dilihat di browser; belum ada yang diuji di Supabase pemilik); 6.5–6.8 belum |
| 7 | Dashboard & finishing | Dashboard ringkasan, tampilan Kanban, pengetatan RLS, rapikan lint | ✅ selesai di kode, **belum diuji** (migration `005`, Dashboard di browser) — rincian & sisa pekerjaan di §18 |
| 8 | Tim Produksi | Pengaturan → Tim (kartu + avatar anggota), pilihan Tim di Pesanan Baru/Edit, tampil di Detail Pesanan, migration `006` | ✅ selesai di kode, migration diuji di Postgres lokal, **belum diuji** di Supabase & browser pemilik — rincian di §19 |

Urutan berikutnya: **Bagian 6 (Keuangan), langkah 6.5 (Pengeluaran)** — lihat §21. Sebelum itu, uji dulu layar 6.4 di browser (§21.7). (Sempat terblokir karena DDL Sablon `001`–`009` tidak ada; diatasi dengan merancang skema Konveksi sendiri dari tipe TypeScript & pemanggilan API Sablon — rincian di §21.) Pekerjaan dibagi per bagian **sengaja** (batas token). Selesaikan satu bagian
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
- **Env:** lihat `.env.example`. **Setup database:** README → "Menyiapkan Supabase" (`supabase/migrations/001_base_umum.sql` lalu `002_konveksi_core.sql`, `003_calendar.sql`, `004_production_notes.sql`, `005_rls_hardening.sql`, `006_teams.sql`, lalu `007_pricing_salary.sql`).

### Struktur folder (inti)
```
app/page.tsx                      kerangka & routing tab
app/components/{auth,layout,ui,misc,dashboard,orders,settings,apps,finance}
app/api/                          users (kelola user) · notify (broadcast per role/semua) · send-notification (1 user) · backup · health · version
hooks/   useAuth useUsers useNotifications useOrders useOrderDetail useOrderNotes useUpload useProductionTypes useTeams usePricing useSalaryPayments useUnitAccess useUpdateCheck
lib/     config steps access orderItems utils orderLogic orderArchive meetingNotes dashboardStats teams salary salaryPrint notificationHelper pushServer roles changelog tabs apiAuth supabaseAdmin userAdmin
types/   index.ts (user & hak akses)  order.ts (pesanan)  team.ts (tim)  salary.ts (harga & gaji)
supabase/migrations/              001 base_umum · 002 konveksi_core · 003 calendar · 004 production_notes · 005 rls_hardening · 006 teams · 007 pricing_salary
tests/                            uji logika murni (jalankan: npx tsx tests/teams.test.ts, npx tsx tests/salary.test.ts). Catatan: `tests/dashboardStats.test.ts` yang disebut §18 TIDAK ada di zip yang diserahkan ke pengerjaan Bagian 8 (folder `tests/` dibuat baru di V.1.7) — cek apakah file itu masih ada di repo asli
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
| `assigned_to` | PJ (→ `users.id`). Dipilih di Pesanan Baru/Edit sejak V.1.8, **wajib di form sejak V.1.9** (kolom database tetap boleh kosong — pesanan lama / user dihapus); dijaga trigger (butuh `orders.edit`) |
| `crew_snapshot` | jsonb `{pj, team_id, member_ids[], at}` — salinan PJ + anggota tim yang dibuat **trigger database** saat Potong & Jahit/Produksi sama-sama selesai (migration `007`). Dasar pembagian gaji produksi. Tidak boleh ditulis dari aplikasi |
| `team_id` | tim pengerjaan (→ `teams.id`, opsional). Migration `006`. `on delete set null`: menghapus tim tidak menghapus pesanan |

### `teams` — tim produksi (migration `006`)
`id, name, description, member_ids (uuid[]), is_active, created_at, updated_at`.
Nama unik tanpa membedakan huruf besar/kecil (`lower(btrim(name))`). `member_ids` berisi `users.id`;
satu user boleh ada di banyak tim. Array tidak punya foreign key, jadi trigger `trg_users_remove_from_teams`
mengeluarkan user dari semua tim saat user dihapus. Pesanan **tidak** menyimpan salinan anggota tim (lihat §19 no. 7).

### `pricing_configs` — riwayat harga (migration `007`)
`id, category ('PRODUKSI'|'PARAMETER'), key_name, display_name, unit, value_amount (Rupiah utuh), effective_date, created_by, created_at`.
PRODUKSI: `key_name = "{jenis.value}:{kunci}"`, `kunci` ∈ `gaji_pj · produksi_massal · qc · packing` (sejak V.1.9; `potong_kain` dan parameter `pj_share_percent` tinggal sebagai baris lama yang **diabaikan**). PARAMETER: `bonus_admin_closing · batas_pcs_bonus_admin · bonus_admin_per_pcs`. **Hanya INSERT** (tak ada policy/grant update-delete); rate dipilih menurut `effective_date ≤ tanggal tahap selesai`, seri → `id` terbesar.

### `salary_payments` & `salary_audit_log` (migration `007`)
Penanda lunas per `(user_id, period_month 1–12, period_year, kategori produksi|qc|admin)` unik + nominal; jejak audit tiap tandai/batal. **Tak bisa ditulis langsung dari browser** — hanya lewat fungsi `mark_salary_paid` / `unmark_salary_paid` (izin `salary.edit` dicek di dalam fungsi).

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

### Bagian 7 — Dashboard & finishing ✅ (ringkasan hasil di §18)
- Dashboard ringkasan (jumlah per status, telat, pesanan menurut jenis, grafik bulanan). Acuan: `dashboard/Dashboard.tsx`, `useDashboard.ts`, `ChartBar/ChartPie/ActionList/HeroSection`. Pakai `recharts` (tambahkan lagi ke `package.json`).
- Tampilan Kanban di daftar pesanan (Sablon: `KanbanBoard` di `OrderList.tsx`) — sudah ada sejak Bagian 2 (§14).
- **Kencangkan RLS** (lihat bagian 10) dan rapikan lint.

---

## 8. Hak akses

Tipe: `UserPermissions` (`types/index.ts`). Saat ini: `dashboard, orders, produksi, finishing, salary, keuangan, settings`. `supervisor` selalu boleh semuanya.
Role bawaan: supervisor, manager, admin, produksi, qc, designer (`lib/roles.ts`; satu user boleh banyak role). Tambah role baru bila perlu (mis. penjahit) — **tanyakan pemilik**.

**Gaji & harga (V.1.8):** menu Gaji & Upah = `salary.view`; cetak slip = `salary.create` (kebiasaan Sablon: kolom "Buat" dipakai untuk cetak); tandai/batalkan lunas = `salary.edit`; buka Edit Pesanan dari peringatan gaji = `orders.edit`. Menu Config Harga = `config_harga.view`; simpan harga = `config_harga.edit`. User selain supervisor **tidak otomatis** punya izin ini — atur di Pengaturan → Pengguna. Memilih PJ di pesanan = `orders.create` / `orders.edit`. Peringatan: user non-admin hanya bisa membaca baris `users` miliknya sendiri (RLS 001), jadi di menu Gaji nama orang lain tampil "Pengguna tidak ditemukan" kecuali yang melihat ber-role admin/supervisor — beri izin Gaji hanya ke admin/supervisor.

**Keuangan (V.1.14):** modul `keuangan` — `view` = melihat tab Tagihan/Transaksi/Akun & kartu Harga & Pembayaran di Detail Pesanan; `create` = terbit/revisi tagihan + catat pembayaran; `edit` = verifikasi/tolak pembayaran + mencatat refund + melihat tab Verifikasi; `delete` = void. Hak dihitung **server** (`meta.caps`, supervisor = penuh); tombol di UI hanya mengikutinya. Seperti Gaji, user non-admin tidak otomatis punya izin ini.

**Tim produksi tidak punya modul izin sendiri:** kelola tim (tambah/ubah/nonaktifkan/hapus) memakai izin `settings` (`create`/`edit`/`delete`, sama seperti Jenis Produksi); **melihat** daftar tim boleh semua staf (supaya form pesanan bisa menampilkan pilihan tim); memilih/mengganti tim di pesanan = `orders.create` / `orders.edit`.

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
- **Penjaga kolom `orders` (migration `005`):** trigger `guard_orders_update` membatasi tiap kelompok kolom ke izin yang sesuai (data pemesan/deadline/assigned_to = `orders.edit`; items/jumlah = `orders.edit` atau `produksi.create`; steps/kendala/status = izin produksi/finishing/orders.edit; kode, kategori, pembuat = tidak boleh berubah). Menambah kolom baru di `orders`? **Tambahkan ke trigger itu**, kalau tidak kolomnya hanya dijaga policy longgar.
- **Tim (migration `006`):** tabel `teams` ber-RLS (baca = `is_staff()`, tulis = `settings.create/edit/delete`, tanpa grant `anon`). `team_id` ditambahkan ke penjaga `guard_orders_update` (grup data pemesan: butuh `orders.edit`). Pengecualian disengaja: `team_id` boleh menjadi NULL bila timnya baru dihapus (aksi otomatis `on delete set null`) — kalau tidak, user yang boleh menghapus tim tetapi tidak punya `orders.edit` akan gagal menghapus tim yang sedang dipakai pesanan. Fungsi `guard_orders_update` kini didefinisikan di `006` (salinan `005` + `team_id`); **mengubahnya lagi harus mulai dari versi `006`, bukan `005`**.
- **Gaji (migration `007`):** `pricing_configs` insert-only (grant `update/delete` dicabut, tak ada policy); `salary_payments` & `salary_audit_log` tanpa grant tulis ke `authenticated` — hanya fungsi `security definer` yang menulis. `guard_orders_update` kini didefinisikan di `007` (salinan `006` + penjaga `crew_snapshot`); **mengubahnya lagi harus mulai dari versi `007`**. **Batasan:** nominal yang dicatat saat "tandai lunas" dikirim aplikasi (rumus gaji ada di TypeScript, bukan di database), jadi pemegang `salary.edit` bisa mencatat angka berbeda dari hitungan — sebabnya tersimpan di audit. Perhitungan ulang di server baru perlu bila gaji menyangkut kontrol keuangan ketat (bersama Bagian 6).
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
11a. **(V.1.8)** Pertanyaan §17 (5 butir) + §11 no. 11a–c **belum dijawab pemilik**; Bagian 5 dibangun dengan asumsi bawaan di §20 yang bisa diubah dari Config Harga tanpa kode. **Konfirmasikan** sebelum gaji dipakai sungguhan.
11. **Tim produksi:** ✅ DIJAWAB (18 Okt 2026) — tim dibuat dari user di Pengaturan → Tim, tampil sebagai kartu avatar, dipilih saat input pesanan (§19). **Masih terbuka untuk Bagian 5:** (a) bila anggota tim berubah, apakah gaji pesanan lama ikut berubah? (b) apakah anggota tim dibatasi role `produksi`? (c) apakah tim juga perlu dipakai filter di daftar pesanan/Dashboard?

---

## 12. Riwayat

- **V.1.14** — Bagian 6 langkah 6.4: layar Keuangan (tab Tagihan, Transaksi, Verifikasi, Akun & Pengaturan), form tagihan per item, form pembayaran + bukti, kartu Harga & Pembayaran di Detail Pesanan, `lib/finance/view.ts`, `pending_count` di `/api/finance/meta`. Tanpa migration baru. Lihat §21.7.
- **V.1.13** — Bagian 6 langkah 6.3: pembayaran (migration `011`, `payments.ts`, `/api/finance/payments/*`, bucket `finance-proofs`). Lihat §21.6.
- **V.1.12** — Bagian 6 langkah 6.2: tagihan (migration `010`, `pricing.ts`, `/api/finance/invoices`, `/api/finance/orders/[orderId]`). Lihat §21.5.
- **V.1.11** — Bagian 6 langkah 6.1: fondasi Keuangan (migration `009`, `lib/finance/*`, `/api/finance/meta`, menu Keuangan versi awal, `tests/finance.test.ts`). Lihat §21.
- **V.1.10** — Gaji Admin jadi **bulanan** seperti tab "Admin & Designer" Sablon: semua user ber-role admin tampil tanpa closing; gaji tetap berhistori + bonus closing pilihan + bonus manual; migration `008`. Lihat §20 "Revisi V.1.10".
- **V.1.9** — Revisi Bagian 5 sesuai jawaban pemilik (19 Okt 2026): gaji produksi = pcs dibagi rata, anggota tarif Jahit & PJ tarif **Gaji PJ** (tanpa 70:30), kolom Potong Kain di Config Harga diganti Gaji PJ, PJ wajib di form. Tanpa migration baru. Lihat §20 "Revisi V.1.9".
- **V.1.8** — Bagian 5: Config Harga, Gaji & Upah (produksi PJ+tim, pool QC, bonus admin, tandai lunas, slip cetak), PJ di form pesanan, salinan PJ/tim di pesanan, migration `007`, tes `tests/salary.test.ts`.
- **V.1.7** — Bagian 8: Tim Produksi (Pengaturan → Tim berupa kartu avatar anggota, pilihan Tim di Pesanan Baru & Edit, tampil di Detail Pesanan, log perubahan tim), migration `006`, tes `tests/teams.test.ts`.
- **V.1.6** — Bagian 7: Dashboard ringkasan produksi, perbaikan hitungan Telat/Mepet (zona waktu), migration `005` (penjaga kolom `orders`, hapus log hanya supervisor), pembersihan import/variabel tak terpakai.
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

**Daftar pesanan (gaya Sablon):** `orders/OrderList.tsx` — Kanban desktop 4 kolom (Pesanan Masuk · Produksi · Finishing · Pengiriman, dengan penghitung), kartu + progress bar di HP, filter Semua/Proses/Telat/Kendala/Siap Kirim + bulan + jenis + pencarian, urut paling mendesak (telat → ≤3 hari → tanggal masuk), tombol Hapus (konfirmasi → Sampah). Kolom ditentukan `currentPhase()` (tahap aktif, `lib/steps.ts`), BUKAN `status`, jadi pesanan "Ada Kendala"/"Revisi" tetap di kolom tahap sebenarnya (Sablon memasukkannya ke On Process). "Siap Kirim" = status Kirim saja; pesanan Selesai ada di menu Pesanan Selesai (Bagian 3). Chip PIC/Helper Sablon tidak dibawa (Konveksi belum punya penanggung jawab per pesanan). Sejak V.1.7 pesanan punya **Tim** (tampil di Detail Pesanan, §19) tetapi belum ada chip tim di kartu daftar/Kanban.

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

**(Sudah diuji pemilik 18 Okt 2026 — daftar ini dipertahankan sebagai riwayat.)** Sebelumnya belum diuji dengan database sungguhan: migration `004` (grant & 3 policy), simpan/hapus catatan dari browser (RLS), rekap mingguan, dialog cetak
(terutama di Safari/HP), perilaku cascade saat Hapus Permanen pesanan yang punya catatan.

**Berikutnya:** Bagian 5 (Config Harga & Gaji) konsepnya sudah dijawab pemilik — lihat §17. Pemilik meminta kodenya dibuat **di akhir**; tanyakan urutan pengerjaan sebelum melanjutkan.


---

## 17. Keputusan pemilik: model gaji & penanggung jawab (18 Okt 2026) — dasar Bagian 5

**Jawaban pemilik:** alur gaji **sama seperti Sablon**. Penerima gaji ditentukan oleh **role user**: tim produksi (`produksi`),
tim QC (`qc`), dan admin (`admin`). Saat **pesanan dibuat**, diisi **PJ (penanggung jawab)** dan **tim produksinya**.
**Kodenya dibuat di akhir** (bukan sekarang) — jangan membangun field PJ atau perhitungan gaji sebelum diminta.

> **Pembaruan 18 Okt 2026 (V.1.7):** pemilik meminta bagian **tim** dikerjakan lebih dulu, terpisah dari gaji.
> Hasilnya (§19): tabel `teams` + `orders.team_id`, tim dibuat di Pengaturan → Tim, dipilih di form pesanan.
> Ini menggantikan rencana `helper_id` di bawah. **Yang masih belum dibuat:** PJ (`assigned_to`) di form pesanan, semua perhitungan gaji, dan pembagian PJ : tim.

**Cara kerja di Sablon (dibaca dari `SalaryView.tsx`, `FixedSalaryView.tsx`, `CreateOrder.tsx`, 18 Okt 2026):**
1. **Produksi (per pesanan):** kolom `orders.assigned_to` (PJ, wajib) dan `orders.helper_id` (Helper, opsional) diisi di form Pesanan Baru & Edit.
   Gaji muncul bila semua tahap produksi pesanan selesai. Tanpa Helper, PJ menerima seluruh nominal; dengan Helper, nominal dibagi
   (sistem lama 70% PJ : 30% Helper; sistem baru: upah dasar per profesi + bonus).
2. **Tim QC (tetap, bukan per pesanan):** semua user ber-role `qc` = anggota tim. Pool = total qty semua pesanan yang QC lolos + packing selesai
   × (tarif finishing + packing), **dibagi rata** ke seluruh anggota tim.
3. **Admin:** gaji bulanan (sejak V.1.10; mengikuti Sablon): gaji tetap + bonus closing pilihan (Rp X per closing + Rp Y per pcs di atas batas pcs; parameter di Config Harga) + bonus manual.
4. **Bulan gaji** = bulan tahap terakhir selesai (`completedAt`), bukan bulan pesanan dibuat. **Rate berhistori** (`pricing_configs`, INSERT baru tiap perubahan,
   dipilih menurut `effective_date` ≤ tanggal tahap selesai). Status **lunas** per orang per kategori per bulan (`salary_payments`), slip gaji bisa dicetak.

**Pemetaan ke Konveksi (asumsi saya — konfirmasi saat membangun):**
- Role: tidak perlu role baru (menjawab §11 no. 8). `lib/roles.ts` sudah punya `produksi`, `qc`, `admin`.
- ~~Kolom baru di `orders`: `helper_id` (tim produksi)~~ → **diganti `team_id`** (V.1.7, migration `006`, §19). Tersisa untuk Bagian 5: `assigned_to` (PJ) + isiannya di `CreateOrder`/`EditOrder`
  (kolom `assigned_to` sudah ada sejak `002` dan sudah dijaga trigger, tetapi belum dipakai UI), serta mengganti `step.doneBy` sebagai dasar gaji (keterbatasan di §14 terselesaikan lewat PJ + tim).
- ⚠️ **Sebelum membangun gaji, putuskan soal riwayat anggota tim** (§11 no. 11a): pesanan hanya menyimpan `team_id`, bukan daftar anggota saat itu. Kalau anggota tim diganti sesudah pesanan selesai,
  gaji yang dihitung dari `teams.member_ids` untuk pesanan lama ikut berubah. Pilihan: simpan salinan anggota (`team_member_ids`) di pesanan saat tahap produksi selesai.
- Dasar nominal produksi: **rate per item (jenis produksi)** dari `items` (§7 Bagian 5), bukan komposisi gesut Sablon. Cara membagi antara PJ dan tim → pertanyaan di bawah.
- Tim QC & admin: ikuti Sablon (poin 2–3), dengan basis qty = `jumlah` / total `items`.

**Pertanyaan yang harus dikonfirmasi sebelum membangun (jangan menebak):**
1. ~~**Tim produksi** satu orang atau beberapa orang per pesanan?~~ ✅ Beberapa orang, lewat Tim (§19). Satu pesanan = satu tim.
2. **Pembagian PJ : tim** — memakai 70% : 30% seperti sistem lama Sablon, atau persentase lain / upah dasar tetap per profesi?
3. **Admin** — bonus per closing + per pcs seperti Sablon? (PRD §13.2 awalnya menyebut gaji tetap & bonus "tidak dibawa"; keputusan ini perlu dipastikan.)
4. **Tahap yang dihargai** — apakah Potong Kain dan Jahit punya rate berbeda, dan siapa yang mengerjakan Potong (PJ/tim yang sama)?
5. Pesanan **non-utama** (Selempang, Permak) — apakah ikut dihitung gajinya, dan dengan rate apa (harga bervariasi per jahitan, §11 no. 7)?


---

## 18. Hasil Bagian 7 (V.1.6) — baca sebelum lanjut

**Urutan pengerjaan:** pemilik meminta bagian yang paling kecil dikerjakan dulu, dan Bagian 5 (gaji) diminta di akhir
(§17). Bagian 6 (Keuangan) tidak bisa dimulai karena bahan dari Sablon belum ada (lihat "Berikutnya"). Maka Bagian 7 dikerjakan lebih dulu.

**Yang ada:**
- **Dashboard** (`app/components/dashboard/Dashboard.tsx`) menggantikan kerangka kosong. Semua angka dihitung di browser dari
  `activeOrders` yang sudah dimuat `app/page.tsx` (tanpa query baru). Isi: 6 kartu angka (Berjalan · Telat · Mepet ·
  Kendala/Revisi · Siap Kirim · Selesai bulan ini), posisi pesanan per fase, daftar "Perlu perhatian" (klik → detail pesanan,
  tombol Kembali pulang ke Dashboard), pcs per jenis produksi, grafik 6 bulan (masuk vs selesai). Bila user tidak punya
  `orders.view`, Dashboard hanya menampilkan sapaan.
- **Logika murni** di `lib/dashboardStats.ts` (`computeSummary`, `phaseCounts`, `pcsByType`, `monthlySeries`, `attentionList`).
  Aturan "Telat" memakai `getDeadlineStatus` yang sama dengan Daftar Pesanan, jadi angkanya selalu cocok dengan filter "Telat" di sana.
- **Migration `005_rls_hardening.sql`** — lihat §10 dan komentar di file itu.
- **Pembersihan lint:** 4 import/variabel tak terpakai dihapus (`AnnouncementBanner`, `CustomAlert`, `ProfileModal`).

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. **Grafik pakai CSS biasa, bukan `recharts`** (PRD awal menyarankan recharts). Alasan: paket tidak bisa dipasang & diverifikasi di lingkungan
   pengerjaan, dan 2 grafik sederhana tidak sepadan dengan ±100 KB dependensi. Mudah diganti nanti bila ingin grafik yang lebih kaya.
2. **"Mepet" = deadline hari ini sampai 2 hari lagi** (aturan lama `getDeadlineStatus`), "Telat" = deadline sudah lewat dan status belum Kirim/Selesai.
3. **Pcs per jenis** dihitung dari `items`; pesanan utama yang belum Approval masuk baris "Belum Approval" memakai `jumlah` dari close order.
4. **"Selesai bulan ini"** = pesanan Selesai yang tahap terakhirnya selesai di bulan berjalan (`completionDate`, sama dengan Pesanan Selesai & dasar gaji).
5. Dashboard tidak punya filter/tanggal sendiri; "hari ini" mengikuti jam perangkat dan diperbarui tiap menit bila aplikasi dibiarkan terbuka.

**Bug yang ditemukan dan diperbaiki (penting, ada di kode lama sejak Bagian 1):**
`getDeadlineStatus` (dan perhitungan notifikasi di `orderLogic.ts`) membaca `"2026-10-17"` lewat `new Date(...)` — itu dibaca sebagai **UTC**,
lalu dibandingkan dengan tengah malam **lokal**. Di WIB akibatnya pesanan dengan deadline kemarin masih berstatus "Mepet" (baru "Telat" sehari kemudian)
dan jendela "Mepet" bergeser sehari. Perbaikan: `parseLocalDate()` & `daysUntil()` di `lib/utils.ts` (selisih hari kalender), dipakai
`getDeadlineStatus`, `orderLogic.ts`, `sortByUrgency` & filter bulan di `OrderList.tsx`, dan `monthKey` di `orderArchive.ts`.
**Efek yang akan terlihat pemilik:** jumlah pesanan "Telat" di Daftar Pesanan bisa bertambah (yang deadline-nya kemarin kini benar disebut Telat).
Aturan menulis tanggal baru: **jangan** bandingkan tanggal dengan `new Date("YYYY-MM-DD")`; pakai `parseLocalDate`/`daysUntil`.
(`formatDate` masih memakai `new Date(...)` untuk tampilan saja — aman di WIB, bisa bergeser di zona waktu barat; belum diubah.)

**Verifikasi:**
- `tests/dashboardStats.test.ts` — **12 uji lulus** di zona waktu Asia/Jakarta, UTC, America/New_York, dan Pacific/Auckland
  (hitungan telat/mepet, fase, pcs per jenis, grafik lintas tahun, urutan "perlu perhatian", `monthKey`).
  Jalankan: `npx tsx tests/dashboardStats.test.ts`.
- Cek tipe file yang diubah dengan stub (lingkungan pengerjaan tanpa internet, jadi `npm install`/`next build`/`eslint` **tidak** bisa dijalankan):
  tidak ada galat nyata. **Jalankan `npm install && npx tsc --noEmit && npm run build && npm run lint` di komputer Anda sebelum deploy.**
  Ikon `lucide-react` yang dipakai Dashboard (`AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Clock, Package, Truck`) dan tipe `LucideIcon`
  belum diperiksa terhadap paket aslinya.
- **Migration `005` TIDAK bisa dijalankan di lingkungan pengerjaan (tidak ada Postgres)** — hanya dibaca ulang manual. Jalankan dulu di
  database uji / di luar jam kerja.

**Belum diuji dengan database/browser sungguhan — uji ini sebelum dianggap beres:**
1. Jalankan `005` di SQL Editor (harus "Success", tanpa galat sintaks).
2. Sebagai **supervisor**: semua alur Bagian 2 masih jalan (buat pesanan, Approval, Potong, Jahit, QC lolos & gagal → revisi, Kirim, Terima, kendala, edit, hapus ke Sampah, pulihkan, hapus permanen).
3. Sebagai user **produksi** (punya `produksi.create/edit`, tanpa `orders.edit`): selesaikan Potong/Jahit, buat Approval, lapor kendala — harus BERHASIL.
   Mencoba mengubah deadline/nama pemesan (Edit Pesanan) — harus DITOLAK ("Tidak punya izin…").
4. Sebagai user **qc** (hanya `finishing.edit`): QC, Packing, Kirim, Terima — BERHASIL; membuat Approval — ditolak.
5. (Opsional, lewat konsol/API langsung — UI memang tidak punya tombol hapus log) Sebagai user non-supervisor, `delete` pada `order_logs` harus ditolak.
6. Buat pesanan baru dari akun non-supervisor yang punya `orders.create` — harus tetap bisa (policy kini mewajibkan `created_by = auth.uid()`).
7. Hapus akun user yang pernah membuat pesanan (Pengaturan → Pengguna) — harus tetap bisa (aturan `created_by` boleh jadi NULL dibuat justru untuk ini).
8. Dashboard di browser: angka cocok dengan Daftar Pesanan (filter Telat/Kendala/Siap Kirim), mode gelap, tampilan HP, klik item "Perlu perhatian" lalu Kembali.

**Sisa pengetatan yang SENGAJA belum dikerjakan (butuh keputusan/bagian lain):**
- Pemisahan per-**tahap** di trigger (mis. `produksi.edit` tidak boleh menyentuh tahap QC lewat API langsung). QC gagal harus membuka lagi
  Produksi Massal dalam satu update, jadi aturan per-tahap perlu didesain bersama Bagian 5.
- `order_logs.oleh` bisa dipalsukan pengirimnya (log ditulis dari browser); perlu RPC/API server bila log dipakai sebagai bukti audit uang.
- Policy storage bucket `production-proofs` (bersama Sablon; di luar migration Konveksi).
- `notifications` INSERT masih terbuka untuk staf karena `lib/notificationHelper.ts` masih menulis dari browser; pindahkan semuanya ke `/api/notify` lalu cabut policy itu.
- `eslint` belum bisa dijalankan; aturan `no-explicit-any` dan `react-hooks/exhaustive-deps` kemungkinan masih memberi peringatan (kode `any` ditoleransi, §3 no. 8).

**Berikutnya:**
- **Bagian 6 (Keuangan)** — butuh dari pemilik (hasil query di database Sablon, schema `monitoring_sablon`): definisi lengkap migration Sablon `001`–`009`
  (tabel `finance_*`, view `v_*`, fungsi `fin_*`, trigger penjaga) — zip Sablon yang dikirim hanya berisi `010`–`011`; isi `finance_accounts`,
  `finance_categories`, `finance_settings`; definisi `finance_expense_seq` dan indeks unik `finance_expenses(source, source_ref)`. Tanpa itu skema uang akan menebak-nebak. Juga konfirmasi §11 no. 9 (DP/lunas/invoice sama dengan Sablon?) dan no. 7.
- **Bagian 5 (Config Harga & Gaji)** — dikerjakan paling akhir atas permintaan pemilik; jawab dulu 5 pertanyaan di §17.
  `assigned_to` dan `team_id` sudah dijaga trigger (butuh `orders.edit`, `team_id` lewat `006`); tinggal tambahkan penjaga kolom gaji/harga.


---

## 19. Hasil Bagian 8 (V.1.7) — baca sebelum lanjut

**Permintaan pemilik (18 Okt 2026):** membuat tim dari user yang ada di Pengaturan → Pengguna, supaya saat input pesanan baru bisa memilih
timnya (konveksi punya tim sendiri-sendiri: tim jahit kaos, tim jahit seragam, dst.), ditampilkan sebagai **kartu berisi avatar** anggota.

**Yang ada:**
- **Pengaturan → Tim** (tab baru, ikon `UsersRound`, tampil untuk semua yang boleh membuka Pengaturan): `settings/tabs/TeamsTab.tsx`. Tiap tim = kartu
  (nama, deskripsi, deretan avatar anggota saling menumpuk maks. 8 lalu bulatan "+N", nama depan anggota, jumlah anggota). Tombol Ubah / Nonaktifkan / Hapus
  seperti Jenis Produksi. Form tim = modal: nama, deskripsi, dan daftar user dengan kotak cari + centang (avatar, nama, role).
- **Pilihan Tim di Pesanan Baru dan Edit Pesanan** (`orders/TeamPicker.tsx`): dropdown "Belum ditentukan" + tim aktif; setelah dipilih muncul pratinjau avatar & nama anggota.
  Di Edit, tim pesanan yang sekarang tetap muncul walau sudah dinonaktifkan (tidak hilang diam-diam).
- **Detail Pesanan:** baris "Tim pengerjaan" berisi nama tim + avatar anggota.
- **Log Aktivitas:** pesanan dibuat dengan tim → tercatat ("…dibuat, tim X"); tim diganti → "Tim: A → B" di log "Pesanan Diedit" (nama tim, bukan ID).
- **Komponen & logika:** `ui/TeamAvatars.tsx` (dipakai 3 tempat), `hooks/useTeams.ts` (pola `useProductionTypes`, tapi simpan mengembalikan true/false agar modal tak tertutup bila gagal,
  dan cek 0-baris akibat RLS), `lib/teams.ts` (validasi, ID yatim, label, inisial, terjemahan galat; murni & teruji), `types/team.ts`.
- **Migration `006_teams.sql`:** tabel `teams`, kolom `orders.team_id`, trigger keluarkan-user-dihapus-dari-tim, RLS, penjaga `guard_orders_update` diperbarui (§10), `notify pgrst, 'reload schema'`.

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. **Anggota = kolom `member_ids uuid[]`**, bukan tabel penghubung. Alasan: satu tim tersimpan dalam satu perintah (tidak mungkin nama tersimpan tapi anggota gagal) dan kode lebih sederhana.
   Konsekuensi: tidak ada foreign key → dijaga trigger saat user dihapus, dan tampilan melewati ID yang user-nya sudah tak ada (`teamMembers`). Bila nanti butuh laporan rumit, bisa dipindah ke tabel penghubung.
2. **Tim opsional** di pesanan (boleh "Belum ditentukan"), berlaku untuk pesanan **utama dan non-utama**. (PJ di Sablon wajib; PJ Konveksi belum dibangun.)
3. **Satu user boleh di banyak tim**, dan **semua user bisa jadi anggota** (tidak dibatasi role `produksi`) — user ber-role admin/QC pun bisa dipilih. Belum ada pembatasan karena pemilik belum menjawab (§11 no. 11b).
4. **Izin = modul `settings`** (§8), tanpa modul izin baru, supaya tidak perlu mengubah tabel hak akses. Baca daftar tim = semua staf.
5. **Menghapus tim tidak menghapus pesanan**; `team_id` jadi kosong dan tidak bisa dikembalikan. Karena itu tombol **Nonaktifkan** disarankan (kartu jadi redup, hilang dari pilihan form, pesanan lama tetap menampilkannya). Konfirmasi hapus sudah menjelaskan ini.
6. **Nama tim unik** (tanpa membedakan huruf besar/kecil & spasi ujung), maks. 60 karakter; deskripsi maks. 200. Aturan sama di aplikasi dan database.
7. **Pesanan hanya menyimpan `team_id`, tidak menyimpan salinan anggota.** Mengubah anggota tim mengubah tampilan di SEMUA pesanan yang memakai tim itu, termasuk pesanan lama/selesai. Aman untuk tampilan; **berbahaya untuk gaji** — lihat peringatan di §17.
8. **Kompatibel dengan database yang belum di-migrate:** `team_id` hanya dikirim bila diisi/diubah, jadi membuat pesanan tanpa tim tetap jalan sebelum `006` dijalankan. Tab Tim menampilkan pesan yang menunjuk file migration, dan tombol "+ Tim Baru" dinonaktifkan.
9. **Belum dikerjakan (sengaja, di luar permintaan):** chip tim di kartu daftar/Kanban, filter per tim, notifikasi ke anggota tim, tim di Dashboard/Kalender, pembatasan anggota per role.

**Verifikasi (dikerjakan di lingkungan dengan akses npm & PostgreSQL 16 lokal, 18 Okt 2026):**
- `npx tsc --noEmit` bersih. `npx eslint .`: jumlah masalah **sama persis sebelum dan sesudah** (85, semuanya lama — `any` yang ditoleransi §3 no. 8 dan satu `set-state-in-effect` di `app/page.tsx`); 7 file baru: 0 masalah.
- `tests/teams.test.ts`: **15 uji lulus** (`npx tsx tests/teams.test.ts`). Ditambah uji render server (SSR) `TeamsTab`, `TeamPicker`, `TeamAvatars` (kartu, "+N", ID user terhapus tidak dihitung, tim kosong/nonaktif, pesan migration) — uji sekali pakai, tidak disimpan.
- **Migration `001`–`006` dijalankan berurutan di PostgreSQL 16 (dengan stub `auth.uid()` dan role Supabase) tanpa galat**, `006` dijalankan ulang dua kali tanpa galat (idempotent). Ini juga satu-satunya pembuktian bahwa **`005` sintaksnya benar** — tetapi stub itu bukan Supabase asli.
- Perilaku database yang terbukti: user non-staff tidak bisa membaca tim; tanpa `settings.create/edit` tidak bisa tambah/ubah tim; nama kembar & nama kosong ditolak; user dengan `produksi.edit` tanpa `orders.edit` **ditolak** saat mengganti/mengosongkan `team_id` tetapi tetap bisa mengubah status (alur lama tidak rusak); admin dengan `orders.edit` bisa ganti tim; user dengan `settings.delete` tanpa `orders.edit` **berhasil menghapus tim yang dipakai pesanan** (pesanan tetap ada, `team_id` jadi NULL); menghapus user mengeluarkannya dari semua tim; supervisor lolos semua.
- **`next build` TIDAK dijalankan** (butuh Google Fonts, PRD §3 no. 7). Jalankan `npm install && npx tsc --noEmit && npm run build` di komputer Anda sebelum deploy. Catatan: `npm ci` (dipakai `Dockerfile`) gagal di npm 10.9.7 karena `package-lock.json` kurang `@opentelemetry/api`, `@emnapi/runtime`, `@emnapi/core` — sudah begitu sebelum Bagian 8 (zip tidak diubah lockfile-nya); karena deploy lama berhasil, kemungkinan versi npm di Docker Anda lebih toleran, tapi layak dicek.

**Belum diuji dengan Supabase/browser sungguhan — uji ini sebelum dianggap beres:**
1. Jalankan `006` di SQL Editor (harus "Success"). Bila Tab Tim masih bilang tabel belum terbaca, restart PostgREST (cache skema).
2. Pengaturan → Tim → **+ Tim Baru**: isi nama, centang beberapa user (termasuk yang punya foto & yang tidak), simpan → kartu muncul dengan avatar. Coba nama kembar (harus ditolak), ubah anggota, nonaktifkan, aktifkan.
3. **Pesanan baru** (utama dan non-utama) memilih tim → pratinjau avatar muncul → simpan → Detail Pesanan menampilkan tim. Coba tanpa tim (harus tetap bisa).
4. **Edit Pesanan:** ganti tim → Log Aktivitas mencatat "Tim: A → B". Nonaktifkan tim itu → buka Edit lagi: tim tetap terpilih, tidak hilang.
5. Sebagai **user produksi** (tanpa `orders.edit`): buka Detail Pesanan → tim terbaca; tombol Edit tidak ada. Sebagai user tanpa izin Pengaturan: menu Tim tidak terlihat.
6. **Hapus tim yang dipakai pesanan** → pesanan tetap ada, baris Tim jadi "Belum ditentukan". **Hapus user** yang jadi anggota → kartu tim menghitung ulang (anggota berkurang).
7. Tampilan HP & mode gelap: modal tim (daftar user bisa di-scroll), kartu tim, pratinjau di form pesanan.

**Berikutnya:** Bagian 5 (gaji) — jawab dulu pertanyaan di §17 **dan** §11 no. 11 (riwayat anggota tim). Opsional kecil: chip/filter tim di Daftar Pesanan.


---

## 20. Hasil Bagian 5 (V.1.8) — baca sebelum lanjut

**Urutan pengerjaan:** pemilik meminta "lanjutkan sesuai urutan PRD". Bagian 0–4, 7, 8 sudah selesai dan Bagian 6 terblokir (§18), jadi Bagian 5 dikerjakan. Lima pertanyaan §17 **belum dijawab**, maka tiap pilihan di bawah dibuat sebagai **asumsi bawaan yang bisa diubah dari menu Config Harga** (bukan konstanta di kode), kecuali yang ditandai "kode".

**Yang ada:**
- **Config Harga** (`apps/ConfigPriceView.tsx`, tab `config_harga`, ikon `Tags`): matriks jenis produksi × rate (Gaji PJ, Jahit/Produksi | QC, Packing; non-utama hanya Gaji PJ, Jahit & QC), 3 parameter bonus admin, tanggal "Berlaku mulai", riwayat 80 baris terakhir. Simpan = INSERT baris baru hanya untuk sel yang berubah; tanggal mundur meminta konfirmasi.
- **Gaji & Upah** (`apps/SalaryView.tsx`, tab `salary`, ikon `Wallet`): pilih bulan/tahun; kartu ringkasan; panel peringatan; tiga tab (Produksi · Tim QC · Admin) berisi daftar penerima + rincian per pesanan; tandai/batalkan lunas; cetak slip satu atau banyak (`lib/salaryPrint.tsx` + `SalaryPrintSlip.tsx`, dialog cetak → Simpan sebagai PDF, nama file `SLIP-GAJI-OKTOBER-2026-NAMA`).
- **PJ di form pesanan** (`orders/PJPicker.tsx`): Pesanan Baru, Edit Pesanan, Detail Pesanan, log "PJ: A → B".
- **Logika murni** `lib/salary.ts` (rate berhistori, kelayakan, pembagian, laporan bulanan, pesan galat) + **81 uji (+15 uji keuangan)** `tests/salary.test.ts` (lulus di Asia/Jakarta, UTC, America/New_York, Pacific/Auckland).
- **Migration `007`:** lihat §5 dan §10.

**Rumus (jawaban sementara atas §17):**
1. **Produksi (direvisi V.1.9):** ~~PJ 70% + sisanya rata~~ → **tidak ada pembagian persen**. Pcs tiap jenis dibagi **rata** ke semua orang (PJ + anggota tim selain PJ). Anggota digaji `pcs ÷ n × rate Jahit/Produksi`; PJ digaji `pcs ÷ n × rate Gaji PJ`. Layak bila **semua** tahap produksi (Potong Kain + Jahit; non-utama: Produksi) selesai; bulan gaji **dan** tanggal pemilihan rate = tanggal tahap produksi **terakhir** selesai. Tanpa tim → PJ menggarap semua pcs; tanpa PJ tapi ada tim → semua anggota memakai tarif anggota + peringatan; tanpa keduanya → tidak dibagikan & muncul peringatan. (§17 no. 2)
2. **Potong Kain tidak punya rate sendiri (direvisi V.1.9):** yang memotong kain adalah orang yang menjahit, jadi kolom rate Potong Kain di Config Harga **diganti Gaji PJ**. Tahap Potong Kain tetap harus selesai sebelum gaji muncul. (§17 no. 4)
3. **Tim QC:** pool = Σ item (`jumlah` × (rate QC + rate Packing)) untuk pesanan yang produksinya tuntas + QC lolos + Packing selesai (non-utama: tanpa Packing), dibagi **rata** ke semua user ber-role `qc`. Sisa Rupiah diputar per pesanan agar adil. Pool tanpa anggota QC tidak dihitung sebagai pengeluaran dan diberi peringatan.
4. **Admin (direvisi V.1.10):** ~~bonus otomatis ke pembuat pesanan~~ → **gaji bulanan**. SEMUA user ber-role `admin` selalu tampil di tab Admin tiap bulan (tak perlu closing). Gaji = **gaji tetap** (tabel `salary_fixed`, berhistori per tanggal berlaku, berlaku sampai diubah; acuan = hari terakhir bulan, jadi menaikkan gaji tidak mengubah bulan lalu) + **bonus closing** (`salary_closings`: pesanan yang dipilih manual; dihitung hanya bila pesanan tidak di Sampah, semua tahap selesai, dan selesai di bulan itu; `bonus_admin_closing` bawaan Rp10.000 + pcs di atas `batas_pcs_bonus_admin` bawaan 50 × `bonus_admin_per_pcs` bawaan Rp500; satu pesanan hanya untuk satu admin) + **bonus tambahan manual** (`salary_bonus_manual`). Pembayaran tetap `salary_payments` kategori `admin`. Designer (ada di Sablon) belum dimasukkan. (§17 no. 3)
5. **Non-utama** (Selempang, Permak) **ikut dihitung** dengan rate per jenisnya; rate kosong = Rp0 + peringatan, jadi tinggal tidak diisi bila tidak digaji. Harga permak yang bervariasi per jahitan **belum** dimodelkan (hanya rate per pcs). (§17 no. 5, §11 no. 7)
6. Semua nominal bulat Rupiah, metode sisa terbesar → jumlah bagian **selalu** = total (diuji).

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. **Riwayat anggota tim (§11 no. 11a) → disalin.** Trigger database menyalin PJ + anggota tim ke `orders.crew_snapshot` saat produksi selesai; mengubah tim di Pengaturan tidak menyentuh pesanan lama. Disalin ulang bila PJ/tim pesanan **sengaja** diganti lewat Edit Pesanan (koreksi sah, tercatat di log), tetapi **tidak** bila kosong akibat user/tim dihapus. QC gagal (produksi dibuka lagi) membuang salinan; produksi selesai ulang menyalin lagi. Pesanan lama diisi saat migration dengan tim **saat itu** (`backfill: true`).
2. **PJ wajib** di form Pesanan Baru dan Edit Pesanan (sejak V.1.9, sama dengan Sablon); tim tetap opsional. Pesanan lama tanpa PJ/tim tetap muncul di peringatan Gaji dengan tombol "Edit pesanan" — di sana PJ harus diisi. Penjagaan ada di form dan di `useOrders` (bukan di database, agar pesanan lama dan aturan "user dihapus → kosong" tidak rusak).
3. **Siapa boleh jadi PJ / anggota tim:** semua user (role `produksi` ditampilkan lebih dulu). (§11 no. 11b belum dijawab.)
4. **Anggota tim QC memakai role SEKARANG** (bukan salinan). Setelah ditandai lunas, jumlah yang dibayar **dibekukan** di `salary_payments`; bila hitungan berubah sesudahnya, layar menampilkan banner kuning "Angka berubah sejak ditandai lunas".
5. **Rate = Rupiah utuh** (tak ada pecahan), dijaga database. Koreksi salah ketik = simpan lagi di tanggal sama (id terbesar menang); baris lama tidak bisa dihapus dari aplikasi.
6. **Rate yang belum pernah diisi ≠ Rp0 yang disengaja**: yang pertama ditandai peringatan "Rate belum diatur", yang kedua tidak.
7. Tandai lunas **tidak** mencatat ke Keuangan (Bagian 6 belum ada). Saat Bagian 6 dibangun, sambungkan `mark_salary_paid` ke pencatatan biaya seperti `postSalaryToFinance` Sablon.
8. Slip memakai **nama pemesan** (bukan kode) sebagai judul baris, plus kode kecil di layar. Alamat slip disalin dari Sablon (`COMPANY` di `lib/config.ts`) — **periksa**.

**Keterbatasan diketahui:**
- Perhitungan gaji ada di browser dari data pesanan yang dimuat (semua pesanan, bukan hanya bulan itu); nyaman untuk skala sekarang. Ribuan pesanan → pindahkan ke fungsi database.
- Rate matriks tampil untuk jenis produksi **aktif** (atau nonaktif yang sudah punya rate). Jenis baru yang ditambah di Pengaturan otomatis muncul barisnya, rate kosong.
- `react-dom/server` dipakai di sisi browser untuk membuat HTML slip (pola Sablon); `next build` belum dijalankan.
- Tanpa notifikasi gaji, tanpa filter gaji per tim, tanpa chip PJ di kartu daftar/Kanban.

**Verifikasi (lingkungan pengerjaan tanpa internet & tanpa Postgres, 19 Okt 2026):**
- `npx tsx tests/salary.test.ts`: **81 uji (+15 uji keuangan) lulus** ×4 zona waktu; `tests/teams.test.ts`: 15 uji lulus.
- Cek tipe dengan stub modul pihak ketiga: **tidak ada galat nyata** di `lib/`, `types/`, `hooks/`, `SalaryView`, `ConfigPriceView`, `PJPicker`, `useOrders`, `page.tsx` (galat tersisa hanya artefak stub). **`npm install && npx tsc --noEmit && npm run build && npm run lint` wajib dijalankan di komputer Anda.** Ikon baru `Wallet`, `Tags`, `Printer`, `CheckSquare`, `Square`, `Undo2`, `ChevronLeft` belum diperiksa terhadap paket asli.
- **Migration `007` TIDAK dijalankan di mana pun** — hanya dibaca ulang manual (tidak ada parser SQL maupun Postgres). Risiko terbesar proyek ini ada di sini; jalankan dulu di database uji / di luar jam kerja (bagian 9 migration mengisi ulang `crew_snapshot` pesanan lama).

**Belum diuji — uji ini sebelum dianggap beres:**
1. Jalankan `007` di SQL Editor → "Success"; jalankan **dua kali** (harus tetap sukses, tidak menggandakan 4 parameter awal).
2. Beri akun admin izin **Config Harga (lihat+edit)** dan **Gaji & Upah (lihat+buat+edit)** di Pengaturan → Pengguna. Menu "Config Harga" & "Gaji & Upah" muncul; user tanpa izin tidak melihatnya.
3. Config Harga: isi rate untuk 1 jenis utama & 1 non-utama → Simpan → muncul di Riwayat. Ubah satu rate lagi → baris lama tetap ada. Coba tanggal mundur (harus minta konfirmasi). Coba persen PJ 150 (ditolak). Sebagai user tanpa edit: kolom terkunci.
4. Buat pesanan utama baru dengan **PJ + Tim**; selesaikan Approval, Potong, Jahit. Di Supabase: `select crew_snapshot from orders` → terisi PJ + anggota. Lalu **ubah anggota tim** di Pengaturan → `crew_snapshot` pesanan itu **tidak** berubah; menu Gaji tetap membagi ke anggota lama.
5. Gaji & Upah bulan ini: Produksi menampilkan PJ 70% / tim rata; hitung manual satu pesanan dan cocokkan. Selesaikan QC + Packing → Tim QC terisi, dibagi rata. Tab Admin: semua user ber-role Admin tampil; isi gaji tetap, pilih closing & isi bonus manual, cocokkan total.
6. Pesanan tanpa PJ/tim & pesanan dengan rate kosong muncul di panel peringatan; "Edit pesanan" membuka form lalu Kembali pulang ke Gaji.
7. QC gagal → pesanan hilang dari gaji produksi sampai Jahit diselesaikan lagi (`crew_snapshot` kosong lalu terisi lagi).
8. **Tandai lunas** → status Lunas & baris di `salary_audit_log`; tandai lagi dari tab lain (harus pesan "sudah ditandai lunas"); **Batalkan lunas** → hilang + log `BATAL_LUNAS`. Sebagai user tanpa `salary.edit`: tombol tidak ada, dan memanggil fungsinya langsung ditolak.
9. Ubah rate/PJ **setelah** lunas → banner "Angka berubah sejak ditandai lunas".
10. Cetak 1 slip & cetak banyak (dialog cetak → PDF; nama file benar, logo muncul, tanda tangan tidak terpotong) di Chrome desktop dan Safari/HP. Mode gelap & tampilan HP kedua menu (matriks Config Harga bisa digeser horizontal).
11. Sebagai user produksi (tanpa `orders.edit`): mengganti PJ pesanan lewat API langsung → ditolak; menyelesaikan tahap tetap bisa.

**Berikutnya:** Bagian 6 (Keuangan) — bahan Sablon yang dibutuhkan ada di §18 "Berikutnya". Sebelum itu, **konfirmasikan ke pemilik asumsi di atas** (terutama 70:30 PJ:tim, siapa yang memotong kain, bonus admin, dan non-utama ikut digaji).

### Revisi V.1.9 (19 Okt 2026) — jawaban pemilik atas 6 pertanyaan §20

| # | Jawaban pemilik | Penerapan |
|---|---|---|
| 1 | Tidak ada 70%/30%; tarif sama, PJ dibedakan sedikit; kolom rate Potong Kain di Config Harga diganti **Gaji PJ** | `lib/salary.ts` (`splitCrew`, `priceProduksi`), `ConfigPriceView`; parameter `pj_share_percent` dihapus dari UI |
| 2 | Gugur (sudah tercakup no. 1) | Rate Potong = 0 tidak perlu lagi |
| 3 | Bonus admin Rp10.000/closing + Rp500/pcs di atas 50 pcs | Angka tidak berubah; cara pemberian diganti di V.1.10 (lihat bawah) |
| 4 | Non-utama ikut digaji per jenis; rate kosong = Rp0 + peringatan | Tidak berubah (Gaji PJ & Jahit berlaku juga di non-utama) |
| 5 | PJ wajib | `PJPicker` (`required`), `CreateOrder`, `EditOrder`, `useOrders` |
| 6 | Tandai lunas belum mencatat ke Keuangan | Tidak berubah (menunggu Bagian 6) |

**Interpretasi yang saya pakai untuk no. 1 — konfirmasi ke pemilik:** "tarif yang sama" saya artikan *tarif per pcs*, dan **pcs pesanan dibagi rata ke semua orang di tim (PJ ikut dihitung)**, sehingga total gaji = pcs × tarif (bukan pcs × tarif × jumlah orang). Tarif Gaji PJ **menggantikan** tarif Jahit untuk PJ (bukan ditambahkan di atasnya). Bila maksud pemilik berbeda (mis. Gaji PJ = tambahan di atas tarif Jahit, atau tiap anggota digaji penuh per pcs), ubah hanya `splitCrew()` di `lib/salary.ts` dan tesnya.

**Data lama:** baris rate `…:potong_kain` dan `pj_share_percent` di `pricing_configs` tetap ada di riwayat tetapi **tidak dipakai**. Gaji bulan yang belum lunas akan memakai rumus baru; isi **Gaji PJ** untuk tiap jenis produksi dulu, kalau tidak PJ dihitung Rp0 dengan peringatan "Rate belum diatur". Gaji yang sudah ditandai lunas tidak berubah (nominalnya dibekukan), tetapi banner "Angka berubah sejak ditandai lunas" bisa muncul.

### Revisi V.1.10 (19 Okt 2026) — gaji Admin bulanan, mengikuti Sablon

Permintaan pemilik: gaji admin dibuat **sama seperti di Sablon** — semua user ber-role admin muncul di tab Admin dan **tidak harus close order**, karena gaji mereka bulanan.

| Hal | Sablon (`FixedSalaryView`) | Konveksi V.1.10 |
|---|---|---|
| Siapa muncul | role admin **dan designer** | semua role **admin** (designer belum — Konveksi belum membahasnya) |
| Gaji tetap | `salary_fixed`, bisa diubah di hari yang sama | `salary_fixed` **hanya ditambah** (id terbesar menang di tanggal sama), seperti `pricing_configs` |
| Bonus closing | pilih order selesai bulan itu | sama; satu pesanan hanya untuk satu admin (`unique(order_id)`) |
| Bonus tambahan | `salary_bonus_manual` | sama |
| Pembayaran | `salary_fixed_payments` + posting ke Keuangan | `salary_payments` kategori `admin` (sudah ada); posting ke Keuangan menunggu Bagian 6 |

**Perubahan perilaku:** pembuat pesanan ber-role admin **tidak lagi otomatis** dapat bonus; bonus hanya untuk pesanan yang dipilih sebagai closing. Pesanan yang sudah ditandai lunas di versi lama tidak terpengaruh nominalnya, tetapi banner "Angka berubah sejak ditandai lunas" bisa muncul.

**Migration `008_admin_salary.sql`** (belum dijalankan/diuji di Supabase): 3 tabel + RLS (`salary.view` baca, `salary.edit` tambah/hapus; gaji tetap tanpa update/delete). Kode: `lib/salary.ts` (`buildAdminSalary`, `fixedSalaryAt`, `closingCandidates`), `hooks/useAdminSalary.ts`, `AdminSalaryDetail.tsx`.

**Catatan:** perubahan gaji tetap/closing/bonus **setelah** ditandai lunas tidak diblokir; sistem menampilkan banner selisih. Ubah/hapus tidak masuk `salary_audit_log` (hanya tandai/batal lunas yang tercatat) — tambahkan bila pemilik ingin jejak audit.

## 21. Bagian 6 — Keuangan, dibangun BERTAHAP (mulai V.1.11)

Modul Keuangan Sablon sekitar **8.300 baris** (31 komponen, 25 API route, ~20 tabel/view/fungsi), terlalu besar untuk satu giliran. Maka dibagi **8 langkah**; tiap langkah harus selesai penuh (kode + `npx tsc --noEmit` + tes + changelog + tabel ini) dan **dijalankan/diuji pemilik** sebelum langkah berikutnya. Jangan loncat langkah.

### 21.1 Keadaan bahan dari Sablon (baca dulu)
- Zip Sablon terbaru berisi kode lengkap `app/components/finance/*`, `app/api/finance/*`, `lib/finance/*`, `hooks/useFinanceApi.ts`, tetapi **DDL-nya tetap tidak ada**: hanya `supabase/migrations/010_finance_salary_posting.sql` (+ `011`, `012` yang bukan keuangan). Definisi tabel `finance_*`, view `v_*`, fungsi `fin_*` (kecuali `fin_post_salary`/`fin_unpost_salary` di `010`), trigger penjaga, dan data seed **tidak ada**.
- Karena itu skema Konveksi **dirancang sendiri** dari: (a) tipe TypeScript `lib/finance/types.ts` Sablon, (b) nama & parameter pemanggilan `.rpc('fin_*')` di API route Sablon, (c) fungsi `010`. Nama tabel/kolom/fungsi sengaja dibuat **sama** dengan Sablon agar kode UI Sablon bisa disalin. Detail perilaku fungsi (mis. aturan verifikasi, kelebihan bayar, nomor `EXP-YYMM-nnnnn`) ditulis ulang oleh kita — bila perilaku Sablon berbeda, itu perbedaan sah yang perlu dikonfirmasi pemilik.
- **Seed (akun, kategori, pengaturan) = ASUMSI BAWAAN**, bukan salinan Sablon. Pemilik perlu menyesuaikan di Supabase.

### 21.2 Perbedaan Konveksi vs Sablon (berlaku semua langkah)
| Hal | Sablon | Konveksi |
|---|---|---|
| Role penuh | `super_admin` | `supervisor` (`resolveFinanceCaps`) |
| Dasar tagihan | harga dasar + biaya ukuran besar + biaya lengan panjang (`detail_ukuran`) | **baris item** `orders.items` (jenis × jumlah × harga per pcs) + diskon; rincian disimpan di `pricing_snapshot` (jsonb) |
| Jenis gaji ke Keuangan | `manual`, `qc`, `tetap` | `produksi`, `qc`, `admin` (kategori `salary_payments`) — dikerjakan di 6.8 |
| Schema database | `monitoring_sablon` | `monitoring_konveksi` |
| Akses tabel uang | service role lewat API | sama: **tanpa grant & policy untuk browser** |

### 21.3 Rencana langkah
| Langkah | Isi | Acuan Sablon | Status |
|---|---|---|---|
| **6.1** Fondasi | `finance_settings`, `finance_accounts`, `finance_categories`, `finance_audit_log` (append-only), `fin_audit()`, seed; `lib/finance/{caps,validate,server,types}.ts`, `GET /api/finance/meta`, `hooks/useFinanceApi.ts`, menu Keuangan versi awal; migration `009` | `lib/finance/caps.ts`, `server.ts`, `types.ts` | ✅ kode selesai, SQL diuji lokal; **belum dijalankan di Supabase** |
| **6.2** Tagihan | `order_invoices` (versi: terbit/revisi, `superseded`), `fin_issue_invoice`, view `v_order_finance` (status DIHITUNG database: Belum Ditagih/Belum Bayar/DP/Lunas/Kelebihan Bayar), `lib/finance/pricing.ts` versi item konveksi, `GET/POST /api/finance/invoices`, `GET /api/finance/orders/[orderId]`, tes hitung tagihan | `app/api/finance/invoices`, `orders/[orderId]`, `lib/finance/pricing.ts` | ✅ kode selesai, SQL diuji lokal; **belum dijalankan di Supabase** — rincian §21.5 |
| **6.3** Pembayaran | `order_payments` (DP/cicilan/pelunasan/refund; pending→verified/rejected/void), `fin_record_payment`, `fin_verify_payment`, `fin_void_payment`, bucket bukti `finance-proofs`, API `payments/*`, aturan pencatat ≠ pemverifikasi, kelebihan bayar, kunci kolom pembayaran di `orders` | `app/api/finance/payments/*`, `lib/finance/imageUtil.ts` | ✅ kode selesai (database & API), SQL diuji lokal; **belum dijalankan di Supabase** — rincian §21.6. `imageUtil.ts` Sablon ternyata hanya untuk gambar header/TTD invoice → ikut 6.7; kompres foto bukti memakai `browser-image-compression` langsung (§21.7) |
| **6.4** Layar Tagihan & Pembayaran | `FinanceModule` bertab, `InvoicesTab`, `PaymentsTab`, `OrderFinancePanel`, `RecordPaymentModal`, `InvoiceModal`, komponen UI bersama | `app/components/finance/*` (bagian ini) | ✅ kode selesai, **belum dilihat di browser / belum diuji di Supabase** — rincian §21.7 |
| **6.5** Pengeluaran | `finance_vendors`, `finance_expenses` (+ `finance_expense_seq`, unik `source,source_ref`), `fin_record_expense`, `fin_decide_expense`, `fin_void_expense`, API, `ExpensesTab`, form pengeluaran | `app/api/finance/expenses/*`, `vendors`, `expense-meta`, `ExpensesTab`, `RecordExpenseModal` | ⬜ |
| **6.6** Ringkasan, Laporan, Audit, Panduan | view `v_receivable_aging` / `v_cashbook` / `v_account_balances`, `overview`, `report`, `audit` API, `OverviewTab`, `ReportTab`, `AuditTab`, `GuideTab` + `todo` | `overview`, `report`, `audit`, `todo` routes + tab terkait | ⬜ |
| **6.7** Dokumen invoice | `invoice_settings`, `InvoiceDocument` (cetak/PDF), `InvoiceShareModal`, ekspor Excel + `export-log` | `invoiceDoc.ts`, `invoiceSettings.ts`, `InvoiceDocument/Modal/ShareModal`, `SettingsTab` | ⬜ |
| **6.8** Sambungan & penutup | `fin_post_salary`/`fin_unpost_salary` versi Konveksi + sambung tombol "Tandai lunas" di Gaji (PRD §20 butir 7), `finance_transfers`, `finance_periods` (tutup/buka periode), `fin_purge_order`, layar Pengaturan Keuangan (ubah `finance_settings`, akun, kategori) | `010_finance_salary_posting.sql`, `salary/post|unpost`, `lib/finance/salaryClient.ts`, `salaryGuard.ts`, `purge` | ⬜ |

### 21.4 Hasil langkah 6.1 (V.1.11)
- **Migration `009_finance_foundation.sql`** — 4 tabel + `fin_audit()` + seed. Browser (`anon`/`authenticated`) **tanpa akses apa pun** ke tabel ini; hanya `service_role` (server). Log audit: server hanya boleh `select`/`insert`; trigger menolak `update`/`delete`/`truncate` bahkan untuk pemilik tabel. `fin_audit()` hanya bisa dipanggil `service_role`. Aman dijalankan ulang.
- **Diuji di Postgres 16 lokal** (stub Supabase minimal: role `anon/authenticated/service_role`, `auth.uid()`), migration `001`–`009` berurutan tanpa galat, `009` dijalankan dua kali; juga **perilaku `008`** (belum pernah diuji sebelumnya): gaji tetap tak bisa diubah/dihapus, `created_by` tak bisa dipalsukan, user tanpa izin tak bisa menulis, closing unik per pesanan, hapus pesanan ikut menghapus closing. **Belum diuji di Supabase asli dan browser pemilik.**
- **Kode:** `lib/finance/validate.ts` (fungsi murni: `isUuid/isMoney/isDate/todayWib/sniffProof/parseSettings/finError`), `caps.ts` (`resolveFinanceCaps`, supervisor = penuh), `server.ts` (`requireFinance`, `finFail` — galat berawalan `FIN:` diteruskan 422, lainnya disamarkan 500, tabel hilang → 503 `MIGRATION_MISSING`), `types.ts`, `GET /api/finance/meta`, `hooks/useFinanceApi.ts`, `FinanceModule.tsx` (versi awal: daftar langkah, akun, kategori, pengaturan), menu **Keuangan** (muncul bila `keuangan.view`), `tests/finance.test.ts` (15 uji).
- **Yang perlu dilakukan pemilik sebelum 6.2:** (1) jalankan `009` di SQL Editor Supabase; (2) beri diri sendiri/staf izin **Keuangan → Lihat** di Pengaturan → Pengguna (supervisor otomatis); (3) buka menu Keuangan — harus muncul 2 akun, 6 kategori, 7 pengaturan; (4) sesuaikan akun/kategori/pengaturan (SQL Editor: tabel `finance_accounts`, `finance_categories`, `finance_settings`) — terutama **nama akun kas/bank yang sebenarnya**.
- **Pertanyaan untuk pemilik (jawab sebelum 6.2/6.3):** (a) apakah tagihan konveksi harga per pcs per jenis item, atau ada harga tetap per paket/seragam? (b) apakah DP wajib sebelum produksi dimulai, atau hanya dicatat? (c) apakah pencatat pembayaran dan pemverifikasi harus orang berbeda (`require_separate_verifier`)? (d) apakah ada lebih dari satu rekening/e-wallet?

### 21.5 Hasil langkah 6.2 (V.1.12) — Tagihan

**Asumsi bawaan yang dipakai** (empat pertanyaan di §21.4 belum dijawab pemilik; ubah bila jawabannya berbeda):
(a) tagihan = **harga per pcs untuk tiap baris item** (`orders.items`) − diskon, tanpa harga paket; (b) DP **tidak** wajib sebelum produksi (hanya dicatat di 6.3); (c) `require_separate_verifier` = `false`; (d) dua akun (KAS, BANK).

**Migration `010_finance_invoices.sql`** (butuh `009`):
- `order_invoices` — satu baris per versi tagihan. `pricing_snapshot` membekukan rincian `[{item_id, jenis_produksi, nama, jumlah, harga_per_pcs, subtotal}]`. Satu pesanan hanya boleh punya **satu** tagihan `active` (indeks unik parsial); `check (total = subtotal − discount)`. Trigger menolak hapus/truncate dan semua ubah kecuali `active → superseded` (tidak ada kolom lain yang boleh ikut berubah). Browser tanpa akses; server (`service_role`) hanya `select` — tulis hanya lewat fungsi.
- `fin_issue_invoice(p_order, p_actor, p_actor_name, p_prices jsonb, p_discount, p_reason, p_due_date)` — **total dihitung di database** dari `orders.items` (jumlah dibaca dari pesanan, bukan dari browser) × `p_prices` (`{id item: harga}`). Menolak: harga tidak ada/nol/pecahan/berupa teks; harga untuk item yang tidak ada (rincian pesanan berubah); diskon negatif atau ≥ subtotal; jatuh tempo sebelum tanggal masuk; pesanan tanpa item; **revisi tanpa alasan**. Revisi menaikkan `version`, menandai versi lama `superseded`, dan menulis audit `invoice.issue` / `invoice.revise` (sebelum/sesudah + alasan) dalam transaksi yang sama. Pesanan dikunci (`for update`) agar dua penerbitan bersamaan tidak menghasilkan dua tagihan aktif.
- `v_order_finance` — posisi keuangan per pesanan (tanpa pesanan di Sampah). `payment_status`: `Belum Ditagih` (tanpa tagihan aktif) / `Belum Bayar`. Kolom `paid_verified`, `paid_pending`, `overpaid` **sementara 0**; **langkah 6.3 menggantinya dengan `create or replace view`** (kolom, urutan, dan tipe harus tetap sama) supaya `DP`/`Lunas`/`Kelebihan Bayar` dihitung dari pembayaran.
- Penjaga hapus: trigger `trg_fin_block_order_delete` membuat **hapus permanen pesanan yang sudah ber-tagihan ditolak** dengan pesan yang bisa dibaca (Sampah tetap boleh). Pembersihan data keuangan pesanan (`fin_purge_order`) baru ada di 6.8.
- ~~Untuk 6.3: `fin_issue_invoice` perlu diganti…~~ **Sudah dikerjakan di `011`.**

**Kode:** `lib/finance/pricing.ts` (`calcInvoice`, `invoiceIsStale` — aturan sama dengan fungsi SQL; dipakai pratinjau form di 6.4 dan pemeriksaan awal API), tipe tagihan di `types.ts`, `GET/POST /api/finance/invoices` (POST: izin `keuangan.create`; ada pemeriksaan awal + konfirmasi `PCS_MISMATCH` bila jumlah pesanan ≠ Σ item; total yang dikembalikan = angka tersimpan di database), `GET /api/finance/orders/[orderId]` (posisi keuangan, riwayat tagihan, `invoice_stale`, `payments: []` sampai 6.3).

**Diuji di Postgres 16 lokal** (stub Supabase): `010` berjalan setelah `001`–`009` dan aman diulang; terbit (total Rp11.000.000 dari 100×85.000 + 50×60.000 − 500.000, cocok dengan `calcInvoice`); 12 jenis penolakan menghasilkan pesan `FIN:` yang benar; revisi menghasilkan versi 2 dan hanya satu tagihan aktif; audit mencatat sebelum/sesudah dan alasan; ubah/hapus/truncate tagihan ditolak; `authenticated` ditolak pada tabel, view, dan fungsi; hapus permanen pesanan ber-tagihan ditolak, tanpa tagihan lolos. `tests/finance.test.ts` = 24 uji. **Belum diuji di Supabase asli dan browser pemilik; layar belum ada (6.4).**

**Yang perlu dilakukan pemilik:** jalankan `010` di SQL Editor (setelah `009`). Layar baru muncul di 6.4, jadi pemeriksaan sementara lewat SQL Editor: `select * from monitoring_konveksi.v_order_finance limit 5;` — harus terbaca, semua `Belum Ditagih`.

### 21.6 Hasil langkah 6.3 (V.1.13) — Pembayaran

**Migration `011_finance_payments.sql`** (butuh `010`; aman diulang; diuji dua kali berturut-turut):
- `order_payments` — satu baris per transaksi: `kind` (`dp`/`cicilan`/`pelunasan`/`refund`), `amount`, `paid_at`, `method` (`transfer`/`tunai`/`qris`/`lainnya`), `account_id`, referensi, nama pembayar, catatan, `proof_path`, `status` (`pending`→`verified`/`rejected`, lalu `pending`/`verified`→`void`) beserta siapa/kapan/mengapa tiap perubahan. `check` memastikan status `verified`/`rejected`/`void` selalu punya bukti prosesnya. **Trigger penjaga:** tidak bisa dihapus/truncate; yang boleh berubah hanya kolom proses dan hanya lewat alur status yang sah; transaksi `rejected`/`void` sudah final. Browser tanpa akses; server hanya `select`.
- `fin_record_payment` — aturan: pesanan harus **sudah punya tagihan aktif**; nominal 1…Rp100 miliar; akun harus aktif; tanggal bayar tidak boleh di masa depan (WIB); **bukti wajib untuk non-tunai** bila `require_proof_non_cash`; path bukti harus berawalan id pesanan itu; **tidak boleh melebihi sisa tagihan** (terverifikasi + menunggu) kecuali `allow_overpayment`; **jenis ditentukan database** dari sisa tagihan (DP bila pertama, cicilan, pelunasan bila menutup sisa) — klien hanya boleh mengirim `refund`; **refund ≤ uang terverifikasi yang tersisa** dan **tidak pernah auto-verifikasi**. Pesanan dikunci (`for update`) sehingga dua pencatatan bersamaan tak bisa sama-sama lolos cek kelebihan.
- `fin_verify_payment` — hanya dari `pending`; tolak **wajib beralasan**; bila `require_separate_verifier` aktif, pencatat tidak boleh memverifikasi miliknya sendiri (**supervisor dikecualikan**, mengikuti parameter `p_is_super_admin` di Sablon — konfirmasi ke pemilik bila ingin tanpa pengecualian); **pemeriksaan ulang saat verifikasi** (tagihan mungkin sudah direvisi turun atau pembayaran lain sudah terverifikasi) sehingga total terverifikasi tak pernah melewati tagihan.
- `fin_void_payment` — alasan wajib (≥ 3 karakter); hanya `pending`/`verified`.
- `v_order_finance` **diganti** (kolom/urutan/tipe sama dengan `010`): `paid_verified` = Σ terverifikasi (refund mengurangi), `paid_pending`, `balance`, `overpaid`, dan status `Belum Bayar` / `DP` / `Lunas` / `Kelebihan Bayar` dihitung di sini.
- `fin_issue_invoice` **diganti**: revisi tagihan **tidak boleh menurunkan total di bawah uang terverifikasi** (kecuali `allow_overpayment`).
- Pembantu `fin_setting_bool`, `fin_rp`; bucket privat **`finance-proofs`** (4 MB; JPG/PNG/WEBP/PDF; tanpa policy → hanya server) — dibuat otomatis bila skema `storage` ada.

**Kode:** `lib/finance/payments.ts` (`parsePaymentFields`, `toPaymentRow` — **path bukti tak pernah dikirim ke browser**, hanya `has_proof`), `paymentsDb.ts` (nama akun & pesanan tanpa embed PostgREST), API `GET/POST /api/finance/payments` (POST multipart + unggah bukti; file dibersihkan bila pencatatan ditolak; sniff tipe file dari isinya, bukan ekstensi), `POST …/[id]/verify` (izin `edit`), `POST …/[id]/void` (izin `delete`), `GET …/[id]/proof` (signed URL 60 detik), dan `GET /api/finance/orders/[orderId]` kini menyertakan `payments`.

**Diuji di Postgres 16 lokal** (stub Supabase + stub `storage.buckets`): 16 kelompok skenario — catat tunai (jenis `dp`), 10 jenis penolakan catat dengan pesan `FIN:` yang benar, transfer + bukti, verifikasi/tolak/ulang, pencatat ≠ pemverifikasi (non-supervisor ditolak, supervisor lolos), pelunasan → `Lunas`, refund (melebihi ditolak, tak pernah auto-verifikasi, status kembali `DP`), revisi tagihan di bawah uang terverifikasi ditolak (naik boleh), void (alasan wajib, ulang & void-yang-ditolak ditolak), penjaga tabel (ubah nominal/status mundur/catatan/hapus/truncate ditolak), auto-verifikasi (hanya bila pengaturan menyala dan tanpa separate-verifier), pemeriksaan ulang saat verifikasi, `authenticated` ditolak di tabel dan semua fungsi, jejak audit lengkap (`payment.record/verify/reject/void`), hapus pesanan ber-pembayaran ditolak, akun nonaktif ditolak. `tests/finance.test.ts` = 31 uji. **Belum diuji di Supabase asli (termasuk unggah ke storage dan signed URL) dan browser pemilik; layar belum ada (6.4).**

**Belum ada (sengaja):** penguncian periode (tidak bisa verifikasi/void di bulan yang sudah ditutup) → 6.8; daftar antrean verifikasi & layar → 6.4–6.6.

**Yang perlu dilakukan pemilik:** jalankan `011` di SQL Editor (setelah `010`), lalu cek bucket **Storage → `finance-proofs`** ada dan berstatus *private*. Pemeriksaan sementara lewat SQL Editor: `select payment_status, count(*) from monitoring_konveksi.v_order_finance group by 1;`.

### 21.7 Hasil langkah 6.4 (V.1.14) — Layar Tagihan & Pembayaran

**Yang ada** (semua di `app/components/finance/`, kecuali dicatat lain):
- **`FinanceModule`** (diganti total) — tab: **Tagihan**, **Transaksi**, **Verifikasi** (hanya `keuangan.edit`, lencana = jumlah pembayaran menunggu), **Akun & Pengaturan** (isi lama 6.1, hanya baca, pindah ke `tabs/InfoTab.tsx`). Menerima prop `productionTypes` dari `app/page.tsx`. Hak diambil dari `meta.caps` (server). Tombol "Muat ulang" + panah kiri/kanan antar-tab.
- **`tabs/InvoicesTab`** — daftar `v_order_finance`: tagihan · terbayar · sisa · status, filter status (dengan hitungan), cari kode/pemesan, total di atas daftar, penanda **Lewat jatuh tempo**, tampil bertahap 30 baris (`usePagedList`). Tombol: *Rincian* (modal `OrderFinancePanel`), *Terbitkan* (pesanan belum ditagih; langsung membuka form tagihan), *Catat bayar* (ada tagihan dan sisa − menunggu > 0).
- **`tabs/PaymentsTab`** — satu komponen, dua mode: `all` (buku transaksi, filter status + tanggal, default awal bulan–hari ini, total kas masuk bersih) dan `pending` (antrean verifikasi, yang paling lama menunggu di atas).
- **`OrderFinancePanel`** — posisi keuangan satu pesanan: tiga angka, bar progres, rincian tagihan aktif per item, banner bila tagihan **sudah tidak sesuai item pesanan** (`invoice_stale`), riwayat versi tagihan, riwayat pembayaran. Juga **disematkan di Detail Pesanan** lewat `OrderFinanceSection.tsx` (hanya dirender bila `can(user, "keuangan", "view")`, jadi staf lain tidak memicu request).
- **`InvoiceModal`** — beda dengan Sablon: satu baris per **item pesanan** (jenis · pcs · harga per pcs · subtotal) + diskon + jatuh tempo (opsional, tidak boleh sebelum tanggal masuk); revisi wajib alasan; pratinjau total memakai `calcInvoice()` yang sama dengan SQL. Revisi mengisi otomatis harga lama untuk item yang masih ada; item baru harus diisi. Konfirmasi `PCS_MISMATCH` seperti Sablon. Pesanan tanpa item (utama belum Approval) → pesan "belum bisa ditagih", tanpa form.
- **`RecordPaymentModal`** — nominal bawaan = sisa − menunggu verifikasi; metode; akun (bawaan: tunai → akun kas, selain itu → bank/e-wallet); tanggal (tidak boleh di masa depan); referensi; pengirim; bukti (foto dikompres di browser, PDF apa adanya, maks 4 MB); catatan. **Jenis DP/cicilan/pelunasan tidak dipilih** (ditentukan database; ada keterangannya). Kotak refund hanya untuk `keuangan.edit`.
- **`PaymentRow` + `PaymentActions`** — satu baris transaksi (status, siapa mencatat/memverifikasi, referensi, alasan tolak/void), tombol Lihat bukti (signed URL 60 detik; tab dibuka dulu agar tidak diblokir popup blocker), Verifikasi, Tolak, Void; dialog alasan minimal 3 karakter.
- **Bersama:** `ui.tsx` (modal, field, tombol, filter), `StatusBadge`, `CurrencyInput` (maks 12 digit), `utils.ts` (rupiah & tanggal lokal — tanpa `new Date("YYYY-MM-DD")`, ikut aturan §18).
- **`lib/finance/view.ts`** (baru, murni, teruji) — `filterFinanceRows`, `countByFilter`, `totalsOf`, `isOverdue`, `initialPrices`, `netVerified`, `paymentFormState`. Hanya bantuan tampilan; **angka resmi & aturan uang tetap di database**.
- **API:** satu perubahan — `GET /api/finance/meta` kini mengembalikan `pending_count` (hitungan `order_payments` berstatus `pending`; `FinanceMeta.pending_count` di `types.ts`). Tidak ada migration baru.

**Keputusan yang saya ambil (ubah bila pemilik tidak setuju):**
1. **Tab "Transaksi" dan "Verifikasi" memakai satu komponen** (`PaymentsTab mode=...`), mengikuti Sablon. Tab Verifikasi hanya tampil bagi `keuangan.edit`.
2. **Batas nominal di form = sisa tagihan − pembayaran yang menunggu verifikasi** (database menghitung keduanya sebagai "sudah terikat"). Bila sisa sudah tertutup oleh yang menunggu, form menjelaskan dan tombol Simpan mati. **Refund dibatasi uang terverifikasi, tidak ikut pengaturan "boleh kelebihan bayar"** (sama dengan `fin_record_payment`). Refund yang masih menunggu juga mengurangi batas di database tetapi tidak terlihat di UI — database yang menolak bila lewat.
3. **Jatuh tempo opsional; kosong = tanpa jatuh tempo** (Sablon: bawaan 14 hari dari pengaturan). Lencana "Lewat jatuh tempo" hanya muncul bila tanggal diisi.
4. **Alasan tolak/void minimal 3 karakter** (Sablon 5) karena batas di database `fin_void_payment` memang 3.
5. **Ekspor Excel, tombol Invoice/Bagikan, dan `export-log` TIDAK dibawa** — itu langkah 6.7. Tab Ringkasan, Pengeluaran, Laporan, Audit, Panduan, Pengaturan belum ada (6.5–6.8).
6. **Kompres foto bukti memakai `browser-image-compression` langsung** (paket sudah ada di `package.json`), bukan `imageUtil.ts` — lihat koreksi di §21.3.
7. **Tab Akun & Pengaturan terlihat oleh semua yang punya `keuangan.view`** (sama dengan perilaku 6.1). Bila pengaturan sebaiknya hanya untuk supervisor, tambahkan `show: caps.isSupervisor` di `FinanceModule`.
8. **Kartu Harga & Pembayaran di Detail Pesanan** menambah dua request (`/api/finance/meta`, `/api/finance/orders/[id]`) untuk user ber-izin Keuangan. Menunggu keputusan pemilik apakah perlu di sana (mudah dicabut: hapus impor dan blok `OrderFinanceSection` di `OrderDetail.tsx`).

**Keterbatasan diketahui:**
- Daftar Tagihan memuat maksimal 2000 pesanan (batas API 6.2), Transaksi maksimal 1000 (pemberitahuan muncul bila tercapai). Cukup untuk skala sekarang; pindah ke paginasi server bila membesar.
- Tombol Esc menutup **semua** modal yang bertumpuk (mis. Rincian + form tagihan) sekaligus — sama dengan Sablon.
- Antrean Verifikasi dan lencana tidak otomatis menyegarkan diri; tombol "Muat ulang" atau perubahan data dari layar ini yang menyegarkan.
- Layar tidak menampilkan ringkasan per akun/saldo (6.6).

**Verifikasi (lingkungan pengerjaan tanpa internet, 20 Okt 2026):**
- `npx tsx tests/finance.test.ts`: **44 uji lulus** (31 lama + 13 baru: filter/hitung/total/jatuh tempo, harga awal revisi, aturan form pembayaran, kas masuk bersih) di **Asia/Jakarta, UTC, America/New_York, Pacific/Auckland**.
- Cek tipe dengan **stub** untuk `react`, `lucide-react`, `next/server`, `next/dynamic`, `@supabase/supabase-js`, `browser-image-compression`: **tidak ada galat** di `app/components/finance/*`, `lib/finance/*`, `hooks/useFinanceApi.ts`, `app/api/finance/*`, dan prop `FinanceModule` di `app/page.tsx`. Stub tidak memeriksa tipe DOM/React sungguhan (mis. tipe event handler) dan tidak menjangkau `OrderDetail.tsx` sepenuhnya. Semua ikon lucide yang dipakai juga dipakai Sablon (versi `lucide-react` sama), tetapi **`npx tsc --noEmit && npm run build && npm run lint` wajib dijalankan di komputer Anda**.
- **Tidak ada layar yang pernah dirender**, tidak ada request nyata ke API, dan **migration `009`–`011` belum dijalankan di Supabase pemilik** (hanya di Postgres lokal, §21.4–21.6).

**Belum diuji — uji ini sebelum lanjut ke 6.5:**
1. Jalankan `009`, `010`, `011` di SQL Editor Supabase (berurutan) bila belum. Cek bucket **Storage → `finance-proofs`** ada dan *private*.
2. Beri akun admin izin **Keuangan** (lihat + buat + edit; hapus untuk void) di Pengaturan → Pengguna. Menu Keuangan muncul; user tanpa izin tidak melihatnya. Tab **Verifikasi** hanya muncul bila ada `keuangan.edit`.
3. **Tagihan:** pesanan utama yang **belum Approval** → "Terbitkan" menampilkan pesan belum bisa ditagih. Pesanan yang sudah ber-item → isi harga tiap item → total di pratinjau **sama** dengan yang muncul setelah simpan. Coba diskon ≥ subtotal (ditolak), jatuh tempo sebelum tanggal masuk (ditolak), jumlah item ≠ jumlah pesanan (muncul konfirmasi).
4. **Revisi:** ubah item pesanan (Edit Pesanan) → buka Rincian → banner "tidak sesuai lagi" → Revisi: harga item lama terisi, item baru kosong; tanpa alasan tidak bisa disimpan; riwayat tagihan menampilkan v1 & v2.
5. **Pembayaran:** catat tunai (tanpa bukti), transfer **tanpa bukti** (harus tertahan), transfer dengan foto, dan PDF. Nominal melebihi sisa → tertahan. Cek status berubah sesuai: Belum Bayar → DP → Lunas; jenis DP/cicilan/pelunasan terisi otomatis.
6. **Verifikasi:** tab Verifikasi (lencana cocok) → verifikasi, tolak (tanpa alasan tidak bisa), void. Sisa & status di tab Tagihan ikut berubah. Dengan `require_separate_verifier` menyala (ubah di `finance_settings`): akun non-supervisor tidak bisa memverifikasi catatannya sendiri.
7. **Bukti:** "Lihat bukti" membuka foto/PDF di tab baru (dan **tidak** gagal diblokir popup di HP).
8. **Refund** (akun `keuangan.edit`): hanya muncul bila ada uang terverifikasi; melebihi → ditolak; tidak pernah langsung terverifikasi.
9. **Revisi tagihan di bawah uang terverifikasi** → ditolak dengan pesan database.
10. **Detail Pesanan:** kartu Harga & Pembayaran muncul hanya untuk user ber-izin Keuangan; sama dengan isi modal Rincian.
11. **Tampilan:** mode gelap, HP (modal naik dari bawah, daftar tidak melebar, tabel harga di form tagihan bisa dipakai di layar sempit), filter status bisa digeser.
12. Tutup dialog alasan dengan Esc saat form lain terbuka — pastikan perilaku bertumpuk bisa diterima.
