// lib/finance/guideTasks.ts
//
// Isi tab "Panduan": tugas rutin admin Keuangan, aturan penting, tanya-jawab, dan helper periode centang.
// Murni data + fungsi kecil (tanpa React) agar mudah diuji. HANYA memuat fitur yang SUDAH ada; yang belum
// tersedia dicantumkan terpisah di COMING_SOON agar panduan tidak menyesatkan.

import type { FinCaps } from "./caps";

export type GuideTarget = "overview" | "invoices" | "payments" | "verify" | "expenses" | "report" | "audit" | "info";
export type Freq = "daily" | "weekly" | "monthly";
export type Needs = "create" | "edit" | "supervisor";

export interface GuideTask {
  id: string;
  freq: Freq;
  title: string;
  why: string;
  steps: string[];
  /** hak minimum yang dibutuhkan; kosong = semua yang punya akses Keuangan */
  needs?: Needs;
  go?: { tab: GuideTarget; label: string; pending?: boolean };
}

export const FREQ_LABEL: Record<Freq, string> = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" };
export const FREQ_PERIOD_HINT: Record<Freq, string> = { daily: "hari ini", weekly: "minggu ini", monthly: "bulan ini" };

export const TASKS: GuideTask[] = [
  // ───────────── Harian ─────────────
  {
    id: "d-verify", freq: "daily", needs: "edit",
    title: "Proses antrean verifikasi pembayaran",
    why: "Pembayaran baru belum dihitung sebagai uang masuk sampai diverifikasi.",
    steps: [
      "Buka tab Verifikasi.",
      "Klik Lihat bukti, lalu cocokkan nominal, tanggal, dan pengirim dengan mutasi rekening atau uang tunai.",
      "Klik Verifikasi bila cocok, atau Tolak dengan alasan.",
      "Antrean kosong berarti selesai.",
    ],
    go: { tab: "verify", label: "Buka antrean" },
  },
  {
    id: "d-approve", freq: "daily", needs: "edit",
    title: "Setujui atau tolak pengeluaran",
    why: "Pengeluaran yang belum disetujui tidak dihitung di laporan.",
    steps: [
      "Buka tab Pengeluaran, pilih status Menunggu persetujuan.",
      "Periksa nota, kategori, dan nominal.",
      "Klik Setujui, atau Tolak dengan alasan.",
    ],
    go: { tab: "expenses", pending: true, label: "Buka antrean" },
  },
  {
    id: "d-invoice", freq: "daily", needs: "create",
    title: "Terbitkan tagihan untuk pesanan baru",
    why: "Pembayaran hanya bisa dicatat pada pesanan yang sudah punya tagihan.",
    steps: [
      "Buka tab Tagihan, pilih filter Belum Ditagih.",
      "Klik Rincian, lalu Terbitkan tagihan.",
      "Isi harga per pcs untuk tiap baris item, diskon bila ada, dan jatuh tempo.",
      "Pesanan utama baru bisa ditagih setelah tahap Approval (jenis produksi dan jumlah sudah dipilih).",
    ],
    go: { tab: "invoices", label: "Buka Tagihan" },
  },
  {
    id: "d-payment", freq: "daily", needs: "create",
    title: "Catat pembayaran yang masuk",
    why: "Uang yang diterima tetapi tidak dicatat tidak akan muncul di laporan.",
    steps: [
      "Di tab Tagihan klik Catat bayar pada pesanan yang bersangkutan.",
      "Isi nominal, metode, akun kas/bank, dan tanggal diterima.",
      "Lampirkan bukti (wajib untuk transfer dan QRIS).",
      "Simpan. Pembayaran masuk antrean verifikasi.",
    ],
    go: { tab: "invoices", label: "Buka Tagihan" },
  },
  {
    id: "d-expense", freq: "daily", needs: "create",
    title: "Catat pengeluaran hari ini",
    why: "Biaya yang tidak dicatat membuat laba terlihat lebih besar dari kenyataan.",
    steps: [
      "Buka tab Pengeluaran, klik Catat pengeluaran.",
      "Pilih kategori dan akun yang dipakai membayar.",
      "Tautkan ke pesanan bila biayanya khusus untuk satu pesanan, supaya laba per pesanan akurat.",
      "Lampirkan nota (wajib mulai batas nominal yang ditetapkan).",
    ],
    go: { tab: "expenses", label: "Buka Pengeluaran" },
  },
  // ───────────── Mingguan ─────────────
  {
    id: "w-aging", freq: "weekly",
    title: "Tinjau piutang yang jatuh tempo",
    why: "Semakin lama tagihan menunggak, semakin sulit ditagih.",
    steps: [
      "Buka Ringkasan, lihat Umur piutang dan Sisa tagihan terbesar.",
      "Hubungi pelanggan yang telat.",
      "Catat pembayaran begitu uangnya masuk.",
      "Piutang di bucket \"Tanpa jatuh tempo\" belum punya tenggat — revisi tagihannya untuk mengisi jatuh tempo.",
    ],
    go: { tab: "overview", label: "Buka Ringkasan" },
  },
  {
    id: "w-unbilled", freq: "weekly", needs: "create",
    title: "Tagih pesanan yang belum ditagih",
    why: "Pesanan tanpa tagihan tidak tercatat sebagai pendapatan.",
    steps: [
      "Di tab Tagihan pilih filter Belum Ditagih.",
      "Terbitkan tagihan untuk pesanan yang harganya sudah jelas.",
    ],
    go: { tab: "invoices", label: "Buka Tagihan" },
  },
  {
    id: "w-complete", freq: "weekly", needs: "create",
    title: "Pastikan pengeluaran minggu ini lengkap",
    why: "Laporan laba hanya seakurat kelengkapan biaya yang dicatat.",
    steps: [
      "Cocokkan dengan nota dan mutasi rekening minggu ini.",
      "Catat yang belum masuk; tautkan ke pesanan bila khusus untuk satu pesanan.",
    ],
    go: { tab: "expenses", label: "Buka Pengeluaran" },
  },
  // ───────────── Bulanan ─────────────
  {
    id: "m-reconcile", freq: "monthly", needs: "edit",
    title: "Cocokkan kas dan bank dengan mutasi",
    why: "Selisih menandakan ada transaksi yang belum dicatat atau salah catat.",
    steps: [
      "Di Ringkasan lihat Saldo per akun, lalu bandingkan dengan uang tunai dan mutasi rekening.",
      "Telusuri selisih lewat tab Transaksi dan Pengeluaran.",
      "Saldo awal akun diatur di database (kolom opening_balance); pencocokan dilakukan manual.",
    ],
    go: { tab: "overview", label: "Buka Ringkasan" },
  },
  {
    id: "m-report", freq: "monthly", needs: "edit",
    title: "Periksa laporan bulan ini",
    why: "Mendeteksi biaya yang belum lengkap dan pesanan yang merugi.",
    steps: [
      "Buka tab Laporan, pilih rentang bulan yang diperiksa.",
      "Perhatikan peringatan kelengkapan biaya dan margin yang janggal.",
      "Periksa pesanan dengan laba kotor negatif.",
    ],
    go: { tab: "report", label: "Buka Laporan" },
  },
  {
    id: "m-audit", freq: "monthly", needs: "supervisor",
    title: "Tinjau log audit",
    why: "Void, revisi tagihan, dan penolakan yang tidak biasa perlu ditanyakan alasannya.",
    steps: [
      "Buka tab Audit, pilih rentang bulan lalu.",
      "Perhatikan void dan revisi tagihan.",
      "Tanyakan alasannya bila ada yang janggal.",
    ],
    go: { tab: "audit", label: "Buka Audit" },
  },
];

export const RULES: string[] = [
  "Jangan menghapus data. Koreksi dengan Void atau Revisi tagihan, dan selalu isi alasannya.",
  "Yang mencatat sebaiknya bukan yang memverifikasi atau menyetujui.",
  "Selalu lampirkan bukti. Bukti wajib untuk transfer, QRIS, dan pengeluaran di atas batas nominal.",
  "Laba di laporan adalah perkiraan manajemen dari data yang tercatat, bukan pembukuan resmi. Pembukuan resmi disusun akuntan.",
  "Selama audit berjalan, jangan mengubah data historis.",
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Salah mengisi nominal pembayaran. Bagaimana?",
    a: "Void transaksi yang salah (wajib alasan), lalu catat ulang dengan nominal yang benar. Perlu hak Void." },
  { q: "Harga pada tagihan salah.",
    a: "Klik Revisi tagihan pada pesanan itu dan isi alasannya. Versi lama tetap tersimpan di Riwayat tagihan." },
  { q: "Pelanggan meminta uangnya dikembalikan.",
    a: "Catat sebagai Refund lewat kotak centang pada form pembayaran. Hanya pemegang hak Verifikasi yang bisa, dan nominalnya tidak boleh melebihi uang yang sudah terverifikasi." },
  { q: "Pembayaran sudah dicatat tetapi Terbayar belum bertambah.",
    a: "Pembayaran masih menunggu verifikasi. Nominalnya baru dihitung setelah diverifikasi." },
  { q: "Laba di laporan terlihat terlalu besar.",
    a: "Biasanya biaya belum lengkap dicatat atau belum disetujui. Lengkapi pengeluaran dan proses antreannya, lalu tautkan biaya khusus ke pesanannya." },
  { q: "Pesanan tidak bisa ditagih.",
    a: "Pesanan harus punya rincian item. Pesanan utama baru punya item setelah tahap Approval; selesaikan dulu di Detail Pesanan." },
  { q: "Pesanan tidak bisa dihapus permanen dari Sampah.",
    a: "Pesanan yang sudah punya tagihan atau biaya langsung dilindungi. Biarkan di Sampah." },
];

/** Fitur yang direncanakan tetapi BELUM ada — supaya pengguna tidak mencarinya. */
export const COMING_SOON: string[] = [
  "Invoice dalam bentuk PDF/cetak dan kirim ke pelanggan, serta ekspor laporan ke Excel (langkah 6.7).",
  "Gaji yang otomatis tercatat sebagai pengeluaran, tutup periode, transfer antar akun, dan layar pengaturan keuangan (langkah 6.8). Sampai saat itu biaya gaji belum masuk laporan kecuali dicatat manual sebagai pengeluaran kategori Gaji & upah (untuk bulan yang sudah lewat, dengan keterangan jelas, agar tidak dobel saat fitur otomatisnya aktif).",
];

export const canDo = (t: GuideTask, caps: FinCaps): boolean =>
  !t.needs || (t.needs === "supervisor" ? caps.isSupervisor : caps[t.needs]);

export const tasksFor = (caps: FinCaps): GuideTask[] => TASKS.filter((t) => canDo(t, caps));

/** Kunci periode centang: harian = tanggal, mingguan = tanggal Senin minggu itu, bulanan = YYYY-MM. */
export function periodKey(freq: Freq, now: Date = new Date()): string {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (freq === "daily") return ymd(now);
  if (freq === "monthly") return ymd(now).slice(0, 7);
  const sinceMonday = (now.getDay() + 6) % 7;
  return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday));
}

export const taskKey = (t: GuideTask, now: Date = new Date()) => `${t.id}|${periodKey(t.freq, now)}`;

/** Buang centang periode lama (hari/minggu/bulan yang sudah lewat) supaya daftar kembali kosong. */
export function pruneDone(done: Record<string, true>, tasks: GuideTask[], now: Date = new Date()): Record<string, true> {
  const valid = new Set(tasks.map((t) => taskKey(t, now)));
  const out: Record<string, true> = {};
  for (const k of Object.keys(done)) if (valid.has(k)) out[k] = true;
  return out;
}
