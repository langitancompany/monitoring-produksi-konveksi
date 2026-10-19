// tests/salary.test.ts — uji logika murni Config Harga & Gaji (lib/salary.ts)
// Jalankan: npx tsx tests/salary.test.ts
// Aman di zona waktu mana pun: semua tanggal dibuat dengan konstruktor Date LOKAL.
import assert from "node:assert/strict";
import {
  PARAM,
  PARAM_DEFAULTS,
  adminBonus,
  adminSalaryErrorMessage,
  closingCandidates,
  fixedSalaryAt,
  allocateRounded,
  buildRateBook,
  buildSalaryReport,
  crewOf,
  currentRates,
  describeLines,
  describeProduksi,
  inMonth,
  pricingErrorMessage,
  salaryErrorMessage,
  isProduksiTuntas,
  isQcTuntas,
  isSelesai,
  payItems,
  priceProduksi,
  priceQc,
  produksiTuntasAt,
  qcTuntasAt,
  rateKey,
  splitCrew,
  splitEqual,
  stepAppliesTo,
} from "../lib/salary";
import { buildInitialSteps } from "../lib/steps";
import type { Order, ProductionStep, ProductionTypeData } from "../types/order";
import type { PricingConfig } from "../types/salary";
import type { ProduksiLine } from "../lib/salary";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** ISO dari tanggal lokal (bulan 1–12) */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

// ─── Data contoh ─────────────────────────────────────────────────────────────
let cid = 0;
const cfg = (key: string, value: number, date: string, category = "PRODUKSI"): PricingConfig => ({
  id: ++cid,
  category,
  key_name: key,
  display_name: key,
  unit: "per_pcs",
  value_amount: value,
  effective_date: date,
});

const types: ProductionTypeData[] = [
  { id: "t1", name: "Seragam Sekolah", value: "seragam", kategori: "utama", is_active: true },
  { id: "t2", name: "Kaos Polo", value: "polo", kategori: "utama", is_active: true },
  { id: "t3", name: "Jasa Permak", value: "permak", kategori: "non_utama", is_active: true },
];

/** Pesanan utama dengan tahap yang sudah diselesaikan pada tanggal tertentu. */
function makeOrder(
  id: string,
  opts: {
    kategori?: "utama" | "non_utama";
    items?: { jenis: string; qty: number }[];
    done?: Record<string, string>; // stepKey → ISO selesai
    qcPassed?: boolean;
    assigned_to?: string | null;
    team_id?: string | null;
    crew_snapshot?: Order["crew_snapshot"];
    created_by?: string | null;
    deleted_at?: string | null;
  } = {},
): Order {
  const kategori = opts.kategori ?? "utama";
  const steps: ProductionStep[] = buildInitialSteps(kategori).map((s) => {
    const iso = opts.done?.[s.key];
    if (!iso) return s;
    return {
      ...s,
      isCompleted: true,
      completedAt: iso,
      timestamp: iso,
      ...(s.key === "qc" ? { qc: { passed: opts.qcPassed ?? true, notes: "" } } : {}),
    };
  });
  const items = (opts.items ?? [{ jenis: "seragam", qty: 100 }]).map((i, n) => ({
    id: `i${n}`,
    jenis_produksi: i.jenis,
    jumlah: i.qty,
  }));
  return {
    id,
    created_at: at(2026, 9, 1),
    updated_at: at(2026, 10, 20),
    kode_produksi: `KNV-${id}`,
    kategori,
    nama_pemesan: `Pemesan ${id}`,
    no_hp: "",
    jumlah: items.reduce((n, i) => n + i.jumlah, 0),
    tanggal_masuk: "2026-09-01",
    deadline: "2026-10-30",
    jenis_produksi: items[0]?.jenis_produksi ?? null,
    items,
    status: "On Process",
    steps,
    kendala: [],
    assigned_to: opts.assigned_to ?? null,
    team_id: opts.team_id ?? null,
    crew_snapshot: opts.crew_snapshot ?? null,
    created_by: opts.created_by ?? null,
    deleted_at: opts.deleted_at ?? null,
  };
}

// ─── allocateRounded / splitEqual ────────────────────────────────────────────
console.log("allocateRounded & splitEqual");
test("jumlah bagian SELALU sama dengan total (tidak ada Rupiah hilang)", () => {
  for (const total of [0, 1, 7, 99, 1001, 123_457, 10_000_001]) {
    for (const weights of [[70, 15, 15], [1, 1, 1], [70, 30], [100], [3, 7, 11, 13], [0.7, 0.1, 0.2]]) {
      const r = allocateRounded(total, weights);
      assert.equal(sum(r), total, `total ${total} bobot ${weights}`);
      assert.ok(r.every((n) => Number.isInteger(n) && n >= 0));
    }
  }
});
test("bobot 70:15:15 dari 1001 → 701 / 150 / 150", () => {
  assert.deepEqual(allocateRounded(1001, [70, 15, 15]), [701, 150, 150]);
});
test("bobot nol / negatif / tidak valid → semua 0, bukan error", () => {
  assert.deepEqual(allocateRounded(500, [0, 0]), [0, 0]);
  assert.deepEqual(allocateRounded(500, [-5, NaN]), [0, 0]);
  assert.deepEqual(allocateRounded(500, []), []);
});
test("bobot 0 untuk sebagian → bagian itu tidak mendapat apa-apa", () => {
  assert.deepEqual(allocateRounded(900, [100, 0, 0]), [900, 0, 0]);
});
test("splitEqual: sisa dibagi satu-satu, diputar per pesanan", () => {
  assert.deepEqual(splitEqual(10, 3), [4, 3, 3]);
  assert.deepEqual(splitEqual(10, 3, 1), [3, 4, 3]);
  assert.deepEqual(splitEqual(10, 3, 2), [3, 3, 4]);
  assert.deepEqual(splitEqual(10, 3, 3), [4, 3, 3]); // putaran penuh
  assert.deepEqual(splitEqual(10, 0), []);
  assert.equal(sum(splitEqual(100_001, 7, 5)), 100_001);
});
test("splitEqual diputar → beberapa pesanan tidak menumpuk sisa di satu orang", () => {
  const totals = [0, 0, 0];
  for (let order = 0; order < 30; order++) splitEqual(1, 3, order).forEach((v, i) => (totals[i] += v));
  assert.deepEqual(totals, [10, 10, 10]);
});

// ─── Buku harga ──────────────────────────────────────────────────────────────
console.log("buildRateBook");
test("rate berhistori: dipilih menurut tanggal, baris lama tidak berubah", () => {
  const book = buildRateBook([
    cfg("seragam:produksi_massal", 3000, "2026-01-01"),
    cfg("seragam:produksi_massal", 3500, "2026-10-01"),
  ]);
  assert.equal(book.at("seragam:produksi_massal", "2026-09-30"), 3000);
  assert.equal(book.at("seragam:produksi_massal", "2026-10-01"), 3500);
  assert.equal(book.at("seragam:produksi_massal", "2027-01-01"), 3500);
});
test("sebelum rate pertama berlaku / key tak dikenal → null (bukan 0)", () => {
  const book = buildRateBook([cfg("seragam:qc", 500, "2026-06-01")]);
  assert.equal(book.at("seragam:qc", "2026-05-31"), null);
  assert.equal(book.at("polo:qc", "2026-12-01"), null);
});
test("tanggal sama → id terbesar menang (koreksi di hari yang sama)", () => {
  const a = cfg("seragam:qc", 500, "2026-10-01");
  const b = cfg("seragam:qc", 700, "2026-10-01");
  assert.equal(buildRateBook([b, a]).at("seragam:qc", "2026-10-05"), 700); // urutan input tak berpengaruh
  assert.equal(buildRateBook([a, b]).at("seragam:qc", "2026-10-05"), 700);
});
test("rate Rp0 yang disengaja ≠ belum diatur", () => {
  const book = buildRateBook([cfg("seragam:potong_kain", 0, "2026-01-01")]);
  assert.equal(book.at("seragam:potong_kain", "2026-10-01"), 0);
});
test("baris jadwal masa depan tidak berlaku sebelum tanggalnya", () => {
  const book = buildRateBook([cfg("polo:qc", 400, "2026-01-01"), cfg("polo:qc", 900, "2027-01-01")]);
  assert.equal(book.at("polo:qc", "2026-10-18"), 400);
});
test("parameter bonus admin: pakai baris bila ada, kalau tidak nilai bawaan", () => {
  const empty = buildRateBook([]);
  assert.equal(empty.param(PARAM.adminClosing, "2026-10-01"), 10000);
  assert.equal(empty.param(PARAM.adminClosing, "2026-10-01"), PARAM_DEFAULTS[PARAM.adminClosing]);
  const book = buildRateBook([cfg(PARAM.adminClosing, 15000, "2026-10-01", "PARAMETER")]);
  assert.equal(book.param(PARAM.adminClosing, "2026-09-30"), 10000); // sebelum berlaku → bawaan
  assert.equal(book.param(PARAM.adminClosing, "2026-10-01"), 15000);
});
test("nilai berbentuk string dari database tetap terbaca (numeric)", () => {
  const row = { ...cfg("polo:qc", 0, "2026-01-01"), value_amount: "1250" as unknown as number };
  assert.equal(buildRateBook([row]).at("polo:qc", "2026-10-01"), 1250);
});
test("currentRates: nilai berlaku per key pada satu tanggal", () => {
  const r = currentRates(
    [cfg("a:qc", 1, "2026-01-01"), cfg("a:qc", 2, "2026-06-01"), cfg("b:qc", 5, "2027-01-01")],
    "2026-10-18",
  );
  assert.deepEqual(r, { "a:qc": 2 });
});

// ─── Item ────────────────────────────────────────────────────────────────────
console.log("payItems");
test("jenis sama digabung; jumlah 0 / jenis kosong dibuang", () => {
  const o = makeOrder("x", { items: [{ jenis: "seragam", qty: 10 }, { jenis: "seragam", qty: 5 }, { jenis: "polo", qty: 0 }] });
  assert.deepEqual(payItems(o), [{ jenis: "seragam", qty: 15 }]);
});
test("tanpa items → cadangan jenis_produksi + jumlah (data lama)", () => {
  const o = { ...makeOrder("x"), items: [], jenis_produksi: "permak", jumlah: 8 };
  assert.deepEqual(payItems(o), [{ jenis: "permak", qty: 8 }]);
});
test("tanpa items dan tanpa jenis → kosong", () => {
  assert.deepEqual(payItems({ items: [], jenis_produksi: null, jumlah: 0 }), []);
});

// ─── Kelayakan & tanggal ─────────────────────────────────────────────────────
console.log("kelayakan gaji");
test("produksi tuntas hanya bila Potong DAN Jahit selesai (utama)", () => {
  assert.equal(isProduksiTuntas(makeOrder("a", { done: { potong_kain: at(2026, 10, 5) } })), false);
  assert.equal(isProduksiTuntas(makeOrder("a", { done: { produksi_massal: at(2026, 10, 5) } })), false);
  assert.equal(
    isProduksiTuntas(makeOrder("a", { done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) } })),
    true,
  );
});
test("non-utama: cukup Produksi Massal", () => {
  assert.equal(isProduksiTuntas(makeOrder("n", { kategori: "non_utama", done: { produksi_massal: at(2026, 10, 9) } })), true);
});
test("bulan gaji produksi = tanggal tahap produksi TERAKHIR selesai", () => {
  const o = makeOrder("a", { done: { potong_kain: at(2026, 9, 30), produksi_massal: at(2026, 10, 2) } });
  const d = produksiTuntasAt(o);
  assert.ok(inMonth(d, 10, 2026));
  assert.ok(!inMonth(d, 9, 2026));
});
test("QC tuntas: produksi + QC lolos + packing", () => {
  const base = { potong_kain: at(2026, 10, 1), produksi_massal: at(2026, 10, 2) };
  assert.equal(isQcTuntas(makeOrder("q", { done: { ...base, qc: at(2026, 10, 3) } })), false); // belum packing
  assert.equal(isQcTuntas(makeOrder("q", { done: { ...base, qc: at(2026, 10, 3), packing: at(2026, 10, 4) } })), true);
});
test("QC gagal tidak layak", () => {
  const o = makeOrder("q", {
    done: { potong_kain: at(2026, 10, 1), produksi_massal: at(2026, 10, 2), qc: at(2026, 10, 3), packing: at(2026, 10, 4) },
    qcPassed: false,
  });
  assert.equal(isQcTuntas(o), false);
});
test("non-utama (tanpa packing): produksi + QC lolos sudah cukup", () => {
  const o = makeOrder("n", { kategori: "non_utama", done: { produksi_massal: at(2026, 10, 2), qc: at(2026, 10, 3) } });
  assert.equal(isQcTuntas(o), true);
});
test("tanggal QC = yang paling akhir antara produksi, QC, packing", () => {
  const o = makeOrder("q", {
    done: { potong_kain: at(2026, 9, 29), produksi_massal: at(2026, 9, 30), qc: at(2026, 10, 3), packing: at(2026, 10, 5) },
  });
  assert.ok(inMonth(qcTuntasAt(o), 10, 2026));
  assert.ok(inMonth(produksiTuntasAt(o), 9, 2026)); // produksi masih September
});
test("isSelesai: semua tahap selesai (tidak tergantung status)", () => {
  const all: Record<string, string> = {};
  for (const k of ["approval", "potong_kain", "produksi_massal", "qc", "packing", "pengiriman", "penerimaan"]) all[k] = at(2026, 10, 9);
  assert.equal(isSelesai(makeOrder("s", { done: all })), true);
  delete all.penerimaan;
  assert.equal(isSelesai(makeOrder("s", { done: all })), false);
});
test("batas bulan memakai tanggal LOKAL (31 Okt malam tetap Oktober)", () => {
  const o = makeOrder("m", { done: { potong_kain: at(2026, 10, 31, 23), produksi_massal: at(2026, 10, 31, 23) } });
  assert.ok(inMonth(produksiTuntasAt(o), 10, 2026));
});
test("stepAppliesTo: non-utama punya Gaji PJ, Jahit, QC — tanpa Packing", () => {
  assert.equal(stepAppliesTo("utama", "gaji_pj"), true);
  assert.equal(stepAppliesTo("non_utama", "gaji_pj"), true);
  assert.equal(stepAppliesTo("non_utama", "packing"), false);
  assert.equal(stepAppliesTo("non_utama", "produksi_massal"), true);
  assert.equal(stepAppliesTo("non_utama", "qc"), true);
  assert.equal(stepAppliesTo("utama", "packing"), true);
});

// ─── Harga satu pesanan ──────────────────────────────────────────────────────
console.log("priceProduksi / priceQc / adminBonus");
const rates = [
  cfg(rateKey("seragam", "gaji_pj"), 3500, "2026-01-01"),
  cfg(rateKey("seragam", "gaji_pj"), 4500, "2026-10-10"), // naik 10 Okt
  cfg(rateKey("seragam", "produksi_massal"), 3000, "2026-01-01"),
  cfg(rateKey("seragam", "produksi_massal"), 4000, "2026-10-10"), // naik 10 Okt
  cfg(rateKey("polo", "gaji_pj"), 3000, "2026-01-01"),
  cfg(rateKey("polo", "produksi_massal"), 2500, "2026-01-01"),
  cfg(rateKey("seragam", "qc"), 300, "2026-01-01"),
  cfg(rateKey("seragam", "packing"), 200, "2026-01-01"),
  cfg(rateKey("polo", "qc"), 250, "2026-01-01"),
  cfg(rateKey("polo", "packing"), 150, "2026-01-01"),
  // baris lama sebelum Potong Kain diganti Gaji PJ — harus DIABAIKAN
  cfg(rateKey("seragam", "potong_kain"), 1000, "2026-01-01"),
];
test("rate produksi dipilih menurut tanggal produksi TUNTAS (potong 5 Okt, jahit 12 Okt → tarif baru)", () => {
  const o = makeOrder("p", { done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 12) } });
  const pay = priceProduksi(o, buildRateBook(rates));
  assert.deepEqual(pay.lines, [{ jenis: "seragam", qty: 100, memberRate: 4000, pjRate: 4500 }]);
  assert.deepEqual(pay.missing, []);
});
test("produksi tuntas SEBELUM kenaikan → tarif lama; gaji lampau tidak ikut naik", () => {
  const o = makeOrder("p", { done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) } });
  assert.deepEqual(priceProduksi(o, buildRateBook(rates)).lines, [
    { jenis: "seragam", qty: 100, memberRate: 3000, pjRate: 3500 },
  ]);
});
test("tarif Potong Kain lama diabaikan sama sekali", () => {
  const o = makeOrder("p", { done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) } });
  const lines = splitCrew(priceProduksi(o, buildRateBook(rates)).lines, { pj: "pj", memberIds: [] });
  assert.equal(lines[0].amount, 100 * 3500); // bukan 100 × (3500 + 1000)
});
test("beberapa item: tiap jenis memakai tarifnya sendiri", () => {
  const o = makeOrder("p", {
    items: [{ jenis: "seragam", qty: 100 }, { jenis: "polo", qty: 40 }],
    done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) },
  });
  const pay = priceProduksi(o, buildRateBook(rates));
  assert.deepEqual(pay.lines, [
    { jenis: "seragam", qty: 100, memberRate: 3000, pjRate: 3500 },
    { jenis: "polo", qty: 40, memberRate: 2500, pjRate: 3000 },
  ]);
});
test("tarif belum diatur → null & ditandai di `missing` (anggota + PJ)", () => {
  const o = makeOrder("p", {
    items: [{ jenis: "celana", qty: 10 }],
    done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) },
  });
  const pay = priceProduksi(o, buildRateBook(rates));
  assert.deepEqual(pay.lines, [{ jenis: "celana", qty: 10, memberRate: null, pjRate: null }]);
  assert.deepEqual(pay.missing.sort(), ["celana:gaji_pj", "celana:produksi_massal"]);
});
test("tanpa PJ: tarif Gaji PJ yang kosong tidak ditandai kurang", () => {
  const o = makeOrder("p", {
    items: [{ jenis: "celana", qty: 10 }],
    done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) },
  });
  assert.deepEqual(priceProduksi(o, buildRateBook(rates), false).missing, ["celana:produksi_massal"]);
});
test("priceQc: qc + packing per item", () => {
  const o = makeOrder("q", {
    items: [{ jenis: "seragam", qty: 100 }, { jenis: "polo", qty: 40 }],
    done: { potong_kain: at(2026, 10, 1), produksi_massal: at(2026, 10, 2), qc: at(2026, 10, 3), packing: at(2026, 10, 4) },
  });
  assert.equal(priceQc(o, buildRateBook(rates)).total, 100 * 500 + 40 * 400);
});
test("pesanan tanpa item → noItems", () => {
  const o = { ...makeOrder("p", { done: { potong_kain: at(2026, 10, 5), produksi_massal: at(2026, 10, 9) } }), items: [], jenis_produksi: null, jumlah: 0 };
  const pay = priceProduksi(o, buildRateBook(rates));
  assert.equal(pay.noItems, true);
  assert.deepEqual(pay.lines, []);
  assert.equal(priceQc(o, buildRateBook(rates)).noItems, true);
});
test("describeLines (QC) menyebut jenis, qty, dan rate per tahap", () => {
  const o = makeOrder("p", { done: { potong_kain: at(2026, 10, 1), produksi_massal: at(2026, 10, 2), qc: at(2026, 10, 3), packing: at(2026, 10, 4) } });
  const text = describeLines(priceQc(o, buildRateBook(rates)).lines, types);
  assert.match(text, /Seragam Sekolah 100 pcs/);
  assert.match(text, /QC Rp\s?300/);
  assert.match(text, /Packing Rp\s?200/);
});
test("describeProduksi: pcs ÷ orang × tarif; PJ memakai tarif Gaji PJ", () => {
  const lines: ProduksiLine[] = [{ jenis: "seragam", qty: 100, memberRate: 3000, pjRate: 3500 }];
  assert.match(describeProduksi(lines, types, 4, "Tim"), /Seragam Sekolah 100 pcs ÷ 4 orang × Rp\s?3\.000$/);
  assert.match(describeProduksi(lines, types, 4, "PJ"), /× Rp\s?3\.500 \(Gaji PJ\)$/);
  assert.doesNotMatch(describeProduksi(lines, types, 1, "PJ"), /÷/);
  assert.match(describeProduksi([{ ...lines[0], memberRate: null }], types, 2, "Tim"), /belum diatur/);
});
test("adminBonus: closing + pcs di atas batas × per pcs", () => {
  const all: Record<string, string> = {};
  for (const k of ["approval", "potong_kain", "produksi_massal", "qc", "packing", "pengiriman", "penerimaan"]) all[k] = at(2026, 10, 9);
  const book = buildRateBook([]); // pakai nilai bawaan 10.000 / 50 / 500
  const b = adminBonus(makeOrder("a", { items: [{ jenis: "seragam", qty: 120 }], done: all }), book);
  assert.deepEqual(b, { amount: 10000 + 70 * 500, base: 10000, limit: 50, perPcs: 500, extraPcs: 70 });
  const small = adminBonus(makeOrder("a", { items: [{ jenis: "seragam", qty: 30 }], done: all }), book);
  assert.equal(small.amount, 10000); // di bawah batas → hanya closing
  assert.equal(small.extraPcs, 0);
});

// ─── PJ + tim ────────────────────────────────────────────────────────────────
console.log("splitCrew / crewOf");
const L = (qty: number, memberRate: number | null, pjRate: number | null, jenis = "seragam"): ProduksiLine => ({
  jenis,
  qty,
  memberRate,
  pjRate,
});
/** Gaji tepat (pecahan) satu orang — dasar uji jumlah. */
const exactPay = (lines: ProduksiLine[], n: number, isPj: boolean) =>
  lines.reduce((a, l) => a + (l.qty * ((isPj ? l.pjRate : l.memberRate) ?? 0)) / n, 0);

test("PJ + 3 anggota: pcs dibagi rata 4 orang; anggota tarif Jahit, PJ tarif Gaji PJ (tanpa 70:30)", () => {
  const r = splitCrew([L(120, 3000, 3600)], { pj: "pj", memberIds: ["pj", "a", "b", "c"] });
  assert.equal(r.length, 4);
  assert.deepEqual(r[0], { userId: "pj", role: "PJ", amount: 108_000, pcs: 30 }); // 30 pcs × 3.600
  assert.deepEqual(r.slice(1).map((s) => s.amount), [90_000, 90_000, 90_000]); // 30 pcs × 3.000
  assert.ok(r.slice(1).every((s) => s.role === "Tim" && s.pcs === 30));
});
test("tarif PJ = tarif anggota → semua orang menerima sama rata", () => {
  const r = splitCrew([L(100, 3000, 3000)], { pj: "pj", memberIds: ["a", "b", "c"] });
  assert.deepEqual(r.map((s) => s.amount), [75_000, 75_000, 75_000, 75_000]);
});
test("PJ + anggota: PJ yang juga anggota tim tidak dihitung dua kali", () => {
  const r = splitCrew([L(100, 3000, 3500)], { pj: "pj", memberIds: ["pj", "a"] });
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((s) => s.userId), ["pj", "a"]);
});
test("jumlah semua bagian = Σ gaji tepat dibulatkan (tak ada Rupiah hilang/lebih)", () => {
  for (const qty of [1, 7, 99, 101, 1_001]) {
    for (const helpers of [0, 1, 2, 3, 6]) {
      const lines = [L(qty, 2_750, 3_333), L(qty + 3, 1_999, 2_501, "polo")];
      const ids = Array.from({ length: helpers }, (_, i) => `m${i}`);
      const n = helpers + 1;
      const expected = Math.round(exactPay(lines, n, true) + helpers * exactPay(lines, n, false));
      const r = splitCrew(lines, { pj: "pj", memberIds: ids });
      assert.equal(sum(r.map((s) => s.amount)), expected, `qty ${qty} helpers ${helpers}`);
      assert.ok(r.every((s) => Number.isInteger(s.amount) && s.amount >= 0));
    }
  }
});
test("PJ tanpa tim → PJ menggarap semua pcs dengan tarif PJ", () => {
  assert.deepEqual(splitCrew([L(100, 3000, 3500)], { pj: "pj", memberIds: [] }), [
    { userId: "pj", role: "PJ", amount: 350_000, pcs: 100 },
  ]);
});
test("PJ adalah satu-satunya anggota tim → tetap menggarap semua pcs", () => {
  assert.deepEqual(splitCrew([L(100, 3000, 3500)], { pj: "pj", memberIds: ["pj"] }), [
    { userId: "pj", role: "PJ", amount: 350_000, pcs: 100 },
  ]);
});
test("tanpa PJ, ada tim → semua anggota memakai tarif anggota", () => {
  const r = splitCrew([L(100, 3000, 3500)], { pj: null, memberIds: ["a", "b", "c"] });
  assert.deepEqual(r.map((s) => s.amount), [100_000, 100_000, 100_000]);
  assert.ok(r.every((s) => s.role === "Tim"));
});
test("tanpa PJ dan tanpa tim → kosong (ditandai peringatan di laporan)", () => {
  assert.deepEqual(splitCrew([L(100, 3000, 3500)], { pj: null, memberIds: [] }), []);
});
test("tarif belum diatur (null) dihitung Rp0, bukan error", () => {
  const r = splitCrew([L(100, 3000, null)], { pj: "pj", memberIds: ["a"] });
  assert.equal(r[0].amount, 0); // PJ: tarif Gaji PJ belum diatur
  assert.equal(r[1].amount, 150_000); // anggota: 50 pcs × 3.000
  const none = splitCrew([L(100, null, null)], { pj: "pj", memberIds: ["a"] });
  assert.deepEqual(none.map((s) => s.amount), [0, 0]);
});
test("tanpa item → semua Rp0 tetapi orangnya tetap tercatat", () => {
  const r = splitCrew([], { pj: "pj", memberIds: ["a"] });
  assert.deepEqual(r.map((s) => [s.userId, s.amount]), [["pj", 0], ["a", 0]]);
});
test("anggota ganda di daftar tidak dibayar dua kali", () => {
  const r = splitCrew([L(100, 3000, 3000)], { pj: null, memberIds: ["a", "a", "b"] });
  assert.equal(r.length, 2);
  assert.equal(sum(r.map((s) => s.amount)), 300_000); // 2 orang × 50 pcs × Rp3.000
});
test("crewOf: salinan database menang atas tim sekarang (tim diubah → gaji lama tetap)", () => {
  const teams = [{ id: "t1", member_ids: ["x", "y", "z"] }]; // tim SEKARANG
  const frozen = makeOrder("c", {
    team_id: "t1",
    assigned_to: "pj-baru",
    crew_snapshot: { pj: "pj-lama", team_id: "t1", member_ids: ["a", "b"] },
  });
  const crew = crewOf(frozen, teams);
  assert.deepEqual(crew, { pj: "pj-lama", memberIds: ["a", "b"], source: "snapshot" });
});
test("crewOf: tanpa salinan → cadangan dari pesanan & tim sekarang, ditandai live", () => {
  const teams = [{ id: "t1", member_ids: ["x", "y"] }];
  assert.deepEqual(crewOf(makeOrder("c", { team_id: "t1", assigned_to: "p" }), teams), {
    pj: "p",
    memberIds: ["x", "y"],
    source: "live",
  });
  // tim sudah dihapus → anggota kosong
  assert.deepEqual(crewOf(makeOrder("c", { team_id: "hilang", assigned_to: "p" }), teams).memberIds, []);
});

// ─── Laporan bulanan (gabungan) ──────────────────────────────────────────────
console.log("buildSalaryReport");
const users = [
  { id: "pj1", name: "Pak Joko", role: "produksi" },
  { id: "pj2", name: "Bu Sari", role: "produksi" },
  { id: "m1", name: "Andi", role: "produksi" },
  { id: "m2", name: "Budi", role: "produksi" },
  { id: "qc1", name: "Citra", role: "qc" },
  { id: "qc2", name: "Dewi", role: "qc" },
  { id: "adm", name: "Eka", role: "admin" },
  { id: "spv", name: "Fajar", role: "supervisor" },
];
const teams = [{ id: "t1", member_ids: ["m1", "m2"] }];
const FULL = (m: number, d: number) => ({
  approval: at(2026, m, d),
  potong_kain: at(2026, m, d),
  produksi_massal: at(2026, m, d),
  qc: at(2026, m, d + 1),
  packing: at(2026, m, d + 1),
  pengiriman: at(2026, m, d + 2),
  penerimaan: at(2026, m, d + 3),
});
const report = (orders: Order[], over: Partial<Parameters<typeof buildSalaryReport>[0]> = {}) =>
  buildSalaryReport({ orders, users, teams, types, configs: rates, month: 10, year: 2026, ...over });

test("satu pesanan: pcs dibagi rata 3 orang; PJ tarif Gaji PJ, anggota tarif Jahit", () => {
  const o = makeOrder("o1", {
    done: FULL(10, 6),
    assigned_to: "pj1",
    team_id: "t1",
    created_by: "adm",
    crew_snapshot: { pj: "pj1", team_id: "t1", member_ids: ["m1", "m2"] },
  });
  const r = report([o]);
  // 100 pcs ÷ 3 orang; tarif sebelum kenaikan 10 Okt: PJ 3.500, anggota 3.000
  // PJ 33,33 pcs × 3.500 = 116.666,67 · anggota 33,33 pcs × 3.000 = 100.000 → total 316.667 (sisa ke PJ)
  assert.equal(r.produksiTotal, 316_667);
  assert.equal(r.produksi.pj1.total, 116_667);
  assert.equal(r.produksi.m1.total, 100_000);
  assert.equal(r.produksi.m2.total, 100_000);
  assert.equal(r.produksi.pj1.rows[0].role, "PJ");
  assert.equal(r.produksi.m1.rows[0].role, "Tim");
  assert.equal(r.produksi.pj1.orders, 1);
  assert.equal(r.produksi.pj1.rows[0].qty, 33); // bagian pcs PJ (dibulatkan untuk tampilan)
  assert.match(r.produksi.pj1.rows[0].detail, /÷ 3 orang × Rp\s?3\.500 \(Gaji PJ\)/);
  assert.match(r.produksi.m1.rows[0].detail, /÷ 3 orang × Rp\s?3\.000$/);
  assert.deepEqual(r.warnings, []);
});
test("tarif sama untuk PJ & anggota → gaji sama rata", () => {
  const same = rates.filter((c) => !c.key_name.startsWith("seragam:gaji_pj")).concat(
    cfg(rateKey("seragam", "gaji_pj"), 3000, "2026-01-01"),
  );
  const o = makeOrder("o1", {
    items: [{ jenis: "seragam", qty: 90 }],
    done: FULL(10, 6),
    assigned_to: "pj1",
    crew_snapshot: { pj: "pj1", team_id: "t1", member_ids: ["m1", "m2"] },
  });
  const r = report([o], { configs: same });
  assert.deepEqual([r.produksi.pj1.total, r.produksi.m1.total, r.produksi.m2.total], [90_000, 90_000, 90_000]);
});
test("tarif Potong Kain lama tidak ikut dihitung dalam gaji", () => {
  const o = makeOrder("o1", { done: FULL(10, 6), assigned_to: "pj1", crew_snapshot: { pj: "pj1", team_id: null, member_ids: [] } });
  assert.equal(report([o]).produksi.pj1.total, 100 * 3500); // PJ sendiri: 100 pcs × Gaji PJ
});
test("pool QC dibagi rata ke SEMUA user ber-role qc (qty × (qc + packing))", () => {
  const o = makeOrder("o1", { done: FULL(10, 6), assigned_to: "pj1" });
  const r = report([o]);
  assert.equal(r.qc.poolTotal, 100 * 500);
  assert.deepEqual(r.qc.members, ["qc1", "qc2"]);
  assert.equal(r.qc.perMember.qc1.total, 25_000);
  assert.equal(r.qc.perMember.qc2.total, 25_000);
  assert.equal(r.qcTotal, 50_000);
  assert.equal(r.qc.orderCount, 1);
  assert.equal(r.qc.qty, 100);
});
test("pool QC ganjil: sisa Rupiah tetap terbagi habis & adil di banyak pesanan", () => {
  const orders = Array.from({ length: 9 }, (_, i) =>
    makeOrder(`q${i}`, { items: [{ jenis: "polo", qty: 1 }], done: FULL(10, 6), assigned_to: "pj1" }),
  );
  const three = [...users, { id: "qc3", name: "Gina", role: "qc" }];
  const r = report(orders, { users: three });
  assert.equal(r.qc.poolTotal, 9 * 400); // polo: 250 + 150
  const totals = r.qc.members.map((id) => r.qc.perMember[id].total);
  assert.equal(sum(totals), 3600);
  assert.deepEqual(totals, [1200, 1200, 1200]);
  // 7 pesanan × Rp400 ÷ 3 → tidak habis dibagi, tetap jumlahnya pas
  const r7 = report(orders.slice(0, 7), { users: three });
  assert.equal(sum(r7.qc.members.map((id) => r7.qc.perMember[id].total)), 7 * 400);
});
// ─── Gaji admin bulanan (seperti Sablon: gaji tetap + closing pilihan + bonus manual) ─────────────
console.log("gaji admin bulanan");
const fx = (id: number, user_id: string, amount: number, effective_date: string) => ({ id, user_id, amount, effective_date });
const closing = (id: number, user_id: string, order_id: string, month = 10, year = 2026) => ({
  id,
  user_id,
  order_id,
  period_month: month,
  period_year: year,
});
const bonus = (id: number, user_id: string, label: string, amount: number, month = 10, year = 2026) => ({
  id,
  user_id,
  label,
  amount,
  period_month: month,
  period_year: year,
});
const usersTwoAdmins = [...users, { id: "adm2", name: "Gita", role: "produksi", roles: ["produksi", "admin"] }];

test("fixedSalaryAt: riwayat menurut tanggal, seri di tanggal sama → id terbesar, sebelum baris pertama → 0", () => {
  const rows = [
    fx(1, "adm", 2_000_000, "2026-01-01"),
    fx(2, "adm", 2_500_000, "2026-10-01"),
    fx(3, "adm", 2_600_000, "2026-10-01"), // koreksi di tanggal yang sama
    fx(4, "adm", 3_000_000, "2026-11-01"),
    fx(5, "lain", 9_999_999, "2026-01-01"),
  ];
  assert.equal(fixedSalaryAt(rows, "adm", "2025-12-31"), 0);
  assert.equal(fixedSalaryAt(rows, "adm", "2026-09-30"), 2_000_000); // bulan lalu tidak ikut naik
  assert.equal(fixedSalaryAt(rows, "adm", "2026-10-31"), 2_600_000);
  assert.equal(fixedSalaryAt(rows, "adm", "2026-11-30"), 3_000_000);
  assert.equal(fixedSalaryAt(rows, "belum-ada", "2026-10-31"), 0);
});
test("admin muncul & digaji bulanan TANPA closing sama sekali (tak perlu close order)", () => {
  const r = report([], { adminData: { fixed: [fx(1, "adm", 2_500_000, "2026-01-01")], closings: [], bonuses: [] } });
  assert.deepEqual(Object.keys(r.admin), ["adm"]);
  assert.equal(r.admin.adm.total, 2_500_000);
  assert.equal(r.admin.adm.fixed, 2_500_000);
  assert.equal(r.admin.adm.closingTotal, 0);
  assert.equal(r.adminTotal, 2_500_000);
  assert.deepEqual(r.admin.adm.rows.map((x) => [x.label, x.amount]), [["Gaji tetap", 2_500_000]]);
  assert.equal(r.admin.adm.rows[0].qty, undefined);
});
test("semua user ber-role admin tampil (juga yang multi-role); non-admin tidak", () => {
  const r = report([], { users: usersTwoAdmins });
  assert.deepEqual(Object.keys(r.admin).sort(), ["adm", "adm2"]);
  assert.equal(r.admin.spv, undefined);
});
test("pembuat pesanan ber-role admin TIDAK lagi otomatis dapat bonus (harus dipilih sebagai closing)", () => {
  const o = makeOrder("a1", { items: [{ jenis: "seragam", qty: 120 }], done: FULL(10, 6), assigned_to: "pj1", created_by: "adm" });
  const r = report([o], { adminData: { fixed: [fx(1, "adm", 1_000_000, "2026-01-01")], closings: [], bonuses: [] } });
  assert.equal(r.admin.adm.total, 1_000_000);
});
test("gaji = gaji tetap + bonus closing pilihan + bonus manual; baris slip menjumlah ke total", () => {
  const o = makeOrder("a1", { items: [{ jenis: "seragam", qty: 120 }], done: FULL(10, 6), assigned_to: "pj1" });
  const r = report([o], {
    adminData: {
      fixed: [fx(1, "adm", 2_000_000, "2026-01-01")],
      closings: [closing(7, "adm", "a1")],
      bonuses: [bonus(3, "adm", "Lembur", 150_000), bonus(4, "adm", "Target", 50_000)],
    },
  });
  const a = r.admin.adm;
  assert.equal(a.closingTotal, 10_000 + 70 * 500); // Rp10.000 + 70 pcs di atas 50 × Rp500
  assert.equal(a.manualTotal, 200_000);
  assert.equal(a.total, 2_000_000 + 45_000 + 200_000);
  assert.equal(a.orders, 1);
  assert.equal(a.qty, 120);
  assert.deepEqual(a.closings.map((c) => [c.id, c.kode, c.bonus, c.counted]), [[7, o.kode_produksi, 45_000, true]]);
  assert.equal(sum(a.rows.map((x) => x.amount)), a.total);
  assert.equal(r.adminTotal, a.total);
});
test("closing yang pesanannya belum selesai / selesai di bulan lain / di Sampah / hilang → Rp0, ditandai tidak dihitung", () => {
  const sept = makeOrder("s", { done: FULL(9, 10), assigned_to: "pj1" });
  const unfinished = makeOrder("u", { done: { approval: at(2026, 10, 3) }, assigned_to: "pj1" });
  const trash = makeOrder("t", { done: FULL(10, 6), assigned_to: "pj1", deleted_at: at(2026, 10, 15) });
  const r = report([sept, unfinished, trash], {
    adminData: {
      fixed: [],
      closings: [closing(1, "adm", "s"), closing(2, "adm", "u"), closing(3, "adm", "t"), closing(4, "adm", "hilang")],
      bonuses: [],
    },
  });
  assert.equal(r.admin.adm.closingTotal, 0);
  assert.equal(r.admin.adm.total, 0);
  assert.deepEqual(r.admin.adm.closings.map((c) => c.counted), [false, false, false, false]);
  assert.equal(r.admin.adm.orders, 0);
  assert.deepEqual(r.admin.adm.rows, []);
});
test("closing, bonus manual, dan gaji tetap milik orang/bulan lain tidak tercampur", () => {
  const o = makeOrder("a1", { done: FULL(10, 6), assigned_to: "pj1" });
  const r = report([o], {
    users: usersTwoAdmins,
    adminData: {
      fixed: [fx(1, "adm", 1_000_000, "2026-01-01"), fx(2, "adm2", 1_500_000, "2026-01-01")],
      closings: [closing(1, "adm", "a1"), closing(2, "adm2", "a1", 9)], // yang kedua periode September
      bonuses: [bonus(1, "adm2", "Bulan lalu", 77_000, 9), bonus(2, "adm2", "Bulan ini", 25_000)],
    },
  });
  assert.equal(r.admin.adm.total, 1_000_000 + 35_000); // 100 pcs → Rp10.000 + 50 × Rp500
  assert.equal(r.admin.adm2.total, 1_500_000 + 25_000);
  assert.equal(r.admin.adm2.closings.length, 0);
  assert.equal(r.adminTotal, r.admin.adm.total + r.admin.adm2.total);
});
test("closingCandidates: hanya pesanan selesai bulan ini yang belum jadi closing, terurut tanggal selesai", () => {
  const a = makeOrder("a", { items: [{ jenis: "seragam", qty: 60 }], done: FULL(10, 8), assigned_to: "pj1" });
  const b = makeOrder("b", { done: FULL(10, 2), assigned_to: "pj1" });
  const taken = makeOrder("c", { done: FULL(10, 4), assigned_to: "pj1" });
  const sept = makeOrder("d", { done: FULL(9, 4), assigned_to: "pj1" });
  const open = makeOrder("e", { done: { approval: at(2026, 10, 3) }, assigned_to: "pj1" });
  const trash = makeOrder("f", { done: FULL(10, 5), assigned_to: "pj1", deleted_at: at(2026, 10, 15) });
  const list = closingCandidates([a, b, taken, sept, open, trash], [closing(1, "adm", "c")], rates, 10, 2026);
  assert.deepEqual(list.map((x) => x.order.id), ["b", "a"]); // b selesai lebih dulu
  assert.equal(list[1].bonus, 10_000 + 10 * 500); // 60 pcs → 10 di atas batas
});
test("gaji admin yang sudah ditandai lunas tidak ikut berubah bila gaji tetap bulan depan naik", () => {
  const rows = [fx(1, "adm", 2_000_000, "2026-01-01")];
  const before = report([], { adminData: { fixed: rows, closings: [], bonuses: [] } }).admin.adm.total;
  const after = report([], { adminData: { fixed: [...rows, fx(2, "adm", 9_000_000, "2026-11-01")], closings: [], bonuses: [] } }).admin.adm.total;
  assert.equal(after, before);
});
test("pesan galat gaji admin: migration belum dijalankan, closing ganda, tak punya izin", () => {
  assert.match(adminSalaryErrorMessage({ code: "42P01", message: 'relation "salary_fixed" does not exist' }), /008_admin_salary\.sql/);
  assert.match(adminSalaryErrorMessage({ code: "PGRST205", message: "Could not find the table 'public.salary_closings' in the schema cache" }), /008_admin_salary\.sql/);
  assert.match(adminSalaryErrorMessage({ code: "23505", message: "duplicate key" }), /sudah dicatat sebagai closing/);
  assert.match(adminSalaryErrorMessage({ code: "42501", message: "new row violates row-level security policy" }), /izin/);
  assert.match(adminSalaryErrorMessage({ code: "23514", message: "check constraint" }), /Nilai tidak valid/);
});
test("pesanan di bulan lain tidak ikut; pesanan di Sampah tidak ikut", () => {
  const sept = makeOrder("s", { done: FULL(9, 10), assigned_to: "pj1" });
  const trash = makeOrder("t", { done: FULL(10, 6), assigned_to: "pj1", deleted_at: at(2026, 10, 15) });
  const okt = makeOrder("k", { done: FULL(10, 6), assigned_to: "pj1" });
  const r = report([sept, trash, okt]);
  assert.equal(r.produksi.pj1.orders, 1);
  assert.equal(r.produksi.pj1.rows[0].orderId, "k");
  const rSept = report([sept, trash, okt], { month: 9 });
  assert.equal(rSept.produksi.pj1.orders, 1);
  assert.equal(rSept.produksi.pj1.rows[0].orderId, "s");
});
test("produksi selesai September tapi QC Oktober → gaji produksi September, gaji QC Oktober", () => {
  const o = makeOrder("x", {
    done: {
      potong_kain: at(2026, 9, 29), produksi_massal: at(2026, 9, 30),
      qc: at(2026, 10, 2), packing: at(2026, 10, 3),
    },
    assigned_to: "pj1",
  });
  assert.equal(report([o], { month: 9 }).produksi.pj1.orders, 1);
  assert.equal(report([o], { month: 9 }).qc.orderCount, 0);
  assert.equal(report([o], { month: 10 }).produksi.pj1, undefined);
  assert.equal(report([o], { month: 10 }).qc.orderCount, 1);
});
test("pesanan belum tuntas produksi tidak digaji", () => {
  const o = makeOrder("x", { done: { potong_kain: at(2026, 10, 5) }, assigned_to: "pj1" });
  const r = report([o]);
  assert.deepEqual(r.produksi, {});
  assert.equal(r.produksiTotal, 0);
});
test("QC revisi: produksi dibuka lagi → keluar dari gaji sampai selesai ulang", () => {
  const o = makeOrder("x", {
    done: { potong_kain: at(2026, 10, 1), qc: at(2026, 10, 3) }, // produksi_massal di-reset
    assigned_to: "pj1",
  });
  const r = report([o]);
  assert.deepEqual(r.produksi, {});
  assert.equal(r.qc.orderCount, 0);
});
test("peringatan: tanpa PJ/tim, tanpa PJ saja, rate belum diatur, tanpa salinan", () => {
  const noCrew = makeOrder("n1", { done: FULL(10, 6) });
  const noPj = makeOrder("n5", { done: FULL(10, 6), crew_snapshot: { pj: null, team_id: "t1", member_ids: ["m1"] } });
  const noRate = makeOrder("n2", { items: [{ jenis: "celana", qty: 10 }], done: FULL(10, 6), assigned_to: "pj1" });
  const live = makeOrder("n3", { done: FULL(10, 6), assigned_to: "pj1" }); // tanpa crew_snapshot
  const frozen = makeOrder("n4", {
    done: FULL(10, 6),
    crew_snapshot: { pj: "pj1", team_id: null, member_ids: [] },
  });
  const r = report([noCrew, noRate, live, frozen, noPj]);
  const by = Object.fromEntries(r.warnings.map((w) => [w.orderId, w.problems.join(" | ")]));
  assert.match(by.n1, /Belum ada PJ atau tim/);
  assert.match(by.n2, /Rate belum diatur: .*Gaji PJ/);
  assert.match(by.n2, /Rate belum diatur: .*Jahit \/ Produksi/);
  assert.match(by.n5, /Belum ada PJ, semua anggota tim digaji dengan tarif anggota/);
  assert.equal(r.produksi.m1.rows.some((row) => row.orderId === "n5"), true); // tetap digaji
  assert.match(by.n3, /belum ada salinan/);
  assert.equal(by.n4, undefined); // salinan ada + PJ ada + rate ada → bersih
  // pesanan tanpa PJ/tim tidak menghasilkan baris gaji siapa pun
  assert.ok(!Object.values(r.produksi).some((p) => p.rows.some((row) => row.orderId === "n1")));
});
test("tanpa anggota tim QC: pool tidak dihitung sebagai pengeluaran + ditandai", () => {
  const o = makeOrder("o", { done: FULL(10, 6), assigned_to: "pj1" });
  const noQc = users.filter((u) => u.role !== "qc");
  const r = report([o], { users: noQc });
  assert.equal(r.noQcMembers, true);
  assert.equal(r.qc.poolTotal, 50_000);
  assert.equal(r.qcTotal, 0);
});
test("user dengan banyak role: role qc + produksi sama-sama dihitung", () => {
  const multi = users.map((u) => (u.id === "m1" ? { ...u, role: "produksi", roles: ["produksi", "qc"] } : u));
  const o = makeOrder("o", { done: FULL(10, 6), assigned_to: "pj1" });
  const r = report([o], { users: multi });
  assert.ok(r.qc.members.includes("m1"));
  assert.equal(r.qc.members.length, 3);
});
test("salinan tim: anggota tim diganti SESUDAH selesai → gaji pesanan lama tidak berubah", () => {
  const frozen = makeOrder("o", {
    done: FULL(10, 6),
    team_id: "t1",
    assigned_to: "pj1",
    crew_snapshot: { pj: "pj1", team_id: "t1", member_ids: ["m1", "m2"] },
  });
  const before = report([frozen]);
  const after = report([frozen], { teams: [{ id: "t1", member_ids: ["m1", "m2", "pj2"] }] }); // pj2 baru masuk tim
  assert.deepEqual(after.produksi, before.produksi);
  assert.equal(after.produksi.pj2, undefined);
});
test("menaikkan rate hari ini tidak mengubah gaji bulan lalu", () => {
  const o = makeOrder("o", { done: FULL(10, 6), assigned_to: "pj1" });
  const before = report([o]);
  const raised = [...rates, cfg(rateKey("seragam", "produksi_massal"), 9000, "2026-10-18")];
  assert.deepEqual(report([o], { configs: raised }).produksi, before.produksi);
});
test("tidak ada pesanan → laporan kosong, tidak error", () => {
  const r = report([]);
  assert.deepEqual(r.produksi, {});
  // semua user ber-role admin tetap tampil walau Rp0
  assert.deepEqual(Object.keys(r.admin), ["adm"]);
  assert.equal(r.admin.adm.total, 0);
  assert.equal(r.produksiTotal + r.qcTotal + r.adminTotal, 0);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.noQcMembers, false);
});
test("semua baris slip menjumlah ke total orang itu", () => {
  const orders = [
    makeOrder("o1", { done: FULL(10, 6), assigned_to: "pj1", team_id: "t1" }),
    makeOrder("o2", { items: [{ jenis: "seragam", qty: 33 }, { jenis: "polo", qty: 17 }], done: FULL(10, 7), assigned_to: "pj1", team_id: "t1" }),
  ];
  const r = report(orders);
  for (const p of [...Object.values(r.produksi), ...Object.values(r.qc.perMember), ...Object.values(r.admin)]) {
    assert.equal(sum(p.rows.map((row) => row.amount)), p.total);
  }
});
test("jumlah semua orang produksi = Σ gaji tepat tiap pesanan dibulatkan (tidak ada Rupiah hilang)", () => {
  const orders = Array.from({ length: 6 }, (_, i) =>
    makeOrder(`o${i}`, { items: [{ jenis: "seragam", qty: 13 + i }, { jenis: "polo", qty: 7 + i }], done: FULL(10, 6), assigned_to: "pj1", team_id: "t1" }),
  );
  // PJ + m1 + m2 = 3 orang; tarif sebelum 10 Okt: seragam PJ 3.500 / anggota 3.000, polo PJ 3.000 / anggota 2.500
  const expected = sum(
    orders.map((o, i) => {
      const [q1, q2] = [13 + i, 7 + i];
      return Math.round((q1 * (3500 + 2 * 3000) + q2 * (3000 + 2 * 2500)) / 3);
    }),
  );
  const r = report(orders);
  assert.equal(r.produksiTotal, expected);
  assert.equal(sum(Object.values(r.produksi).map((p) => p.total)), expected);
});

console.log("pesan galat");
test("tabel/fungsi belum ada → menunjuk migration 007", () => {
  assert.match(pricingErrorMessage({ code: "42P01" }), /007_pricing_salary/);
  assert.match(pricingErrorMessage({ code: "PGRST205", message: "Could not find the table" }), /007/);
  assert.match(salaryErrorMessage({ code: "PGRST202" }), /007/);
});
test("izin ditolak & nilai tidak valid & bentrok lunas", () => {
  assert.match(pricingErrorMessage({ code: "42501" }), /izin/);
  assert.match(pricingErrorMessage({ message: "new row violates row-level security policy" }), /izin/);
  assert.match(pricingErrorMessage({ code: "23514" }), /bilangan bulat/);
  assert.match(salaryErrorMessage({ code: "23505" }), /sudah ditandai lunas/);
  assert.match(salaryErrorMessage({ code: "42501" }), /izin/);
});
test("galat lain: pesan asli dipertahankan; kosong → pesan umum", () => {
  assert.equal(salaryErrorMessage({ message: "boom" }), "boom");
  assert.match(salaryErrorMessage(null), /tak dikenal/);
});

console.log(`\n${passed} uji lulus`);
