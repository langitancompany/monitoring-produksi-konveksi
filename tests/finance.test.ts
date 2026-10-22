// tests/finance.test.ts — uji logika murni Keuangan (lib/finance/*)
// Jalankan: npx tsx tests/finance.test.ts
import assert from "node:assert/strict";
import { resolveFinanceCaps } from "../lib/finance/caps";
import { parsePaymentFields, toPaymentRow } from "../lib/finance/payments";
import { calcInvoice, invoiceIsStale, MAX_PRICE } from "../lib/finance/pricing";
import type { OrderItem } from "../types/order";
import type { OrderFinanceRow } from "../lib/finance/types";
import {
  countByFilter, expenseFormState, expenseProofRequired, expensesByCategory, expenseTotals, filterFinanceRows,
  initialPrices, isOverdue, netVerified, paymentFormState, totalsOf,
  type PaymentFormInput,
} from "../lib/finance/view";
import { parseExpenseFields, sanitizeLookupQuery, toExpenseRow } from "../lib/finance/expenses";
import {
  AGING_ORDER, BUCKET_LABEL, bucketTone, datePreset, isValidRange, lossOrders, monthLabel, pct, reportWarnings,
  sortReportOrders,
} from "../lib/finance/report";
import { COMING_SOON, FAQ, RULES, TASKS, canDo, periodKey, pruneDone, taskKey, tasksFor } from "../lib/finance/guideTasks";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITIES, type ReportData, type ReportOrder } from "../lib/finance/types";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// ─── Pengeluaran (langkah 6.5) ─────────────────────────────────────────────────
const CID = "323e4567-e89b-12d3-a456-426614174000";
const VID = "423e4567-e89b-12d3-a456-426614174000";
const expForm = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    category_id: CID, account_id: AID, spent_at: "2026-10-19", amount: "150000",
    description: "Benang jahit 10 cone", vendor_id: VID, order_id: OID, note: "nota menyusul",
  };
  const all = { ...base, ...over };
  return (k: string) => all[k] ?? "";
};

console.log("isian pengeluaran (parseExpenseFields)");
test("isian lengkap → diterima dan dirapikan", () => {
  const r = parseExpenseFields(expForm({ description: "  Benang   jahit \n 10 cone " }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, {
    categoryId: CID, accountId: AID, vendorId: VID, orderId: OID, description: "Benang jahit 10 cone",
    amount: 150_000, spentAt: "2026-10-19", note: "nota menyusul",
  });
});
test("vendor, pesanan, dan catatan opsional → null; teks panjang dipotong", () => {
  const r = parseExpenseFields(expForm({ vendor_id: "", order_id: "", note: "x".repeat(900), description: "d".repeat(500) }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.vendorId, null);
  assert.equal(r.value.orderId, null);
  assert.equal(r.value.note?.length, 500);
  assert.equal(r.value.description.length, 200);
  const blankNote = parseExpenseFields(expForm({ note: "  " }));
  assert.equal(blankNote.ok && blankNote.value.note, null);
});
test("kategori, akun, vendor, pesanan tidak valid ditolak", () => {
  assert.equal(parseExpenseFields(expForm({ category_id: "" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ category_id: "x" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ account_id: "" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ vendor_id: "bukan-uuid" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ order_id: "' or 1=1 --" })).ok, false);
});
test("keterangan minimal 3 karakter (setelah dirapikan) dan tanggal harus nyata", () => {
  assert.equal(parseExpenseFields(expForm({ description: "ab" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ description: "   " })).ok, false);
  assert.equal(parseExpenseFields(expForm({ description: "a   " })).ok, false); // spasi di ujung tidak dihitung
  const collapsed = parseExpenseFields(expForm({ description: "a  b" })); // dirapikan jadi "a b" (3 karakter) — sah
  assert.equal(collapsed.ok && collapsed.value.description, "a b");
  assert.equal(parseExpenseFields(expForm({ description: "abc" })).ok, true);
  assert.equal(parseExpenseFields(expForm({ spent_at: "2026-02-30" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ spent_at: "" })).ok, false);
});
test("nominal: angka bulat > 0 tanpa titik/koma/minus/huruf, maksimal Rp100 miliar", () => {
  for (const amount of ["", "0", "-5", "1.5", "1,000", "1e6", "abc", " ", "9999999999999", "100000000001"]) {
    assert.equal(parseExpenseFields(expForm({ amount })).ok, false, `amount=${JSON.stringify(amount)}`);
  }
  assert.equal(parseExpenseFields(expForm({ amount: "100000000000" })).ok, true);
});

console.log("baris pengeluaran (toExpenseRow)");
test("path bukti TIDAK ikut ke browser; hanya has_proof", () => {
  const raw = { id: "x1", category_id: CID, account_id: AID, vendor_id: null, order_id: null, amount: 5, proof_path: "expenses/rahasia.jpg" };
  const row = toExpenseRow(raw);
  assert.equal(row.has_proof, true);
  assert.equal("proof_path" in row, false);
  assert.equal(JSON.stringify(row).includes("rahasia"), false);
  assert.equal(toExpenseRow({ ...raw, proof_path: null }).has_proof, false);
});
test("nama kategori, akun, vendor, pesanan dari lookup; tanpa lookup → null", () => {
  const raw = { id: "x1", category_id: CID, account_id: AID, vendor_id: VID, order_id: OID, proof_path: null };
  const lookups = {
    categories: new Map([[CID, "Bahan baku"]]),
    accounts: new Map([[AID, "Kas Tunai"]]),
    vendors: new Map([[VID, "Toko Kain Jaya"]]),
    orders: new Map([[OID, { kode_produksi: "K-1", nama_pemesan: "SMP 1" }]]),
  };
  const row = toExpenseRow(raw, lookups);
  assert.deepEqual(
    [row.category_name, row.account_name, row.vendor_name, row.order_kode, row.order_nama],
    ["Bahan baku", "Kas Tunai", "Toko Kain Jaya", "K-1", "SMP 1"],
  );
  const bare = toExpenseRow(raw);
  assert.deepEqual([bare.category_name, bare.vendor_name, bare.order_kode], [null, null, null]);
  // tanpa vendor/pesanan di baris → null walau lookup ada
  const none = toExpenseRow({ ...raw, vendor_id: null, order_id: null }, lookups);
  assert.deepEqual([none.vendor_name, none.order_kode], [null, null]);
});

console.log("pencarian pesanan (sanitizeLookupQuery)");
test("karakter pola dibuang; terlalu pendek → kosong; dibatasi 60 karakter", () => {
  assert.equal(sanitizeLookupQuery("K-10"), "K-10");
  assert.equal(sanitizeLookupQuery("  smp   1  "), "smp 1");
  assert.equal(sanitizeLookupQuery("%_*\\"), "");
  assert.equal(sanitizeLookupQuery("a%"), "");
  assert.equal(sanitizeLookupQuery("ab%cd"), "ab cd");
  assert.equal(sanitizeLookupQuery(null), "");
  assert.equal(sanitizeLookupQuery(undefined), "");
  assert.equal(sanitizeLookupQuery("x".repeat(200)).length, 60);
});

console.log("aturan form pengeluaran (view.ts)");
test("bukti wajib bila nominal mencapai ambang; ambang 0 = tidak pernah wajib", () => {
  assert.equal(expenseProofRequired(499_999, 500_000), false);
  assert.equal(expenseProofRequired(500_000, 500_000), true);
  assert.equal(expenseProofRequired(9_000_000, 0), false);
  assert.equal(expenseProofRequired(1, 0), false);
});
const ef = (over: Partial<Parameters<typeof expenseFormState>[0]> = {}) =>
  expenseFormState({
    amount: 150_000, threshold: 500_000, hasCategory: true, hasAccount: true, hasDate: true,
    description: "Benang jahit", hasFile: false, ...over,
  });
test("Simpan menyala bila semua lengkap; mati bila kurang satu pun", () => {
  assert.equal(ef().canSubmit, true);
  assert.equal(ef({ amount: 0 }).canSubmit, false);
  assert.equal(ef({ hasCategory: false }).canSubmit, false);
  assert.equal(ef({ hasAccount: false }).canSubmit, false);
  assert.equal(ef({ hasDate: false }).canSubmit, false);
  assert.equal(ef({ description: "ab" }).canSubmit, false);
  assert.equal(ef({ description: "  ab  " }).canSubmit, false);
});
test("di atas ambang: butuh file bukti; di bawah ambang tidak", () => {
  assert.deepEqual(ef({ amount: 2_000_000 }), { needProof: true, canSubmit: false });
  assert.deepEqual(ef({ amount: 2_000_000, hasFile: true }), { needProof: true, canSubmit: true });
  assert.deepEqual(ef({ amount: 499_999 }), { needProof: false, canSubmit: true });
  assert.deepEqual(ef({ amount: 2_000_000, threshold: 0 }), { needProof: false, canSubmit: true });
});

console.log("ringkasan pengeluaran (expenseTotals / expensesByCategory)");
const xs = [
  { status: "approved" as const, amount: 1_000_000, category_name: "Bahan baku" },
  { status: "approved" as const, amount: 500_000, category_name: "Bahan baku" },
  { status: "approved" as const, amount: 300_000, category_name: "Operasional" },
  { status: "pending" as const, amount: 250_000, category_name: "Bahan baku" },
  { status: "pending" as const, amount: 50_000, category_name: "Lain-lain" },
  { status: "rejected" as const, amount: 999_999, category_name: "Bahan baku" },
  { status: "void" as const, amount: 888_888, category_name: "Operasional" },
];
test("total disetujui & menunggu; ditolak dan void tidak dihitung", () => {
  assert.deepEqual(expenseTotals(xs), { approved: 1_800_000, pending: 300_000, pendingCount: 2 });
  assert.deepEqual(expenseTotals([]), { approved: 0, pending: 0, pendingCount: 0 });
});
test("per kategori: hanya yang disetujui, terbesar dulu, dibatasi top", () => {
  assert.deepEqual(expensesByCategory(xs), [["Bahan baku", 1_500_000], ["Operasional", 300_000]]);
  assert.deepEqual(expensesByCategory(xs, 1), [["Bahan baku", 1_500_000]]);
  assert.deepEqual(expensesByCategory([{ status: "approved", amount: 5, category_name: null }]), [["Tanpa kategori", 5]]);
  assert.deepEqual(expensesByCategory([]), []);
});

// ─── Ringkasan, Laporan, Panduan, Audit (langkah 6.6) ───────────────────────────
console.log("laporan (report.ts)");
test("semua bucket umur piutang punya label dan urutan; nada: telat lama merah, baru telat kuning", () => {
  assert.equal(AGING_ORDER.length, 5);
  for (const b of AGING_ORDER) assert.ok(BUCKET_LABEL[b].length > 3, b);
  assert.deepEqual(AGING_ORDER.map(bucketTone), ["neutral", "amber", "red", "red", "neutral"]);
});
test("monthLabel & pct", () => {
  assert.match(monthLabel("2026-10"), /Okt\s2026/);
  assert.equal(monthLabel("bukan-bulan"), "bukan-bulan");
  assert.equal(pct(25, 100), "25.0%");
  assert.equal(pct(1, 3), "33.3%");
  assert.equal(pct(5, 0), "-");
  assert.equal(pct(-10, 100), "-10.0%");
});
const ro = (kode: string, total: number, dc: number): ReportOrder => ({
  order_id: kode, kode_produksi: kode, nama_pemesan: "x", tanggal_masuk: "2026-10-01", total, paid: 0, direct_cost: dc, gross: total - dc,
});
test("sortReportOrders: terendah/tertinggi, seri berdasar kode, masukan tidak berubah", () => {
  const list = [ro("K-2", 100, 10), ro("K-1", 100, 10), ro("K-3", 50, 80), ro("K-4", 200, 0)];
  const before = list.map((o) => o.kode_produksi).join();
  assert.deepEqual(sortReportOrders(list, "lowest").map((o) => o.kode_produksi), ["K-3", "K-1", "K-2", "K-4"]);
  assert.deepEqual(sortReportOrders(list, "highest").map((o) => o.kode_produksi), ["K-4", "K-1", "K-2", "K-3"]);
  assert.deepEqual(sortReportOrders(list, "newest").map((o) => o.kode_produksi), ["K-2", "K-1", "K-3", "K-4"]);
  assert.equal(list.map((o) => o.kode_produksi).join(), before);
  assert.equal(lossOrders(list), 1);
  assert.equal(lossOrders([]), 0);
});
test("datePreset: bulan ini, 3 bulan (melewati pergantian tahun), tahun ini", () => {
  const now = new Date(2026, 9, 22); // 22 Okt 2026
  assert.deepEqual(datePreset("month", now), { from: "2026-10-01", to: "2026-10-22" });
  assert.deepEqual(datePreset("3m", now), { from: "2026-08-01", to: "2026-10-22" });
  assert.deepEqual(datePreset("year", now), { from: "2026-01-01", to: "2026-10-22" });
  assert.deepEqual(datePreset("3m", new Date(2026, 0, 15)), { from: "2025-11-01", to: "2026-01-15" });
});
test("isValidRange", () => {
  assert.equal(isValidRange("2026-10-01", "2026-10-31"), true);
  assert.equal(isValidRange("2026-10-01", "2026-10-01"), true);
  assert.equal(isValidRange("2026-10-31", "2026-10-01"), false);
  assert.equal(isValidRange("", "2026-10-01"), false);
});
const tot = (over: Partial<ReportData["totals"]> = {}): ReportData["totals"] => ({
  revenue: 10_000_000, expenses: 4_000_000, profit: 6_000_000, cash_in: 0, cash_out: 4_000_000, cash_net: 0,
  unpaid_billed: 0, expenses_linked: 4_000_000, expenses_unlinked: 0, ...over,
});
test("peringatan kelengkapan: tanpa biaya, biaya belum ditautkan, rugi, dan normal tanpa peringatan", () => {
  assert.deepEqual(reportWarnings(tot()), []);
  const noExp = reportWarnings(tot({ expenses: 0, profit: 10_000_000, expenses_linked: 0 }));
  assert.equal(noExp.length, 1);
  assert.match(noExp[0], /Belum ada pengeluaran disetujui/);
  const unlinked = reportWarnings(tot({ expenses_linked: 1_000_000, expenses_unlinked: 3_000_000 }));
  assert.equal(unlinked.length, 1);
  assert.match(unlinked[0], /Rp3\.000\.000 \(75\.0%\) pengeluaran belum ditautkan/);
  const loss = reportWarnings(tot({ expenses: 12_000_000, profit: -2_000_000, expenses_linked: 12_000_000 }));
  assert.deepEqual(loss, ["Biaya melebihi pendapatan pada periode ini."]);
  assert.equal(reportWarnings(tot({ revenue: 0, expenses: 0, profit: 0, expenses_linked: 0 })).length, 0);
});

console.log("panduan (guideTasks.ts)");
const capsOf = (c: Partial<Record<"view" | "create" | "edit" | "delete", boolean>>, isSupervisor = false) => ({
  view: true, create: false, edit: false, delete: false, ...c, isSupervisor,
});
test("tugas disaring menurut hak: lihat saja, hanya-create, hanya-edit, supervisor", () => {
  const ids = (c: ReturnType<typeof capsOf>) => tasksFor(c).map((t) => t.id).sort();
  assert.deepEqual(ids(capsOf({})), ["w-aging"]);
  assert.deepEqual(ids(capsOf({ create: true })), ["d-expense", "d-invoice", "d-payment", "w-aging", "w-complete", "w-unbilled"]);
  assert.deepEqual(ids(capsOf({ edit: true })), ["d-approve", "d-verify", "m-reconcile", "m-report", "w-aging"]);
  assert.equal(ids(capsOf({ create: true, edit: true, delete: true }, true)).length, TASKS.length);
  assert.equal(canDo(TASKS.find((t) => t.id === "m-audit")!, capsOf({ create: true, edit: true, delete: true })), false);
  assert.equal(canDo(TASKS.find((t) => t.id === "m-audit")!, capsOf({}, true)), true);
});
test("isi panduan konsisten: id unik, langkah ada, tab tujuan sah, FAQ/aturan/belum-tersedia terisi", () => {
  assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length);
  const targets = ["overview", "invoices", "payments", "verify", "expenses", "report", "audit", "info"];
  for (const t of TASKS) {
    assert.ok(t.steps.length >= 2, t.id);
    assert.ok(t.title && t.why, t.id);
    if (t.go) assert.ok(targets.includes(t.go.tab), `${t.id} -> ${t.go.tab}`);
  }
  assert.ok(RULES.length >= 3 && FAQ.length >= 5 && COMING_SOON.length >= 2);
  for (const f of FAQ) assert.ok(f.q.endsWith("?") || f.q.endsWith("."), f.q);
});
test("periodKey: harian = tanggal, mingguan = Senin minggu itu (juga lintas tahun), bulanan = YYYY-MM", () => {
  assert.equal(periodKey("daily", new Date(2026, 9, 22)), "2026-10-22");
  assert.equal(periodKey("monthly", new Date(2026, 9, 22)), "2026-10");
  assert.equal(periodKey("weekly", new Date(2026, 9, 22)), "2026-10-19"); // Kamis → Senin
  assert.equal(periodKey("weekly", new Date(2026, 9, 25)), "2026-10-19"); // Minggu → Senin sebelumnya
  assert.equal(periodKey("weekly", new Date(2026, 9, 26)), "2026-10-26"); // Senin → dirinya
  assert.equal(periodKey("weekly", new Date(2026, 0, 1)), "2025-12-29"); // 1 Jan 2026 (Kamis)
});
test("pruneDone: centang periode berjalan dipertahankan; periode lama & tugas yang tak berlaku dibuang", () => {
  const caps = capsOf({ create: true, edit: true });
  const tasks = tasksFor(caps);
  const now = new Date(2026, 9, 22);
  const t = tasks.find((x) => x.id === "d-payment")!;
  const done = {
    [taskKey(t, now)]: true as const,
    "d-payment|2026-10-21": true as const, // kemarin
    "w-aging|2026-10-12": true as const, // minggu lalu
    "tugas-hilang|2026-10-22": true as const,
  };
  assert.deepEqual(pruneDone(done, tasks, now), { [taskKey(t, now)]: true });
  assert.deepEqual(pruneDone({}, tasks, now), {});
});

console.log("kontrak audit: label harus mencakup semua aksi yang ditulis database");
test("setiap aksi di migration & API punya label, dan jenisnya terdaftar di AUDIT_ENTITIES", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const found = new Set([...sql.matchAll(/'((?:invoice|payment|expense|vendor)\.[a-z_]+)'/g)].map((m) => m[1]));
  found.add("vendor.create"); // ditulis oleh app/api/finance/vendors/route.ts lewat fin_audit
  assert.ok(found.size >= 10, `hanya ${found.size} aksi ditemukan`);
  for (const a of found) assert.ok(AUDIT_ACTION_LABEL[a], `label untuk ${a} belum ada`);
  for (const a of Object.keys(AUDIT_ACTION_LABEL)) {
    assert.ok((AUDIT_ENTITIES as readonly string[]).includes(a.split(".")[0]), `jenis untuk ${a}`);
  }
});

console.log(`\n${passed} uji lulus`);
