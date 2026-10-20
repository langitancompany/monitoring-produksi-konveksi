// tests/finance.test.ts — uji logika murni Keuangan (lib/finance/*)
// Jalankan: npx tsx tests/finance.test.ts
import assert from "node:assert/strict";
import { resolveFinanceCaps } from "../lib/finance/caps";
import { parsePaymentFields, toPaymentRow } from "../lib/finance/payments";
import { calcInvoice, invoiceIsStale, MAX_PRICE } from "../lib/finance/pricing";
import type { OrderItem } from "../types/order";
import type { OrderFinanceRow } from "../lib/finance/types";
import {
  countByFilter, filterFinanceRows, initialPrices, isOverdue, netVerified, paymentFormState, totalsOf,
  type PaymentFormInput,
} from "../lib/finance/view";
import { finError, isDate, isMoney, isUuid, parseSettings, sniffProof, todayWib } from "../lib/finance/validate";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log("hak akses (caps)");
test("supervisor punya semua hak walau permission kosong", () => {
  const c = resolveFinanceCaps({ role: "supervisor" }, null);
  assert.deepEqual(c, { view: true, create: true, edit: true, delete: true, isSupervisor: true });
});
test("supervisor lewat roles ganda juga dikenali", () => {
  assert.equal(resolveFinanceCaps({ role: "admin", roles: ["admin", "supervisor"] }, null).isSupervisor, true);
});
test("tanpa permission → tidak punya hak apa pun", () => {
  const c = resolveFinanceCaps({ role: "admin" }, undefined);
  assert.deepEqual(c, { view: false, create: false, edit: false, delete: false, isSupervisor: false });
  assert.equal(resolveFinanceCaps(null, null).view, false);
});
test("hak lebih tinggi otomatis boleh melihat; hak lain tidak ikut naik", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { create: true });
  assert.equal(c.view, true);
  assert.equal(c.create, true);
  assert.equal(c.edit, false);
  assert.equal(c.delete, false);
  assert.equal(c.isSupervisor, false); // bukan supervisor → tak boleh lihat audit
});
test("nilai bukan boolean true tidak dianggap hak (mis. string 'true')", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { view: "true" as unknown as boolean });
  assert.equal(c.view, false);
});

console.log("validator");
test("isUuid", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("123e4567-e89b-12d3-a456-42661417400"), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid("' or 1=1 --"), false);
});
test("isMoney: bulat, ≥ 0, ada batas atas", () => {
  assert.equal(isMoney(0), true);
  assert.equal(isMoney(1_500_000), true);
  assert.equal(isMoney(100_000_000_000), true);
  assert.equal(isMoney(100_000_000_001), false);
  assert.equal(isMoney(-1), false);
  assert.equal(isMoney(10.5), false);
  assert.equal(isMoney(NaN), false);
  assert.equal(isMoney("1000"), false);
});
test("isDate: format dan kalender benar (31 Feb & 29 Feb non-kabisat ditolak)", () => {
  assert.equal(isDate("2026-10-19"), true);
  assert.equal(isDate("2028-02-29"), true);
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2026-02-31"), false);
  assert.equal(isDate("2026-13-01"), false);
  assert.equal(isDate("19-10-2026"), false);
  assert.equal(isDate(20261019), false);
});
test("todayWib memakai tanggal WIB (UTC+7), bukan UTC", () => {
  // 18 Okt 2026 20:00 UTC = 19 Okt 2026 03:00 WIB
  assert.equal(todayWib(new Date(Date.UTC(2026, 9, 18, 20, 0, 0))), "2026-10-19");
  assert.equal(todayWib(new Date(Date.UTC(2026, 9, 18, 16, 59, 0))), "2026-10-18");
});

console.log("bukti pembayaran (sniffProof)");
test("mengenali JPG, PNG, PDF, WEBP dari isi file", () => {
  assert.equal(sniffProof(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
  assert.equal(sniffProof(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))?.mime, "image/png");
  assert.equal(sniffProof(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext, "pdf");
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffProof(webp)?.ext, "webp");
});
test("file lain (HTML, EXE, WAV bermodel RIFF) ditolak walau berekstensi gambar", () => {
  assert.equal(sniffProof(new TextEncoder().encode("<html><script>")), null);
  assert.equal(sniffProof(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])), null);
  const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  assert.equal(sniffProof(wav), null);
  assert.equal(sniffProof(new Uint8Array(0)), null);
});

console.log("pengaturan (parseSettings)");
test("tanpa baris → bawaan paling ketat/aman", () => {
  assert.deepEqual(parseSettings([]), {
    require_proof_non_cash: true,
    require_separate_verifier: false,
    allow_overpayment: false,
    auto_verify_own_payment: false,
    auto_approve_own_expense: false,
    expense_proof_required_above: 500_000,
    salary_default_account_code: "KAS",
  });
  assert.equal(parseSettings(null).require_proof_non_cash, true);
});
test("nilai dari database dipakai bila tipenya benar", () => {
  const s = parseSettings([
    { key: "require_proof_non_cash", value: false },
    { key: "allow_overpayment", value: true },
    { key: "expense_proof_required_above", value: 0 },
    { key: "salary_default_account_code", value: "BANK" },
  ]);
  assert.equal(s.require_proof_non_cash, false);
  assert.equal(s.allow_overpayment, true);
  assert.equal(s.expense_proof_required_above, 0);
  assert.equal(s.salary_default_account_code, "BANK");
});
test("tipe salah / nilai aneh jatuh ke bawaan, bukan membuka kontrol", () => {
  const s = parseSettings([
    { key: "require_proof_non_cash", value: "false" }, // string, bukan boolean
    { key: "allow_overpayment", value: 1 },
    { key: "expense_proof_required_above", value: -5 },
    { key: "salary_default_account_code", value: "kas; drop table" },
  ]);
  assert.equal(s.require_proof_non_cash, true);
  assert.equal(s.allow_overpayment, false);
  assert.equal(s.expense_proof_required_above, 500_000);
  assert.equal(s.salary_default_account_code, "KAS");
});

console.log("galat database (finError)");
test("pesan 'FIN:' diteruskan (422), galat lain disamarkan (500)", () => {
  assert.deepEqual(finError({ message: "FIN: Tagihan tidak ditemukan" }), {
    status: 422,
    message: "Tagihan tidak ditemukan",
    expected: true,
  });
  const r = finError({ message: 'relation "finance_x" does not exist: secret detail' });
  assert.equal(r.status, 500);
  assert.equal(r.expected, false);
  assert.equal(r.message, "Terjadi kesalahan pada server");
  assert.equal(finError(null, "Gagal").message, "Gagal");
});

// ─── Tagihan (langkah 6.2) ─────────────────────────────────────────────────────
const items: OrderItem[] = [
  { id: "it-a", jenis_produksi: "seragam_sekolah", jumlah: 100 },
  { id: "it-b", jenis_produksi: "kaos_polo", jumlah: 50 },
];
const nameOf = (j: string) => ({ seragam_sekolah: "Seragam Sekolah", kaos_polo: "Kaos Polo" }[j] ?? j);

console.log("hitung tagihan (calcInvoice)");
test("total = Σ jumlah × harga − diskon (sama dengan hasil uji fungsi SQL: Rp11.000.000)", () => {
  const r = calcInvoice(items, { "it-a": 85_000, "it-b": 60_000 }, 500_000, nameOf);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.calc.subtotal, 11_500_000);
  assert.equal(r.calc.total, 11_000_000);
  assert.equal(r.calc.totalPcs, 150);
  assert.deepEqual(r.calc.lines[0], {
    item_id: "it-a", jenis_produksi: "seragam_sekolah", nama: "Seragam Sekolah",
    jumlah: 100, harga_per_pcs: 85_000, subtotal: 8_500_000,
  });
});
test("tanpa diskon", () => {
  const r = calcInvoice([items[0]], { "it-a": 1 });
  assert.equal(r.ok && r.calc.total, 100);
});
test("harga item belum diisi / kosong → galat menyebut nama item", () => {
  const r = calcInvoice(items, { "it-a": 85_000 }, 0, nameOf);
  assert.deepEqual(r, { ok: false, error: 'Harga untuk item "Kaos Polo" belum diisi.' });
  assert.equal(calcInvoice(items, { "it-a": 1, "it-b": "" }, 0, nameOf).ok, false);
});
test("harga harus bilangan bulat > 0 (nol, minus, pecahan, teks, NaN, terlalu besar ditolak)", () => {
  for (const bad of [0, -5, 10.5, "85000", NaN, Infinity, MAX_PRICE + 1]) {
    const r = calcInvoice([items[0]], { "it-a": bad as unknown });
    assert.equal(r.ok, false, String(bad));
  }
  assert.equal(calcInvoice([items[0]], { "it-a": MAX_PRICE }).ok, true);
});
test("harga untuk item yang tidak ada di pesanan ditolak (jangan diabaikan diam-diam)", () => {
  const r = calcInvoice(items, { "it-a": 1, "it-b": 1, hantu: 5 });
  assert.equal(r.ok, false);
});
test("diskon: tidak minus, tidak pecahan, tidak ≥ subtotal", () => {
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, -1).ok, false);
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, 1.5).ok, false);
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, "5").ok, false);
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, 1000).ok, false); // sama dengan subtotal
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, 999).ok, true);
});
test("pesanan tanpa item / jumlah tidak valid / item tanpa id ditolak", () => {
  assert.equal(calcInvoice([], {}).ok, false);
  assert.equal(calcInvoice([{ id: "x", jenis_produksi: "a", jumlah: 0 }], { x: 1 }).ok, false);
  assert.equal(calcInvoice([{ id: "x", jenis_produksi: "a", jumlah: 2.5 }], { x: 1 }).ok, false);
  assert.equal(calcInvoice([{ id: "", jenis_produksi: "a", jumlah: 1 }], {}).ok, false);
  assert.equal(calcInvoice(items, null as unknown as Record<string, unknown>).ok, false);
});

console.log("tagihan usang (invoiceIsStale)");
test("sama dengan pesanan → tidak usang; tanpa tagihan → tidak usang", () => {
  const r = calcInvoice(items, { "it-a": 1, "it-b": 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(invoiceIsStale(r.calc.lines, items), false);
  assert.equal(invoiceIsStale(undefined, items), false);
  assert.equal(invoiceIsStale(null, items), false);
});
test("jumlah / jenis berubah, item ditambah atau dihapus → usang", () => {
  const r = calcInvoice(items, { "it-a": 1, "it-b": 1 });
  if (!r.ok) throw new Error("setup");
  const lines = r.calc.lines;
  assert.equal(invoiceIsStale(lines, [{ ...items[0], jumlah: 101 }, items[1]]), true);
  assert.equal(invoiceIsStale(lines, [{ ...items[0], jenis_produksi: "lain" }, items[1]]), true);
  assert.equal(invoiceIsStale(lines, [items[0]]), true);
  assert.equal(invoiceIsStale(lines, [...items, { id: "it-c", jenis_produksi: "x", jumlah: 1 }]), true);
  assert.equal(invoiceIsStale(lines, [items[0], { ...items[1], id: "it-z" }]), true);
});

// ─── Pembayaran (langkah 6.3) ──────────────────────────────────────────────────
const OID = "123e4567-e89b-12d3-a456-426614174000";
const AID = "223e4567-e89b-12d3-a456-426614174000";
const form = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    order_id: OID, account_id: AID, method: "transfer", paid_at: "2026-10-19", amount: "3000000",
    reference_no: "TRX1", payer_name: "Pak Budi", note: "DP awal",
  };
  const all = { ...base, ...over };
  return (k: string) => all[k] ?? "";
};

console.log("isian pembayaran (parsePaymentFields)");
test("isian lengkap → diterima dan dirapikan", () => {
  const r = parsePaymentFields(form(), { edit: false });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, {
    orderId: OID, accountId: AID, method: "transfer", paidAt: "2026-10-19", amount: 3_000_000,
    kind: null, reference: "TRX1", payer: "Pak Budi", note: "DP awal",
  });
});
test("isian opsional kosong → null; teks panjang dipotong", () => {
  const r = parsePaymentFields(form({ reference_no: "", payer_name: "  ", note: "x".repeat(900) }), { edit: false });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.reference, null);
  assert.equal(r.value.payer, null);
  assert.equal(r.value.note?.length, 500);
});
test("nominal: harus angka bulat > 0 tanpa titik/koma/minus/huruf", () => {
  for (const amount of ["", "0", "-5", "1.5", "1,000", "1e6", "abc", " ", "9999999999999", "100000000001"]) {
    const r = parsePaymentFields(form({ amount }), { edit: true });
    assert.equal(r.ok, false, `amount=${JSON.stringify(amount)}`);
  }
  assert.equal(parsePaymentFields(form({ amount: "100000000000" }), { edit: true }).ok, true);
});
test("pesanan, akun, metode, tanggal tidak valid ditolak", () => {
  assert.equal(parsePaymentFields(form({ order_id: "x" }), { edit: true }).ok, false);
  assert.equal(parsePaymentFields(form({ account_id: "" }), { edit: true }).ok, false);
  assert.equal(parsePaymentFields(form({ method: "cek" }), { edit: true }).ok, false);
  assert.equal(parsePaymentFields(form({ paid_at: "2026-02-30" }), { edit: true }).ok, false);
  for (const method of ["transfer", "tunai", "qris", "lainnya"]) {
    assert.equal(parsePaymentFields(form({ method }), { edit: false }).ok, true, method);
  }
});
test("jenis: hanya kosong atau refund; refund butuh hak verifikasi (403)", () => {
  assert.equal(parsePaymentFields(form({ kind: "dp" }), { edit: true }).ok, false);
  assert.equal(parsePaymentFields(form({ kind: "pelunasan" }), { edit: true }).ok, false);
  const denied = parsePaymentFields(form({ kind: "refund" }), { edit: false });
  assert.deepEqual(denied.ok === false && denied.status, 403);
  const ok = parsePaymentFields(form({ kind: "refund" }), { edit: true });
  assert.equal(ok.ok && ok.value.kind, "refund");
});

console.log("baris pembayaran (toPaymentRow)");
test("path bukti TIDAK ikut ke browser; hanya has_proof", () => {
  const raw = { id: "p1", order_id: OID, account_id: AID, amount: 5, status: "pending", proof_path: `${OID}/rahasia.jpg` };
  const row = toPaymentRow(raw);
  assert.equal(row.has_proof, true);
  assert.equal("proof_path" in row, false);
  assert.equal(JSON.stringify(row).includes("rahasia"), false);
  assert.equal(toPaymentRow({ ...raw, proof_path: null }).has_proof, false);
});
test("nama akun & pesanan diambil dari lookup; tanpa lookup → null", () => {
  const raw = { id: "p1", order_id: OID, account_id: AID, proof_path: null };
  const lookups = {
    accounts: new Map([[AID, "Kas Tunai"]]),
    orders: new Map([[OID, { kode_produksi: "K-1", nama_pemesan: "SMP 1" }]]),
  };
  const row = toPaymentRow(raw, lookups);
  assert.equal(row.account_name, "Kas Tunai");
  assert.deepEqual(row.orders, { kode_produksi: "K-1", nama_pemesan: "SMP 1" });
  const bare = toPaymentRow(raw);
  assert.equal(bare.account_name, null);
  assert.equal(bare.orders, null);
});

// ─── Langkah 6.4: logika tampilan layar Keuangan (lib/finance/view.ts) ──────────────────────────
const fr = (o: Partial<OrderFinanceRow> = {}): OrderFinanceRow => ({
  order_id: OID, kode_produksi: "KNV-10/26-0001", nama_pemesan: "SMP Negeri 1", jenis_produksi: null, jumlah: 100,
  tanggal_masuk: "2026-10-01", deadline: "2026-10-30", order_status: "On Process", invoice_id: "inv1",
  invoice_version: 1, due_date: null, total: 1_000_000, paid_verified: 0, paid_pending: 0, balance: 1_000_000,
  overpaid: 0, payment_status: "Belum Bayar", kategori: "utama", ...o,
});

console.log("daftar tagihan (filter & total)");
test("filter status + cari kode/nama tidak membedakan huruf besar/kecil", () => {
  const rows = [
    fr({ order_id: "a", kode_produksi: "KNV-10/26-0001", nama_pemesan: "SMP Negeri 1", payment_status: "Lunas" }),
    fr({ order_id: "b", kode_produksi: "KNV-10/26-0002", nama_pemesan: "Toko Maju", payment_status: "DP" }),
    fr({ order_id: "c", kode_produksi: "KNV-10/26-0003", nama_pemesan: "smp negeri 3", payment_status: "DP" }),
  ];
  assert.equal(filterFinanceRows(rows, "", "Semua").length, 3);
  assert.deepEqual(filterFinanceRows(rows, "", "DP").map((r) => r.order_id), ["b", "c"]);
  assert.deepEqual(filterFinanceRows(rows, "SMP", "Semua").map((r) => r.order_id), ["a", "c"]);
  assert.deepEqual(filterFinanceRows(rows, " 0002 ", "Semua").map((r) => r.order_id), ["b"]);
  assert.deepEqual(filterFinanceRows(rows, "smp", "Lunas").map((r) => r.order_id), ["a"]);
  assert.equal(filterFinanceRows(rows, "tidak ada", "Semua").length, 0);
});
test("hitung per status: semua filter ada (minimal 0) dan 'Semua' = seluruh baris", () => {
  const c = countByFilter([fr({ payment_status: "Lunas" }), fr({ payment_status: "Lunas" }), fr({ payment_status: "DP" })]);
  assert.equal(c.Semua, 3);
  assert.equal(c.Lunas, 2);
  assert.equal(c.DP, 1);
  assert.equal(c["Kelebihan Bayar"], 0);
  assert.equal(countByFilter([]).Semua, 0);
});
test("total: tagihan, terbayar, menunggu verifikasi, sisa dijumlah", () => {
  const t = totalsOf([
    fr({ total: 1_000_000, paid_verified: 400_000, paid_pending: 100_000, balance: 600_000 }),
    fr({ total: 500_000, paid_verified: 500_000, paid_pending: 0, balance: 0 }),
  ]);
  assert.deepEqual(t, { total: 1_500_000, paid: 900_000, pending: 100_000, balance: 600_000 });
  assert.deepEqual(totalsOf([]), { total: 0, paid: 0, pending: 0, balance: 0 });
});
test("lewat jatuh tempo: hanya tagihan aktif, ada sisa, jatuh tempo sebelum hari ini", () => {
  const today = new Date(2026, 9, 20); // 20 Okt 2026 (waktu lokal)
  assert.equal(isOverdue(fr({ due_date: "2026-10-19", balance: 1 }), today), true);
  assert.equal(isOverdue(fr({ due_date: "2026-10-20", balance: 1 }), today), false); // hari ini belum lewat
  assert.equal(isOverdue(fr({ due_date: "2026-10-25", balance: 1 }), today), false);
  assert.equal(isOverdue(fr({ due_date: "2026-10-01", balance: 0 }), today), false); // sudah lunas
  assert.equal(isOverdue(fr({ due_date: null, balance: 5 }), today), false); // tanpa jatuh tempo
  assert.equal(isOverdue(fr({ invoice_id: null, due_date: "2026-10-01", balance: 5 }), today), false); // belum ditagih
});

console.log("form tagihan (harga awal)");
test("revisi: harga lama terisi untuk item yang masih ada; item baru = 0", () => {
  const items: OrderItem[] = [
    { id: "i1", jenis_produksi: "kaos_polo", jumlah: 100 },
    { id: "i3", jenis_produksi: "celana", jumlah: 20 },
  ];
  const lines = [
    { item_id: "i1", jenis_produksi: "kaos_polo", nama: "Kaos Polo", jumlah: 100, harga_per_pcs: 85_000, subtotal: 8_500_000 },
    { item_id: "i2", jenis_produksi: "topi", nama: "Topi", jumlah: 5, harga_per_pcs: 10_000, subtotal: 50_000 },
  ];
  assert.deepEqual(initialPrices(items, lines), { i1: 85_000, i3: 0 }); // i2 sudah dihapus dari pesanan → tak ikut
  assert.deepEqual(initialPrices(items, null), { i1: 0, i3: 0 });
  assert.deepEqual(initialPrices([], lines), {});
});
test("harga awal yang dipakai calcInvoice: 0 ditolak sampai diisi, lengkap diterima", () => {
  const items: OrderItem[] = [{ id: "i1", jenis_produksi: "kaos_polo", jumlah: 10 }];
  assert.equal(calcInvoice(items, initialPrices(items, null), 0).ok, false);
  const r = calcInvoice(items, { i1: 50_000 }, 0);
  assert.equal(r.ok && r.calc.total, 500_000);
});

console.log("form pembayaran (paymentFormState)");
const pf = (o: Partial<PaymentFormInput> = {}): PaymentFormInput => ({
  amount: 100_000, balance: 1_000_000, paidPending: 0, paidVerified: 0, isRefund: false, allowOverpayment: false,
  method: "tunai", requireProofNonCash: true, hasAccount: true, hasDate: true, hasFile: false, ...o,
});
test("tunai tanpa bukti boleh disimpan; transfer tanpa bukti ditolak, dengan bukti boleh", () => {
  assert.equal(paymentFormState(pf()).canSubmit, true);
  assert.equal(paymentFormState(pf()).needProof, false);
  assert.equal(paymentFormState(pf({ method: "transfer" })).canSubmit, false);
  assert.equal(paymentFormState(pf({ method: "transfer" })).needProof, true);
  assert.equal(paymentFormState(pf({ method: "qris", hasFile: true })).canSubmit, true);
});
test("bukti tak wajib bila pengaturan mematikannya", () => {
  assert.equal(paymentFormState(pf({ method: "transfer", requireProofNonCash: false })).canSubmit, true);
});
test("batas nominal = sisa dikurangi yang menunggu verifikasi; melebihi ditolak kecuali kelebihan bayar diizinkan", () => {
  const s = paymentFormState(pf({ balance: 1_000_000, paidPending: 300_000, amount: 700_000 }));
  assert.equal(s.maxAmount, 700_000);
  assert.equal(s.canSubmit, true);
  const over = paymentFormState(pf({ balance: 1_000_000, paidPending: 300_000, amount: 700_001 }));
  assert.equal(over.overLimit, true);
  assert.equal(over.canSubmit, false);
  assert.equal(paymentFormState(pf({ balance: 1_000_000, paidPending: 300_000, amount: 900_000, allowOverpayment: true })).canSubmit, true);
});
test("sisa tertutup pembayaran menunggu → batas 0, tidak bisa disimpan", () => {
  const s = paymentFormState(pf({ balance: 500_000, paidPending: 500_000, amount: 1 }));
  assert.equal(s.maxAmount, 0);
  assert.equal(s.canSubmit, false);
});
test("refund dibatasi uang terverifikasi, TIDAK ikut pengaturan kelebihan bayar", () => {
  const ok = paymentFormState(pf({ isRefund: true, paidVerified: 400_000, amount: 400_000, allowOverpayment: true }));
  assert.equal(ok.canSubmit, true);
  const over = paymentFormState(pf({ isRefund: true, paidVerified: 400_000, amount: 400_001, allowOverpayment: true }));
  assert.equal(over.overLimit, true);
  assert.equal(over.canSubmit, false);
});
test("nominal 0/negatif/pecahan, tanpa akun, atau tanpa tanggal tidak bisa disimpan", () => {
  assert.equal(paymentFormState(pf({ amount: 0 })).canSubmit, false);
  assert.equal(paymentFormState(pf({ amount: -5 })).canSubmit, false);
  assert.equal(paymentFormState(pf({ amount: 10.5 })).canSubmit, false);
  assert.equal(paymentFormState(pf({ hasAccount: false })).canSubmit, false);
  assert.equal(paymentFormState(pf({ hasDate: false })).canSubmit, false);
});
test("kas masuk bersih: hanya terverifikasi, refund mengurangi", () => {
  assert.equal(
    netVerified([
      { status: "verified", kind: "dp", amount: 500_000 },
      { status: "verified", kind: "cicilan", amount: 300_000 },
      { status: "verified", kind: "refund", amount: 100_000 },
      { status: "pending", kind: "pelunasan", amount: 999_999 },
      { status: "void", kind: "dp", amount: 123 },
      { status: "rejected", kind: "dp", amount: 456 },
    ]),
    700_000,
  );
  assert.equal(netVerified([]), 0);
});

console.log(`\n${passed} uji lulus`);
