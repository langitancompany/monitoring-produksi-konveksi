# monitoring-produksi-konveksi

> **Mau melanjutkan pengembangan? Baca [`docs/PRD.md`](docs/PRD.md) dulu** — berisi status per bagian, model data, alur produksi, dan langkah berikutnya.

Kerangka aplikasi **produksi Konveksi** Langitan.co. Dibuat dari aplikasi
`monitoring-produksi-sablon` dengan mengambil hanya bagian yang **umum**
(login, pengguna & hak akses, profil, notifikasi, pengumuman, backup, tentang
app, pindah unit). Modul khusus sablon tidak dibawa.

Stack sama dengan aplikasi sablon: Next.js 16, React 19, Tailwind 4, Supabase
(self-hosted), Firebase Cloud Messaging.

---

## Isi

**Dibawa dari sablon**

| Bagian | File utama |
|---|---|
| Login | `app/components/auth/LoginScreen.tsx` (teks sudah versi konveksi) |
| Kerangka halaman | `app/page.tsx` (baru, ringkas), `Sidebar`, `Header` |
| Profil (nama, alamat, tgl lahir, **no WA**, foto) | `ProfileModal.tsx`, `hooks/useAuth.ts` |
| Pengaturan → Pengguna, Pengumuman, Notifikasi, Backup | `app/components/settings/*` |
| Hak akses per modul | `types/index.ts`, `PermissionTable.tsx` |
| Notifikasi (lonceng + push) | `hooks/useNotifications.ts`, `FCMManager.tsx`, `lib/notificationHelper.ts`, `/api/send-notification` |
| Pindah unit usaha untuk direksi | `UnitSwitcher.tsx`, `hooks/useUnitAccess.ts` (tampil di Header) |
| Tentang App (2 kolom + sosial media) | `AboutView.tsx`, `lib/changelog.ts` |
| Deploy | `Dockerfile`, `/api/health`, `/api/version`, `proxy.ts` |

**Tidak dibawa (khusus sablon):** pesanan/kaos/merchandise, Keuangan & invoice,
Gaji & gesut, PO Management, Kalkulator, Config Harga, Generator Nota, Kalender,
Log Aktivitas, Catatan Rapat, halaman `/tracking` & `/tv`, WhatsApp gateway,
cron overdue, `cleanup-storage`, dan skrip migrasi data.

---

## Menjalankan

```bash
npm install
cp .env.example .env.local     # isi nilainya
npm run dev
```

Saat `npm run dev` (localhost) cookie login otomatis tanpa `domain`/`secure`
supaya bisa login di komputer sendiri. Di production memakai
`.langitan.co` + `secure`.

### Environment variable

Lihat `.env.example`. Yang `NEXT_PUBLIC_*` ikut "tertanam" saat build, jadi di
Coolify isi sebagai **Build Variable** (bukan hanya Runtime).

| Variabel | Fungsi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Koneksi Supabase (sama dengan unit lain) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server saja: hapus user, backup, kirim push |
| `NEXT_PUBLIC_DB_SCHEMA` | Schema unit ini (`monitoring_konveksi`) |
| `NEXT_PUBLIC_UNIT_CODE` | Kode unit (`konveksi`) — samakan dengan `ALL_UNITS` & `direksi_access.unit_code` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.langitan.co` — **harus sama di semua unit** |
| `NEXT_PUBLIC_APP_URL` | URL publik app ini (link di notifikasi push) |
| `OTHER_UNIT_SCHEMAS` | Schema unit lain yang berbagi login (mis. `monitoring_sablon`) — mencegah akun login terhapus bila masih dipakai unit lain |
| `FIREBASE_*` | Firebase Admin untuk push |

Health check Coolify: `/api/health`. Dockerfile sama dengan sablon (standalone).

---

## Menyiapkan Supabase (WAJIB sebelum bisa login)

Aplikasi memakai **satu Supabase** dengan **schema terpisah per unit**
(`monitoring_konveksi`). Skema di bawah disusun dari skema ASLI Sablon, jadi
hak akses (RLS, fungsi, trigger) berperilaku sama.

1. Jalankan berurutan di SQL Editor Supabase:
   - `supabase/migrations/001_base_umum.sql` — users, notifikasi, token push, pengumuman, akses direksi, fungsi `has_perm`/`is_staff`, RLS, trigger penjaga.
   - `supabase/migrations/002_konveksi_core.sql` — jenis produksi (terisi 6 jenis utama + 2 non-utama), pesanan, log.
   - `supabase/migrations/003_calendar.sql` — agenda manual untuk menu Kalender (tabel `calendar_events`).
   - `supabase/migrations/004_production_notes.sql` — catatan produksi per pesanan untuk menu Catatan Rapat (tabel `production_notes`).
   - `supabase/migrations/005_rls_hardening.sql` — pengetatan hak akses tabel `orders` (penjaga per kolom) dan hapus log; tidak mengubah data.
   - `supabase/migrations/006_teams.sql` — tim produksi (tabel `teams`, kolom `orders.team_id`) untuk Pengaturan → Tim dan pilihan tim di form pesanan. Tidak mengubah data lama.
   - `supabase/migrations/007_pricing_salary.sql` — Config Harga & Gaji (tabel `pricing_configs`, `salary_payments`, `salary_audit_log`, kolom `orders.crew_snapshot`, fungsi tandai lunas). Mengisi salinan PJ/tim untuk pesanan yang produksinya sudah selesai. Jalankan di luar jam kerja.
   - `supabase/migrations/016_rename_supervisor_to_super_admin.sql` — mengganti role `supervisor` menjadi `super_admin` (data user, fungsi, policy RLS) agar sama dengan Sablon. Jalankan `supabase/optional/016_preview_supervisor_usage.sql` dulu (hanya membaca), backup, lalu jalankan 016 dan **segera deploy kode versi ini**. Dijalankan sekali; aman bila diulang.
2. **Expose schema** `monitoring_konveksi` di pengaturan API Supabase
   (`PGRST_DB_SCHEMAS` / Exposed schemas; di self-hosted: variabel PostgREST di Coolify)
   lalu restart PostgREST. Tanpa ini aplikasi tidak bisa membaca tabel.
3. **Realtime:** migration sudah mencoba mendaftarkan `notifications`,
   `announcements`, dan `orders` ke publication `supabase_realtime`. Pastikan
   service Realtime ikut mengenali schema baru.
4. **Storage:** foto profil memakai bucket `production-proofs` (folder
   `avatars/`) yang sudah ada dan dipakai Sablon. Policy bucket itu berlaku
   untuk seluruh bucket (semua user login boleh upload/baca/hapus), jadi file
   Konveksi nanti ditaruh di awalan `konveksi/` supaya tidak bercampur.
5. **Akun pertama (Super Admin).** Login memakai Supabase Auth yang sama dengan unit lain,
   tapi `users` tiap unit terpisah. Untuk pengguna pertama (yang belum bisa membuka
   Pengaturan): jalankan `supabase/optional/copy_users_from_sablon.sql` (ganti daftar id
   dengan akun Super Admin yang sudah ada di Sablon). Setelah itu semua user berikutnya
   dibuat dari **Pengaturan → Pengguna**.

### Mengelola user (API server)

Tambah, ubah, dan hapus user lewat **`/api/users`** (hanya admin & Super Admin) — akun
login Supabase Auth **dan** profil `users` dibuat dalam satu langkah. Aturannya:

- **Email Login** = `users.username`; tidak bisa diubah setelah dibuat. Password minimal 8 karakter.
- Email yang **sudah punya akun login di unit lain** (mis. Sablon) → akun ditautkan:
  hanya profil Konveksi yang dibuat, **password tidak diubah**.
- Password **tidak disimpan di tabel `users`** (kolom `password` tidak ada) dan tidak pernah dimuat ke browser.
- Hanya **Super Admin** yang boleh membuat/mengubah/menghapus akun atau role Super Admin;
  Super Admin terakhir tidak bisa diturunkan/dihapus; tidak bisa menghapus akun sendiri.
- Hapus user = hapus profil Konveksi + datanya (notifikasi, token push, akses direksi).
  Akun login **dihapus hanya bila tidak dipakai unit lain** (dicek lewat env `OTHER_UNIT_SCHEMAS`;
  bila tidak bisa dipastikan, akun dipertahankan).
- Izin dan role divalidasi di server (nilai selain `true/false` ditolak, key tak dikenal dibuang).

## Menambah modul baru (mis. Pesanan)

1. `types/index.ts` — modul sudah ada slot hak aksesnya (`orders`, `produksi`,
   `finishing`, `salary`, `keuangan`); hapus yang tidak perlu atau tambah baru.
2. `lib/tabs.ts` — tambah id tab.
3. `Sidebar.tsx` — tambah item menu (ada contoh di komentar).
4. `app/page.tsx` — render halamannya di bagian "Isi tab".
5. `Header.tsx` — tambah judul halaman di `pageTitles`.
6. `PermissionTable.tsx` — baris hak akses (sudah ada untuk modul di atas).

Tipe pesanan/produksi konveksi dibuat sendiri di `types/` — jangan menyalin
`Order` dari sablon (isinya DTF, gesut, merchandise).

---

## Yang berbeda dari aplikasi sablon (sengaja)

- **Satu sumber konfigurasi unit** — `lib/config.ts` (schema, kode unit, domain
  cookie, URL). Sablon men-hardcode `monitoring_sablon` di beberapa file.
- **Semua client Supabase lewat `createClient()`** (`lib/supabase/client.ts`):
  schema dan opsi cookie selalu sama. Di sablon, `page.tsx`, `LoginScreen`,
  `ProfileModal`, dan `AnnouncementBanner` membuat client sendiri-sendiri
  (sebagian tanpa schema atau tanpa sesi login).
- `ProfileModal` membuat client **sekali** (di sablon dibuat ulang tiap render).
- `proxy.ts` memakai opsi cookie yang sama dengan browser.
- Subscription **Realtime** memakai schema unit (`UNIT.dbSchema`); di sablon
  tertulis `schema: 'public'`.
- `resolvePermissions` digeneralisasi: tiap modul digabung dengan default-nya,
  jadi menambah modul tidak perlu mengedit blok panjang di `UsersTab`.
- Nomor WA ikut dimuat/disimpan di Edit Profil (perbaikan terbaru di sablon).

---

## Perlu dicek / diwaspadai

- **Belum diuji dengan Supabase sungguhan:** migration `001`/`002` dan `/api/users`
  baru lolos `tsc` dan `next build`. Uji dulu di database percobaan: buat user baru,
  tautkan user yang sudah ada di Sablon, ubah password, lalu hapus.
- **Firebase**: `lib/firebase.ts`, `FCMManager.tsx` (VAPID key), dan
  `public/firebase-messaging-sw.js` masih memakai project Firebase yang sama
  dengan sablon (satu project untuk semua unit). Ganti bila konveksi ingin
  project terpisah.
- **Notifikasi ke role lain** dari akun non-admin belum berfungsi penuh (pencarian
  penerima dari browser dibatasi RLS); diperbaiki di Bagian 2 (lihat `docs/PRD.md` §13.4).
- Skrip `npm run lint` melaporkan banyak `no-explicit-any` — sudah begitu juga
  di sablon; `tsc` dan `next build` bersih.
