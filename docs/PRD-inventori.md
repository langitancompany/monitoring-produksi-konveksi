# PRD — Stok Barang Jadi (Inventori) · Monitoring Produksi Konveksi

> Dokumen rancangan fitur. Letakkan di `docs/PRD-inventori.md`, berdampingan dengan `docs/PRD.md`.
> Pelanjut proyek (manusia atau AI): baca `docs/PRD.md` §3 (aturan), §10 (keamanan), dan §21 (pola Keuangan) dulu,
> karena fitur ini memakai pola yang sama: tulis lewat API server, aturan dijaga database, uji logika murni.

Dibuat: 7 November 2026 · Target versi: **V.1.24** · Migration berikutnya: **`024_inventory.sql`**
Status: **dibangun di kode (8 Nov 2026), belum diuji di database dan browser pemilik.** Lihat §19 untuk hasil pembangunan dan beda dari rancangan. Sebagian pernyataan tentang kode eksisting
diperiksa dari berkas yang ada (ditandai "terverifikasi"); sisanya ditandai "cek saat implementasi".

---

## 1. Ringkasan

Konveksi sering membuat **stok barang jadi** agar pesanan yang masuk bisa langsung mengambil dari stok tanpa
produksi dari awal. Fitur ini menambah **menu baru "Stok Barang Jadi"** dengan alur sebagai berikut:

1. Stok **bertambah hanya lewat pesanan produksi** di menu Pesanan, dengan memilih tujuan **"Produksi untuk stok"**.
2. Pesanan stok memakai tahap **lebih pendek**: berhenti di QC (tanpa Packing dan Pengiriman).
3. Begitu **QC lolos**, sistem otomatis membuat catatan **"menunggu verifikasi"** di menu Stok Barang Jadi.
4. **Petugas memverifikasi**: mencocokkan hasil produksi dengan hitungan fisik. Setelah diverifikasi, barulah
   **stok bertambah**. Stok tidak pernah bertambah otomatis tanpa verifikasi.

**Tujuan:** stok yang tercatat selalu sama dengan barang yang benar-benar ada, dan setiap tambahan stok bisa
ditelusuri ke pesanan produksinya, petugas yang memverifikasi, dan selisihnya bila ada.

---

## 2. Keputusan

| # | Keputusan | Sumber |
|---|---|---|
| K1 | Stok bertambah lewat pesanan baru dengan tujuan "stok" di menu Pesanan | Pemilik |
| K2 | Tahap pesanan stok dipangkas: yang semula berakhir di Pengiriman kini berakhir di **QC** | Pemilik |
| K3 | QC selesai → stok **otomatis tercatat sebagai menunggu verifikasi** di menu Inventori | Pemilik |
| K4 | Ada **form verifikasi** oleh petugas yang mencocokkan hasil produksi; stok baru bertambah setelah sesuai | Pemilik |
| K5 | Stok dicatat **mengikuti rincian pesanan**: jenis produksi + varian + warna + ukuran | Pemilik (7 Nov 2026) |
| K6 | **Stok awal kosong**; tidak ada impor atau input stok awal | Pemilik (7 Nov 2026) |
| K7 | Nama menu bebas dipilih pengembang → **"Stok Barang Jadi"** (id tab `inventori`) | Pemilik menyerahkan |
| A1 | **Packing ikut dihapus** dari tahap pesanan stok ("sampai QC saja"): Approval → Potong Kain → Produksi → QC | Asumsi, belum dikonfirmasi |
| A2 | Bila hitungan fisik ≠ hasil produksi, stok bertambah **sesuai hitungan fisik**; selisih wajib diberi alasan | Asumsi, belum dikonfirmasi |
| A3 | Izin modul baru `inventori` (Lihat, Verifikasi), terpisah dari Keuangan dan Pesanan | Asumsi, belum dikonfirmasi |
| A4 | Pesanan stok **tidak** ditagih (tidak muncul di tagihan Keuangan); upah produksi/QC tetap dibayar | Asumsi, belum dikonfirmasi |
| A5 | Pesanan stok tetap tampil di **Pesanan Utama** dengan lencana "STOK" | Asumsi, belum dikonfirmasi |

---

## 3. Di luar cakupan v1

Sengaja tidak dikerjakan sekarang, supaya v1 kecil dan benar:

- **Stok keluar** (pesanan pelanggan mengambil dari stok). Perlu rancangan sendiri; lihat §18 butir 2.
- **Koreksi / penyesuaian stok** (salah hitung, barang rusak, hilang). Lihat §18 butir 1.
- Stok awal (K6), nilai stok / HPP, harga, lokasi gudang, barcode, peringatan stok minimum.
- Stok untuk pesanan **Non-Utama** dan jenis **pesanan umum** (`is_custom`, yang punya nama model dan bagian sendiri).
  Pesanan stok hanya untuk kategori **utama** dan jenis non-custom.

---

## 4. Alur lengkap

```
Pesanan Baru  →  [Produksi untuk stok]  →  Approval  →  Potong Kain  →  Produksi  →  QC
                                                                                       │ lolos
                                                                                       ▼
                                                   catatan "Menunggu verifikasi" muncul otomatis
                                                                                       │
                                         Petugas mengisi hitungan fisik per varian/warna/ukuran
                                                                                       │
                                   cocok → stok bertambah    |    selisih → wajib alasan → stok bertambah sesuai hitungan
```

Catatan alur:

- **Approval tetap ada** pada pesanan stok. Di tahap inilah rincian (jenis, varian, warna, ukuran, jumlah) diisi,
  dan rincian itulah dasar stok (K5). Tampilan lembar Approval memakai nama "Produksi Stok", bukan nama pemesan.
- **QC gagal** (revisi) mengikuti alur biasa: tahap Produksi dibuka lagi. Catatan verifikasi baru dibuat saat QC **lolos**.
- Status pesanan stok menjadi **Selesai** otomatis begitu QC selesai, karena tidak ada tahap sesudahnya
  (`deriveStatus` menandai Selesai bila semua tahap selesai; terverifikasi di `lib/steps.ts`).

---

## 5. Aturan stok

### 5.1 Satuan stok (SKU)

Satu baris stok = kombinasi **jenis produksi + varian (model) + warna + ukuran**, mengikuti `ItemRincian` di
`types/order.ts`. Contoh: *Kaos Polo · Lengan Panjang · Abu-abu · L*.

Kunci `sku_key` dibentuk dari empat bagian itu, dipangkas spasinya, huruf kecil, digabung dengan `|`:
`kaos_polo|lengan panjang|abu-abu|l`.

- Tanda `|` dilarang di nilai varian/warna (diganti spasi saat membentuk kunci).
- Varian atau warna **"Lainnya"** memakai teks bebas (`varian_lain`, `warna_lain`); kunci memakai teks bebasnya.
  Label tampilan memakai `modelLabel` / `warnaLabel` dari `lib/orderItems.ts`.
- Jenis tanpa varian, warna, atau ukuran: bagian itu kosong. Jenis tanpa daftar ukuran memakai satu baris
  dengan `jumlah` total.

### 5.2 Baris yang diharapkan dari sebuah pesanan

Fungsi murni `expectedLines(order.items)`:

1. Untuk tiap `OrderItem`, untuk tiap `ItemRincian`, untuk tiap `UkuranQty` dengan `jumlah > 0`: satu baris.
2. Item tanpa `rincian`: satu baris memakai `item.jumlah`.
3. Baris dengan `sku_key` sama (mis. dari dua item) **digabung** dengan menjumlahkan `jumlah`.
4. Hasil diurutkan jenis → varian → warna → ukuran (urutan ukuran mengikuti daftar `ukuran` jenis tersebut).

### 5.3 Stok = jumlah semua pergerakan

Tidak ada kolom "saldo" yang diubah langsung. Saldo dihitung dari **buku besar** (`inventory_movements`, hanya
tambah baris, tidak pernah diubah atau dihapus). Ini menjaga jejak audit dan mencegah angka stok "berubah sendiri".

### 5.4 Aturan angka

- Semua jumlah bilangan bulat ≥ 0. Stok tidak boleh negatif (v1 tidak punya stok keluar, jadi tidak muncul).
- Hitungan fisik **boleh lebih besar** dari hasil produksi (dengan alasan), boleh **nol** (dengan alasan).

---

## 6. Perubahan di menu Pesanan

| Bagian | Perubahan |
|---|---|
| Model | Kolom baru `orders.tujuan` (`'pelanggan'` bawaan atau `'stok'`). **Tidak mengubah** `kategori`: pesanan stok bertipe `utama`. Alasan: `kategori` punya check constraint, tidak boleh berubah, dan dipakai di ±62 tempat |
| Form Pesanan Baru | Pada form Pesanan Utama ada pilihan **"Produksi untuk stok"**. Bila dipilih: `nama_pemesan` otomatis "Stok Gudang", kolom no. HP dan alamat disembunyikan, **PJ tetap wajib** (dasar gaji PJ), deadline tetap wajib sebagai target selesai |
| Template tahap | `lib/steps.ts` mendapat daftar tahap stok: `approval`, `potong_kain`, `produksi_massal`, `qc`. Fungsi yang membaca `kategori` untuk mencari tahap (`buildInitialSteps`, `sectionOf`, `deriveStatus`, `currentPhase`) perlu tahu `tujuan` |
| Daftar & detail | Lencana **STOK** di daftar pesanan, kalender, Pesanan Selesai, dan detail. Di detail, kartu "Status stok": *Menunggu verifikasi* / *Terverifikasi oleh X pada tanggal* dengan tautan ke menu Stok Barang Jadi |
| Edit pesanan | `tujuan` **tidak bisa diubah** setelah dibuat (dijaga trigger database, seperti `kategori`) |
| Jenis produksi | Jenis `is_custom` dan kategori non-utama **tidak ditawarkan** untuk pesanan stok |

---

## 7. Model data (migration `024_inventory.sql`)

Semua objek di schema `monitoring_konveksi`. Komentar SQL berbahasa Indonesia. Aman dijalankan ulang
(`if not exists`, `create or replace`, `drop trigger if exists`).

### 7.1 `orders.tujuan`

```sql
alter table monitoring_konveksi.orders
  add column if not exists tujuan text not null default 'pelanggan'
  check (tujuan in ('pelanggan', 'stok'));
```

Trigger terpisah `trg_orders_tujuan_immutable` menolak perubahan `tujuan`. Dibuat **terpisah** dari `guard_orders_update`
yang sudah didefinisikan ulang di beberapa migration (005, 006, 007, ...) agar tidak menimpa versi terbaru.

### 5.5 `inventory_receipts` — catatan hasil produksi stok

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid pk | |
| `order_id` | uuid **unique**, FK `orders` `on delete restrict` | satu pesanan stok = satu catatan |
| `kode_produksi` | text | salinan untuk tampilan |
| `status` | text | `pending` · `verified` · `cancelled` |
| `qc_done_at` | timestamptz | saat QC lolos |
| `lines` | jsonb | **snapshot saat verifikasi**: `[{sku_key, jenis_produksi, jenis_name, varian, warna, ukuran, expected, counted}]`; kosong selama `pending` |
| `total_expected`, `total_counted` | int | terisi saat verifikasi |
| `note` | text | alasan selisih |
| `verified_by`, `verified_by_name`, `verified_at` | uuid, text, timestamptz | |

### 7.3 `inventory_movements` — buku besar stok (hanya tambah)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid pk | |
| `created_at` | timestamptz | |
| `receipt_id` | uuid FK `inventory_receipts` | `unique (receipt_id, sku_key)` |
| `order_id`, `kode_produksi` | uuid, text | penelusuran ke pesanan (`order_id` FK `on delete restrict`) |
| `sku_key`, `jenis_produksi`, `jenis_name`, `varian`, `warna`, `ukuran` | text | `jenis_name` = salinan nama saat itu; varian/warna/ukuran bawaan `''` |
| `delta` | int | `check (delta <> 0)`; v1 hanya positif |
| `note` | text | |
| `by_id`, `by_name` | uuid, text | petugas |

Trigger menolak `UPDATE` dan `DELETE` pada tabel ini (buku besar tak boleh diubah).

### 7.4 `v_inventory_stock` — saldo per SKU

```sql
select sku_key, jenis_produksi, max(jenis_name) as jenis_name, varian, warna, ukuran,
       sum(delta)::int as qty, max(created_at) as last_in_at
from monitoring_konveksi.inventory_movements
group by sku_key, jenis_produksi, varian, warna, ukuran;
```

### 7.5 Trigger otomatis saat QC: `inv_on_order_qc`

`after update` pada `orders` dengan `when (old.steps is distinct from new.steps)`, hanya bila `new.tujuan = 'stok'`.
QC dianggap **lolos** bila tahap `qc` punya `isCompleted = true` dan `qc.passed = true` (cek saat implementasi: bentuk
persisnya di `hooks/useOrderDetail.ts`, handler `qc:pass` / `qc:fail`).

| Keadaan | Tindakan |
|---|---|
| QC lolos, belum ada catatan | buat `inventory_receipts` berstatus `pending` |
| QC lolos, catatan `cancelled` | ubah kembali ke `pending` |
| QC lolos, catatan `pending` atau `verified` | tidak berbuat apa-apa |
| QC tidak lolos / dibatalkan, catatan `pending` | ubah ke `cancelled` |
| QC tidak lolos / dibatalkan, catatan `verified` | **tolak** dengan `INV: Stok pesanan ini sudah diverifikasi, QC tidak bisa dibatalkan` |

Pembuatan lewat trigger, bukan kode klien, agar tetap benar untuk jalur apa pun yang mengubah pesanan.

### 7.6 Fungsi verifikasi: `inv_verify_receipt`

```
inv_verify_receipt(p_receipt uuid, p_actor uuid, p_actor_name text, p_lines jsonb, p_note text) returns jsonb
```

`security definer`, hanya `service_role` yang boleh `execute`. Langkah (satu transaksi):

1. Kunci baris catatan (`for update`). Bukan `pending` → `INV: Catatan ini sudah diverifikasi` / dibatalkan.
2. Validasi `p_lines`: tidak kosong; tiap baris punya `sku_key`, `expected` dan `counted` bilangan bulat ≥ 0.
3. Bila ada baris `counted <> expected`, `p_note` wajib (≥ 3 karakter): `INV: Alasan selisih wajib diisi`.
4. Sisipkan satu pergerakan untuk tiap baris dengan `counted > 0`.
5. Isi `lines`, total, `note`, `verified_*`, `status = 'verified'`.
6. Tulis satu baris `order_logs` (kategori `SISTEM`, mis. "Stok diverifikasi: 58 dari 60 pcs") agar tampil di Log Aktivitas.

Pesan galat berawalan `INV:` diteruskan ke pengguna, sama seperti `FIN:` di Keuangan (`finError` di `lib/finance/validate.ts`).

### 7.7 Akses

Mengikuti pola migration `009`: RLS aktif, **tanpa grant dan tanpa policy** untuk `anon`/`authenticated`; hanya
`service_role` yang membaca/menulis. Browser tidak pernah menyentuh tabel stok langsung.

---

## 8. Verifikasi

### 8.1 Aturan

- Hanya pemegang izin **Verifikasi** (atau Super Admin).
- Daftar baris verifikasi dihitung **server** dari `orders.items` saat catatan masih `pending` (selalu mengikuti
  rincian terbaru), dan dibekukan ke `lines` saat diverifikasi.
- Hasil produksi tiap baris **hanya-baca**; petugas hanya mengisi **hitungan fisik**.
- Kolom hitungan fisik **terisi awal sama dengan hasil produksi**, jadi bila cocok cukup satu klik.
- Selisih dihitung otomatis; bila ada, kolom Alasan wajib (A2).
- Sebelum menyimpan, tampil konfirmasi: *"Stok akan bertambah 58 pcs. Tindakan ini tidak dapat dibatalkan."*
  (v1 tidak punya koreksi, lihat §18 butir 1).
- Dua petugas membuka catatan yang sama: yang kedua mendapat "sudah diverifikasi" (kunci baris + cek status).

### 8.2 Contoh

Pesanan stok *Kaos Polo · Lengan Panjang · Abu-abu*: M 20, L 25, XL 15 (total 60). Petugas menghitung L = 23.
Selisih −2, alasan "2 pcs cacat jahitan, dipisah". Stok yang tercatat: M +20, L +23, XL +15 = 58.

---

## 9. API (`/api/inventori/*`, server memeriksa izin ke database)

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET /api/inventori/meta` | Lihat | izin pengguna, jumlah catatan menunggu (untuk lencana menu) |
| `GET /api/inventori/stock?jenis=&q=` | Lihat | saldo per SKU dari `v_inventory_stock`, plus total pcs |
| `GET /api/inventori/receipts?status=` | Lihat | daftar catatan (`pending`/`verified`/semua); pesanan di Sampah tidak ikut |
| `GET /api/inventori/receipts/[id]` | Lihat | satu catatan + baris (dihitung live bila `pending`, dari snapshot bila `verified`) |
| `POST /api/inventori/receipts/[id]/verify` | Verifikasi | body `{ lines: [{ sku_key, counted }], note }`; server menyusun `expected` sendiri dan **menolak `sku_key` yang tidak ada di hasil produksi** |
| `GET /api/inventori/movements?sku=&from=&to=` | Lihat | riwayat pergerakan |

Guard `requireInventori(req, "view" | "verify")` di `lib/inventory/server.ts`, bentuknya mengikuti `requireFinance`.
Nilai `expected` **tidak pernah diterima dari klien**.

---

## 10. Layar: menu "Stok Barang Jadi"

Tab id `inventori`; tambahkan di `lib/tabs.ts`, `Sidebar.tsx`, `Header.tsx` (judul), dan render di `app/page.tsx`.
Lencana menu = jumlah catatan menunggu verifikasi (hanya untuk pemegang izin Verifikasi).

Semua layar harus nyaman di **HP** (tim memakai ponsel): input angka memakai `inputMode="numeric"`, tombol besar.

### 10.1 Tab Stok
Daftar dikelompokkan per **jenis produksi**; tiap kelompok menampilkan baris varian · warna · ukuran dan jumlahnya,
plus subtotal. Pencarian dan filter jenis. Keadaan kosong: *"Belum ada stok. Stok bertambah setelah hasil produksi
stok diverifikasi."* (stok awal kosong, K6).

### 10.2 Tab Verifikasi
Daftar catatan menunggu: kode produksi, tanggal QC lolos, PJ, total pcs. Memilih satu membuka **form verifikasi**
(§8): tabel Varian · Warna · Ukuran · Hasil produksi · **Hitung fisik** · Selisih, kolom Alasan, tombol
**"Verifikasi & tambah stok"**.

### 10.3 Tab Riwayat
Pergerakan stok terbaru di atas: tanggal, SKU, `+jumlah`, sumber (kode produksi, tautan ke pesanan), petugas, alasan
selisih. Catatan dengan selisih diberi penanda.

---

## 11. Hak akses

Modul baru **`inventori`** di `types/index.ts` bertipe `ModuleViewEdit` (sudah ada, dipakai `config_harga`):

| Kolom | Arti |
|---|---|
| Lihat (`view`) | membuka menu, melihat stok, daftar verifikasi, dan riwayat |
| `edit` (label: "Verifikasi stok masuk") | mengisi dan menyimpan verifikasi |

Daftar yang disentuh: `DEFAULT_PERMISSIONS` (semua `false`), `MODULE_DEFS` di `lib/permissionModules.ts`,
`MODULE_LABEL` di `lib/permissionRules.ts`. Aturan eskalasi migration `019` berlaku otomatis (Admin hanya bisa
memberi izin yang ia sendiri punya; Super Admin bebas). Pembuat pesanan stok = siapa pun yang boleh membuat pesanan
(`orders.create`); tidak perlu izin inventori.

---

## 12. Dampak ke modul lain

| Modul | Dampak | Status pengecekan |
|---|---|---|
| **Gaji** | Tidak berubah. Upah produksi dihitung dari item × tarif; upah QC memakai syarat QC lolos dan Packing selesai **atau tidak ada** (`!packing \|\| packing.isCompleted`), jadi pesanan stok tanpa Packing tetap dibayarkan | Terverifikasi di `lib/salary.ts` (baris ±227–230); tetap perlu uji |
| **Keuangan: tagihan** | View `v_order_finance` membaca **semua** pesanan tak terhapus, sehingga pesanan stok akan tampil "Belum Ditagih". Wajib dikecualikan (`o.tujuan <> 'stok'`) | Terverifikasi (migration 010/011); definisi terbaru ada di 011, dan `fin_overview`/`fin_report` (013) membacanya: cek saat implementasi |
| **Keuangan: pengeluaran** | Pesanan stok **tetap bisa dipilih** sebagai tujuan biaya langsung (mis. beli kain untuk stok) | Perilaku bawaan; tidak perlu diubah |
| **Keuangan: laporan laba per pesanan** | Pesanan stok dikecualikan dari laba per pesanan (tidak ada pendapatan); biaya langsungnya tetap terlihat di Pengeluaran. Tidak ada HPP di v1 | Cek saat implementasi |
| **Dashboard** | Pesanan stok ikut hitungan produksi; tidak pernah masuk fase Pengiriman | Cek `lib/dashboardStats.ts` |
| **Kalender, Pesanan Selesai** | Tampil dengan lencana STOK | Cek saat implementasi |
| **Notifikasi** | Saat QC stok lolos, beri tahu pemegang izin Verifikasi dan Super Admin, mengikuti pola penerima yang dihitung di server | Cek `lib/notificationHelper.ts` |
| **Sampah** | Catatan `pending` milik pesanan yang masuk Sampah disembunyikan dari tab Verifikasi dan muncul lagi bila dipulihkan. Hapus permanen **ditolak** bila sudah ada pergerakan stok (FK `restrict`) | Perilaku rancangan |

---

## 13. Keamanan

- Semua tulis lewat API server (service role); fungsi `inv_verify_receipt` tidak bisa dipanggil klien.
- Izin diperiksa di server dari tabel `users`, bukan dari klien. Menyembunyikan tombol hanya kemudahan tampilan.
- `expected` disusun server dari `orders.items`; klien hanya mengirim `sku_key` + `counted` + alasan.
- Buku besar hanya-tambah (trigger menolak ubah/hapus). Tidak ada jalur biasa untuk mengurangi atau mengubah stok di v1.
- Verifikasi tercatat ke `order_logs` dan memuat nama petugas.
- Setiap pesan galat database yang berawalan `INV:` dianggap aman ditampilkan; galat lain disamarkan (pola `finFail`).

---

## 14. Kasus tepi

| Kasus | Perlakuan |
|---|---|
| QC lolos, lalu QC dibatalkan **sebelum** verifikasi | Catatan `cancelled`; QC lolos lagi → `pending` lagi |
| QC dibatalkan **setelah** verifikasi | Ditolak database (§7.5) |
| Rincian pesanan diedit setelah QC, sebelum verifikasi | Hasil produksi di form verifikasi ikut rincian terbaru (dihitung live) |
| Rincian diedit setelah verifikasi | Tidak memengaruhi stok (snapshot sudah dibekukan) |
| Pesanan dipindah ke Sampah saat `pending` | Disembunyikan; kembali saat dipulihkan |
| Hitungan fisik 0 untuk semua baris | Boleh, dengan alasan; status `verified`, tanpa pergerakan |
| Dua petugas verifikasi bersamaan | Yang kedua ditolak ("sudah diverifikasi") |
| Nama jenis produksi diganti | Riwayat tetap memakai `jenis_name` salinan; tampilan stok memakai nama terbaru bila ada |
| Item tanpa daftar ukuran | Satu baris SKU dengan ukuran kosong |
| Pesanan stok tanpa PJ | Tidak mungkin: form mewajibkan PJ |
| Varian/warna "Lainnya" diketik berbeda ejaan | Menjadi SKU terpisah (kunci memakai teks bebas); dicatat sebagai keterbatasan v1 |

---

## 15. Rencana pembangunan (bertahap, V.1.24)

Tiap langkah diakhiri uji, tanpa migration yang belum dijalankan menumpuk, dan ringkasan hasil ditambahkan ke
`docs/PRD.md` seperti bagian lain.

| Langkah | Isi | Berkas utama |
|---|---|---|
| **1. Fondasi** | Migration `024` (kolom `tujuan`, tabel, view, trigger, fungsi, akses); tipe `Order.tujuan`; template tahap stok; `buildInitialSteps` dan `deriveStatus` sadar `tujuan` | `supabase/migrations/024_inventory.sql`, `types/order.ts`, `lib/steps.ts` |
| **2. Pesanan stok** | Opsi "Produksi untuk stok" di form; `createOrder` mengirim `tujuan` dan `nama_pemesan` "Stok Gudang"; lencana STOK di daftar/detail/kalender/selesai; larangan ubah `tujuan` | `CreateOrder.tsx`, `hooks/useOrders.ts`, `OrderList.tsx`, `OrderDetail.tsx` |
| **3. Logika & API** | Fungsi murni `expectedLines`, `skuKey`, `validateVerification`; `requireInventori`; endpoint `/api/inventori/*` | `lib/inventory/*.ts`, `app/api/inventori/**` |
| **4. Menu & izin** | Modul `inventori`; tab Stok/Verifikasi/Riwayat; sidebar, header, page; lencana; notifikasi | `lib/tabs.ts`, `Sidebar.tsx`, `app/page.tsx`, `app/components/inventory/**`, `lib/permissionModules.ts` |
| **5. Penyesuaian modul lain** | Kecualikan pesanan stok dari tagihan dan laporan laba; periksa dashboard; changelog dan catatan PRD | migration (view keuangan), `lib/finance/**`, `lib/dashboardStats.ts`, `lib/changelog.ts` |

---

## 16. Rencana uji

### 16.1 Uji logika murni (`tests/inventory.test.ts`, dijalankan `npx tsx`)

- `expectedLines`: beberapa item dan rincian; penggabungan SKU yang sama; item tanpa rincian; "Lainnya"; jumlah 0 diabaikan; urutan ukuran.
- `skuKey`: normalisasi huruf, spasi, tanda `|`; label tidak memengaruhi kunci.
- `validateVerification`: hitungan negatif/pecahan/bukan angka ditolak; `sku_key` asing ditolak; selisih tanpa alasan ditolak; semua sama tanpa alasan diterima.
- Template stok: empat tahap; `deriveStatus` = Selesai begitu QC lolos; `currentPhase` tidak pernah "Kirim".
- Izin: modul `inventori` default mati; `grantModules` hanya menyalakan modul ini; aturan eskalasi Admin.

### 16.2 Uji manual di database (wajib, belum bisa dijalankan tanpa Supabase)

1. Buat pesanan stok → tahap hanya Approval/Potong/Produksi/QC; nama pemesan "Stok Gudang".
2. QC lolos → tepat satu catatan `pending`; QC diulang → tetap satu.
3. Batalkan QC saat `pending` → `cancelled`; lolos lagi → `pending`.
4. Verifikasi dengan selisih tanpa alasan → ditolak; dengan alasan → stok bertambah sesuai hitungan.
5. Batalkan QC setelah verifikasi → ditolak.
6. Coba `UPDATE`/`DELETE` pada `inventory_movements` → ditolak.
7. Akun tanpa izin memanggil `/api/inventori/*` → 403; panggil fungsi `inv_verify_receipt` dari browser → ditolak.
8. Pesanan stok **tidak** muncul di tab Tagihan Keuangan; tetap bisa dipilih di form Pengeluaran.
9. Gaji produksi dan QC pesanan stok tetap terhitung.
10. Coba ubah `tujuan` pesanan yang ada → ditolak.

---

## 17. Kriteria selesai

- Pesanan stok mengikuti alur §4 dan berstatus Selesai setelah QC.
- Stok **hanya** bertambah lewat verifikasi; tidak ada jalur otomatis tanpa verifikasi.
- Setiap tambahan stok bisa ditelusuri ke pesanan, petugas, waktu, dan selisih.
- Pesanan stok tidak mengotori tagihan dan laporan Keuangan; gaji tidak berubah.
- Semua uji §16.1 lulus; uji §16.2 dijalankan pemilik di Supabase sungguhan dan hasilnya dicatat di `docs/PRD.md`.
- `npm run build` bersih; versi dinaikkan ke V.1.24 dengan entri changelog.

---

## 18. Pertanyaan terbuka (tanyakan ke pemilik sebelum membangun bagian terkait)

1. **Koreksi stok.** Bila petugas salah memverifikasi, v1 tidak bisa memperbaikinya (buku besar hanya-tambah).
   Usul fase 2: "Penyesuaian stok" dengan alasan wajib, hanya Super Admin. Mau dimasukkan ke v1?
2. **Stok keluar.** Bagaimana pesanan pelanggan mengambil dari stok (fase 2)? Usul: di form Approval ada
   "ambil dari stok" per baris rincian, yang mengurangi stok saat pesanan disetujui. Perlu PRD sendiri.
3. **Petugas verifikasi sama dengan petugas QC?** Usul: boleh (tim kecil), tercatat; bisa dijadikan pengaturan nanti.
4. **Tampilan pesanan stok.** Tetap di Pesanan Utama dengan lencana (A5), atau menu "Pesanan Stok" sendiri?
5. **Tolak hasil produksi.** Bila selisih sangat besar, perlukah tombol "kembalikan ke produksi"? v1 hanya menerima dengan alasan.
6. **Konfirmasi A1–A5** di §2, terutama A1 (Packing ikut dihapus) dan A2 (stok mengikuti hitungan fisik).

---

## 19. Hasil pembangunan (V.1.24, 8 Nov 2026)

Langkah 1–5 §15 dikerjakan sekaligus. Cek tipe (`npx tsc --noEmit`) bersih; `npx tsx tests/inventory.test.ts` lulus (18 uji, mencakup §16.1).
**Belum dijalankan:** migration `024`, uji manual §16.2 (butuh Supabase), `npm run build` (butuh Google Fonts), tampilan di browser.

Berkas baru: `supabase/migrations/024_inventory.sql`, `lib/inventory/{types,sku,validate,caps,server}.ts`, `app/api/inventori/**`,
`app/components/inventory/*` (InventoryModule, StockTab, VerifyTab, VerifyForm, HistoryTab, StokBadge, StokStatusCard),
`hooks/useInventoryApi.ts`, `tests/inventory.test.ts`.

Beda dari rancangan (disengaja):
- `v_inventory_stock` dikelompokkan per `sku_key` saja (label diambil dari pergerakan terbaru), supaya ejaan label yang berbeda untuk kunci yang sama tidak memecah baris.
- Catatan `pending` milik pesanan di Sampah disembunyikan; catatan `verified` tetap tampil. Menghapus permanen pesanan stok membuang catatan yang belum diverifikasi, dan ditolak bila sudah diverifikasi (`INV: ...`).
- Database juga menolak tagihan/pembayaran untuk pesanan stok (trigger `trg_inv_block_invoice/payment`), selain `v_order_finance` yang mengecualikannya. `fin_overview`, `fin_report`, `fin_todo`, `v_receivable_aging` ikut bersih karena membaca view itu.
- `GET /api/inventori/receipts` menerima `order=<id>` (dipakai kartu Status stok di Detail Pesanan).
- Notifikasi saat QC stok lolos: `/api/notify` menerima `permission: "inventori_verify"` (Super Admin + pemegang `inventori.edit`, tanpa penyaringan per pesanan). Klik notifikasi bagi petugas yang bukan PJ membuka menu Stok.
- Pesan galat database berawalan `INV:` ditampilkan tanpa awalan di browser (mis. Reset QC ditolak setelah verifikasi).

Pertanyaan §18 masih terbuka; v1 memakai asumsi A1–A5 apa adanya.
