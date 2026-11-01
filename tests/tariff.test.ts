// tests/tariff.test.ts — uji kelompok ukuran + biaya tambahan varian (lib/finance/tariff.ts) dan integrasinya ke
// calcInvoice / invoiceIsStale / initialPrices / initialTierPrices. Harga dasar per kelompok diisi PER PESANAN
// (tierPrices), bukan disimpan di kelompok.
// Jalankan: npx tsx tests/tariff.test.ts
import assert from "node:assert/strict";
import { calcInvoice, invoiceIsStale } from "../lib/finance/pricing";
import { initialPrices, initialTierPrices } from "../lib/finance/view";
import { alignRincian, cleanItems, normalizeRincianVarian, splitLegacyVarian, validateItems, varianLabel, VARIAN_MODEL_CATALOG } from "../lib/orderItems";
import { groupKey, keywordMatchesVarian, parseSizes, deriveAddonKeywords, suggestTiers, sanitizeTariffInput, tariffActive, tariffGroups, type Tariff, type TariffTier } from "../lib/finance/tariff";
import type { OrderItem } from "../types/order";

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

let tierSeq = 0;
const tier = (jenis: string, label: string, ukuran: string[], varian: string | null = null): TariffTier => ({
  id: `t${++tierSeq}`, jenis_produksi: jenis, varian, label, ukuran,
});

const tariff: Tariff = {
  tiers: [
    tier("kaos_polos", "S & M", ["S", "M"]),
    tier("kaos_polos", "L & XL", ["L", "XL"]),
    tier("kaos_polos", "XXL", ["XXL"]),
    tier("kaos_polos", "3XL", ["3XL"]),
    tier("celana_sekolah", "21–25", parseSizes("21-25")),
    tier("celana_sekolah", "26–30", parseSizes("26-30")),
    tier("celana_training", "S & M", ["S", "M"], "Panjang"),
    tier("celana_training", "S & M", ["S", "M"], "Pendek"),
    tier("celana_training", "L & XL", ["L", "XL"]), // umum
  ],
  addons: [
    { jenis_produksi: "kaos_polos", keyword: "lengan panjang", label: "Lengan panjang", tambahan: 5_000 },
    { jenis_produksi: "kaos_polos", keyword: "rib", label: "Rib", tambahan: 3_000 },
  ],
};

/** Kunci harga untuk (item, varian, label kelompok) — sama dengan yang dipakai form tagihan. */
const gk = (jenis: string, varian: string, label: string, tierVarian: string | null = null): string => {
  const t = tariff.tiers.find((x) => x.jenis_produksi === jenis && x.label === label && (x.varian ?? null) === tierVarian)!;
  return groupKey(varian, t);
};
/** Susun { id item: { kunci: harga } } */
const tp = (itemId: string, entries: [string, number][]) => ({ [itemId]: Object.fromEntries(entries) });

const kaos = (rincian: { varian: string; ukuran: [string, number][] }[]): OrderItem => ({
  id: "k1",
  jenis_produksi: "kaos_polos",
  jumlah: rincian.reduce((n, r) => n + r.ukuran.reduce((m, [, q]) => m + q, 0), 0),
  rincian: rincian.map((r, i) => ({ id: `r${i}`, varian: r.varian, ukuran: r.ukuran.map(([ukuran, jumlah]) => ({ ukuran, jumlah })) })),
});

console.log("harga per kelompok ukuran (diisi per pesanan)");
test("S & M satu harga, L & XL satu harga, XXL sendiri — harga dari form tagihan", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 10], ["M", 5], ["L", 4], ["XL", 6], ["XXL", 2]] }]);
  const prices = tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000], [gk("kaos_polos", "", "L & XL"), 55_000], [gk("kaos_polos", "", "XXL"), 60_000]]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, prices);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.calc.lines.length, 3);
  assert.deepEqual(r.calc.lines.map((l) => [l.jumlah, l.harga_per_pcs]), [[15, 50_000], [10, 55_000], [2, 60_000]]);
  assert.equal(r.calc.subtotal, 15 * 50_000 + 10 * 55_000 + 2 * 60_000);
  assert.equal(r.calc.totalPcs, 27);
});
test("kelompok ukuran sama, pesanan berbeda → harga berbeda (inti perbaikan)", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 10]] }]);
  const key = gk("kaos_polos", "", "S & M");
  const a = calcInvoice([it], {}, 0, undefined, tariff, tp("k1", [[key, 50_000]]));
  const b = calcInvoice([it], {}, 0, undefined, tariff, tp("k1", [[key, 65_000]]));
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.deepEqual([a.calc.subtotal, b.calc.subtotal], [500_000, 650_000]);
});
test("harga kelompok yang belum diisi (atau 0) ditolak dengan pesan jelas", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 1], ["L", 1]] }]);
  const only = tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000]]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, only);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /L & XL.*belum diisi/);
  assert.equal(calcInvoice([it], {}, 0, undefined, tariff).ok, false);
  const zero = tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000], [gk("kaos_polos", "", "L & XL"), 0]]);
  assert.equal(calcInvoice([it], {}, 0, undefined, tariff, zero).ok, false);
});
test("harga pecahan / negatif ditolak", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 1]] }]);
  const key = gk("kaos_polos", "", "S & M");
  assert.equal(calcInvoice([it], {}, 0, undefined, tariff, tp("k1", [[key, 1.5]])).ok, false);
  assert.equal(calcInvoice([it], {}, 0, undefined, tariff, tp("k1", [[key, -1]])).ok, false);
});
test("lengan panjang +5.000 semua ukuran; lengan panjang rib +8.000 (5.000 + 3.000) — ditambah ke harga yang diisi", () => {
  const it = kaos([
    { varian: "Lengan Pendek", ukuran: [["S", 1]] },
    { varian: "Lengan Panjang", ukuran: [["S", 1], ["3XL", 1]] },
    { varian: "Lengan Panjang Rib", ukuran: [["M", 1]] },
  ]);
  const prices = tp("k1", [
    [gk("kaos_polos", "Lengan Pendek", "S & M"), 50_000],
    [gk("kaos_polos", "Lengan Panjang", "S & M"), 50_000],
    [gk("kaos_polos", "Lengan Panjang", "3XL"), 65_000],
    [gk("kaos_polos", "Lengan Panjang Rib", "S & M"), 50_000],
  ]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, prices);
  assert.ok(r.ok);
  if (!r.ok) return;
  const price = (name: string) => r.calc.lines.find((l) => l.nama.includes(name))!.harga_per_pcs;
  assert.equal(price("Lengan Pendek"), 50_000);
  assert.equal(r.calc.lines.find((l) => l.nama.includes("Lengan Panjang ·") && l.nama.includes("S & M"))!.harga_per_pcs, 55_000);
  assert.equal(r.calc.lines.find((l) => l.nama.includes("3XL"))!.harga_per_pcs, 70_000);
  assert.equal(price("Rib"), 58_000);
  // baris menyimpan harga dasar & tambahan untuk mengisi ulang saat revisi
  const rib = r.calc.lines.find((l) => l.nama.includes("Rib"))!;
  assert.deepEqual([rib.harga_dasar, rib.tambahan], [50_000, 8_000]);
});
test("varian sama di dua blok rincian digabung per kelompok (satu harga)", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 2]] }, { varian: "", ukuran: [["M", 3]] }]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000]]));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.calc.lines.map((l) => l.jumlah), [5]);
});
test("ukuran tanpa kelompok ditolak dengan pesan jelas", () => {
  const r = calcInvoice([kaos([{ varian: "", ukuran: [["4XL", 1]] }])], {}, 0, undefined, tariff);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /4XL.*kelompok ukuran/);
});
test("jumlah rincian ≠ jumlah item ditolak", () => {
  const it = { ...kaos([{ varian: "", ukuran: [["S", 5]] }]), jumlah: 9 };
  assert.equal(calcInvoice([it], {}, 0, undefined, tariff, tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000]])).ok, false);
});
test("harga untuk item yang tidak ada di pesanan ditolak (rincian berubah)", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 1]] }]);
  const prices = { ...tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000]]), hilang: { x: 1 } };
  assert.equal(calcInvoice([it], {}, 0, undefined, tariff, prices).ok, false);
});
test("tariffGroups: grup per (varian × kelompok) tanpa harga, lengkap dengan tambahan", () => {
  const it = kaos([{ varian: "Lengan Panjang Rib", ukuran: [["S", 2], ["XXL", 1]] }]);
  const g = tariffGroups(it, tariff, "Kaos Polos");
  assert.ok(g.ok);
  if (g.ok) assert.deepEqual(g.groups.map((x) => [x.tier.label, x.jumlah, x.tambahan]), [["S & M", 2, 8_000], ["XXL", 1, 8_000]]);
});

console.log("celana sekolah per kelipatan lima");
test("21–25 dan 26–30 bisa beda harga", () => {
  const it: OrderItem = {
    id: "c1", jenis_produksi: "celana_sekolah", jumlah: 3,
    rincian: [{ id: "r", varian: "Biru", ukuran: [{ ukuran: "25", jumlah: 1 }, { ukuran: "26", jumlah: 2 }] }],
  };
  const prices = tp("c1", [[gk("celana_sekolah", "Biru", "21–25"), 70_000], [gk("celana_sekolah", "Biru", "26–30"), 75_000]]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, prices);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.calc.lines.map((l) => l.harga_per_pcs), [70_000, 75_000]);
});

console.log("celana olahraga panjang/pendek");
test("kelompok khusus varian didahulukan; kelompok umum untuk sisanya", () => {
  const it: OrderItem = {
    id: "t1", jenis_produksi: "celana_training", jumlah: 4,
    rincian: [
      { id: "a", varian: "Panjang", ukuran: [{ ukuran: "M", jumlah: 1 }, { ukuran: "L", jumlah: 1 }] },
      { id: "b", varian: "Pendek", ukuran: [{ ukuran: "S", jumlah: 2 }] },
    ],
  };
  const prices = tp("t1", [
    [gk("celana_training", "Panjang", "S & M", "Panjang"), 80_000],
    [gk("celana_training", "Panjang", "L & XL"), 90_000],
    [gk("celana_training", "Pendek", "S & M", "Pendek"), 60_000],
  ]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, prices);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.calc.lines.map((l) => l.harga_per_pcs), [80_000, 90_000, 60_000]);
});

console.log("campur harga manual & per kelompok");
test("item tanpa kelompok/rincian tetap pakai harga manual", () => {
  const manual: OrderItem = { id: "m1", jenis_produksi: "selempang_wisuda", jumlah: 2 };
  const auto = kaos([{ varian: "", ukuran: [["S", 1]] }]);
  const tierPrices = tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000]]);
  const r = calcInvoice([auto, manual], { k1: 0, m1: 20_000 }, 0, undefined, tariff, tierPrices);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.calc.subtotal, 50_000 + 40_000);
  assert.equal(calcInvoice([auto, manual], { k1: 0 }, 0, undefined, tariff, tierPrices).ok, false); // harga manual wajib
});
test("jenis tanpa kelompok memakai harga manual (kompatibel dengan data lama)", () => {
  const empty: Tariff = { tiers: [], addons: [] };
  assert.equal(tariffActive(empty, "kaos_polos"), false);
  assert.equal(tariffActive(tariff, "kaos_polos"), true);
  const it = kaos([{ varian: "", ukuran: [["S", 2]] }]);
  const r = calcInvoice([it], { k1: 30_000 }, 0, undefined, empty);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.calc.subtotal, 60_000);
});

console.log("tagihan usang & harga awal (revisi)");
test("banyak baris per item tidak dianggap usang bila jumlahnya cocok", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 2], ["L", 3]] }]);
  const prices = tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000], [gk("kaos_polos", "", "L & XL"), 55_000]]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, prices);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.calc.lines.length, 2);
  assert.equal(invoiceIsStale(r.calc.lines, [it]), false);
  assert.equal(invoiceIsStale(r.calc.lines, [{ ...it, jumlah: 6 }]), true);
});
test("harga satu-item awal tidak mengambil baris per kelompok; harga dasar per kelompok terisi ulang saat revisi", () => {
  const it = kaos([{ varian: "", ukuran: [["S", 2]] }]);
  const prices = tp("k1", [[gk("kaos_polos", "", "S & M"), 50_000]]);
  const r = calcInvoice([it], {}, 0, undefined, tariff, prices);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(initialPrices([it], r.calc.lines), { k1: 0 });
  assert.deepEqual(initialTierPrices([it], r.calc.lines), prices);
  // item dihapus dari pesanan → harganya tidak ikut; snapshot lama tanpa group_key diabaikan
  assert.deepEqual(initialTierPrices([], r.calc.lines), {});
  assert.deepEqual(initialTierPrices([it], [{ ...r.calc.lines[0], group_key: undefined, harga_dasar: undefined }]), {});
});

console.log("parseSizes");
test("rentang angka & daftar huruf", () => {
  assert.deepEqual(parseSizes("21-25"), ["21", "22", "23", "24", "25"]);
  assert.deepEqual(parseSizes("s, m"), ["S", "M"]);
  assert.deepEqual(parseSizes("S M 3xl"), ["S", "M", "3XL"]);
});

console.log("validasi isian daftar harga");
test("isian benar: ukuran dinormalkan (huruf besar, tanpa duplikat), kata kunci huruf kecil", () => {
  const r = sanitizeTariffInput({
    tiers: [{ varian: " ", label: " S & M ", ukuran: ["s", "M", "m"] }],
    addons: [{ keyword: "  Lengan   Panjang ", label: "Lengan panjang", tambahan: 5_000 }],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.tiers[0], { varian: null, label: "S & M", ukuran: ["S", "M"] });
    assert.equal(r.addons[0].keyword, "lengan panjang");
  }
});
test("ditolak: ukuran di dua kelompok, nama kosong, ukuran kosong; harga lama dari klien diabaikan", () => {
  const t = (over: object) => ({ label: "A", ukuran: ["S"], ...over });
  assert.equal(sanitizeTariffInput({ tiers: [t({}), t({ label: "B" })], addons: [] }).ok, false);
  const legacy = sanitizeTariffInput({ tiers: [t({ harga: 12_345 })], addons: [] });
  assert.ok(legacy.ok);
  if (legacy.ok) assert.equal("harga" in legacy.tiers[0], false);
  assert.equal(sanitizeTariffInput({ tiers: [t({ label: " " })], addons: [] }).ok, false);
  assert.equal(sanitizeTariffInput({ tiers: [t({ ukuran: [] })], addons: [] }).ok, false);
  assert.equal(sanitizeTariffInput({ tiers: [null], addons: [] }).ok, false);
  assert.equal(sanitizeTariffInput(null).ok, false);
  assert.equal(sanitizeTariffInput({ tiers: [], addons: [{ keyword: "", label: "x", tambahan: 1 }] }).ok, false);
  assert.equal(sanitizeTariffInput({ tiers: [], addons: [{ keyword: "rib", label: "Rib", tambahan: -5 }] }).ok, false);
});
test("ukuran sama boleh di kelompok berbeda bila variannya berbeda", () => {
  const r = sanitizeTariffInput({
    tiers: [
      { varian: "Panjang", label: "S & M", ukuran: ["S", "M"] },
      { varian: "Pendek", label: "S & M", ukuran: ["S", "M"] },
    ],
    addons: [],
  });
  assert.ok(r.ok);
});

console.log("saran dari Jenis Produksi");
test("kaos polos S–7XL: S&M, L&XL, lalu XXL…7XL masing-masing sendiri (6XL & 7XL ikut)", () => {
  const r = suggestTiers(["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL"]);
  assert.deepEqual(r.map((x) => x.label), ["S & M", "L & XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL"]);
});
test("celana sekolah 21–43: per kelipatan lima, ujung 41–43", () => {
  const r = suggestTiers(parseSizes("21-43"));
  assert.deepEqual(r.map((x) => x.label), ["21–25", "26–30", "31–35", "36–40", "41–43"]);
  assert.equal(r.reduce((n, x) => n + x.ukuran.length, 0), 23);
});
test("hanya salah satu dari pasangan → sendiri; ukuran tak dikenal sendiri; kosong → kosong", () => {
  assert.deepEqual(suggestTiers(["s", "L", "XL"]).map((x) => x.label), ["S", "L & XL"]);
  assert.deepEqual(suggestTiers(["ALL SIZE"]).map((x) => x.label), ["ALL SIZE"]);
  assert.deepEqual(suggestTiers([]), []);
});
test("saran dipakai langsung: semua ukuran jenis tercakup, tanpa ukuran di dua kelompok", () => {
  const sizes = ["S", "M", "L", "XL", "XXL", "3XL"];
  const sug = suggestTiers(sizes);
  const r = sanitizeTariffInput({ tiers: sug, addons: [] });
  assert.ok(r.ok);
  assert.deepEqual(sug.flatMap((x) => x.ukuran).sort(), [...sizes].sort());
});
test("varian Panjang & Pendek langsung jadi baris biaya tambahan (Lainnya dilewati, duplikat digabung)", () => {
  assert.deepEqual(deriveAddonKeywords(["Panjang", "Pendek", "Lainnya", "panjang"]).map((x) => x.keyword), ["panjang", "pendek"]);
});
test("Lengan Panjang Rib → 'lengan panjang' + 'rib' (sisa setelah kata kunci yang ada), tanpa baris dobel", () => {
  const r = deriveAddonKeywords(["Lengan Panjang Rib", "Lengan Panjang"]);
  assert.deepEqual(r.map((x) => [x.keyword, x.label]).sort(), [["lengan panjang", "Lengan Panjang"], ["rib", "Rib"]]);
  // kata kunci yang sudah tersimpan tidak dibuat ulang
  assert.deepEqual(deriveAddonKeywords(["Lengan Panjang", "Lengan Panjang Rib"], ["lengan panjang", "rib"]), []);
  assert.deepEqual(deriveAddonKeywords(["Lengan Panjang", "Lengan Panjang Rib"], ["lengan panjang"]).map((x) => x.keyword), ["rib"]);
});
test("harga varian turunan benar-benar terjumlah: Lengan Panjang Rib = lengan panjang + rib", () => {
  const t: Tariff = {
    tiers: [tier("kaos_baru", "S & M", ["S", "M"])],
    addons: deriveAddonKeywords(["Lengan Panjang", "Lengan Panjang Rib"]).map((d, i) => ({
      jenis_produksi: "kaos_baru", keyword: d.keyword, label: d.label, tambahan: i === 0 ? 5_000 : 3_000,
    })),
  };
  const it: OrderItem = { id: "n1", jenis_produksi: "kaos_baru", jumlah: 1, rincian: [{ id: "r", varian: "Lengan Panjang Rib", ukuran: [{ ukuran: "S", jumlah: 1 }] }] };
  const key = groupKey("Lengan Panjang Rib", t.tiers[0]);
  const r = calcInvoice([it], {}, 0, undefined, t, { n1: { [key]: 50_000 } });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.calc.lines[0].harga_per_pcs, 58_000);
});
test("kata kunci yang tak cocok terdeteksi", () => {
  assert.equal(keywordMatchesVarian("panjang", ["Panjang", "Pendek"]), true);
  assert.equal(keywordMatchesVarian("lengan panjang", ["Panjang", "Pendek"]), false);
  assert.equal(keywordMatchesVarian("", ["Panjang"]), false);
});

console.log("Varian 1 (model) & Varian 2 (warna)");
const celana: any = {
  id: "pt", name: "Celana Sekolah", value: "celana_sekolah", kategori: "utama", is_active: true,
  ukuran: ["S", "M"], varian: ["Panjang", "Pendek", "1/3"], varian_warna: ["Abu-abu", "Biru", "Lainnya"],
};
const blok = (varian: string | undefined, warna: string | undefined, jumlah = 1): any => ({
  id: `b${Math.random()}`, ...(varian ? { varian } : {}), ...(warna ? { warna } : {}), ukuran: [{ ukuran: "S", jumlah }],
});
const item = (rincian: any[]): any => ({ id: "i1", jenis_produksi: "celana_sekolah", jumlah: rincian.length, rincian });

test("katalog Varian 1: Lengan Panjang dan Lengan Panjang Rib terpisah; harga Rib = lengan panjang + rib", () => {
  assert.deepEqual(VARIAN_MODEL_CATALOG, ["Lengan Panjang", "Lengan Panjang Rib", "Pendek", "1/3"]);
  assert.deepEqual(deriveAddonKeywords(VARIAN_MODEL_CATALOG).map((x) => x.keyword).sort(), ["1/3", "lengan panjang", "pendek", "rib"]);
});
test("label varian = model · warna", () => {
  assert.equal(varianLabel({ varian: "Panjang", warna: "Abu-abu" }), "Panjang · Abu-abu");
  assert.equal(varianLabel({ varian: "Pendek" }), "Pendek");
  assert.equal(varianLabel({ warna: "Lainnya", warna_lain: "Hijau" }), "Lainnya: Hijau");
});
test("validasi: jenis dengan dua varian wajib pilih keduanya; kombinasi sama dua kali ditolak", () => {
  assert.match(validateItems([item([blok(undefined, "Biru")])], [celana]) ?? "", /Pilih varian/);
  assert.match(validateItems([item([blok("Panjang", undefined)])], [celana]) ?? "", /Pilih warna/);
  assert.equal(validateItems([item([blok("Panjang", "Biru"), blok("Panjang", "Abu-abu"), blok("Pendek", "Biru")])], [celana]), null);
  assert.match(validateItems([item([blok("Panjang", "Biru"), blok("Panjang", "Biru")])], [celana]) ?? "", /dua kali/);
  assert.match(validateItems([item([blok("Panjang", "Lainnya")])], [celana]) ?? "", /nama warna/);
});
test("jenis hanya punya warna (tanpa Varian 1): cukup pilih warna", () => {
  const sekolah: any = { ...celana, varian: [], varian_warna: ["Putih", "Pramuka"] };
  assert.equal(validateItems([item([blok(undefined, "Putih")])], [sekolah]), null);
});
test("cleanItems menyimpan warna & nama warna bebas", () => {
  const out = cleanItems([item([{ ...blok("Panjang", "Lainnya"), warna_lain: " Hijau " }])]);
  assert.deepEqual([out[0].rincian![0].varian, out[0].rincian![0].warna, out[0].rincian![0].warna_lain], ["Panjang", "Lainnya", "Hijau"]);
});
test("pesanan lama (warna tersimpan di varian) dipindah ke warna setelah jenis diatur ulang", () => {
  const lama = blok("Biru", undefined);
  const baru = normalizeRincianVarian(lama, celana);
  assert.deepEqual([baru.varian, baru.warna], [undefined, "Biru"]);
  assert.equal(alignRincian([lama], celana)[0].warna, "Biru");
  assert.equal(normalizeRincianVarian(blok("Panjang", undefined), celana).varian, "Panjang"); // model tetap model
  const belum: any = { ...celana, varian: ["Abu-abu", "Biru"], varian_warna: [] };
  assert.equal(normalizeRincianVarian(lama, belum).varian, "Biru"); // jenis belum diatur ulang → tidak diubah
});
test("harga tidak terpecah per warna: kombinasi model × warna digabung per model", () => {
  const tr: Tariff = { tiers: [tier("celana_sekolah", "S & M", ["S", "M"])], addons: [] };
  const it: OrderItem = {
    id: "c9", jenis_produksi: "celana_sekolah", jumlah: 3,
    rincian: [
      { id: "1", varian: "Panjang", warna: "Biru", ukuran: [{ ukuran: "S", jumlah: 1 }] },
      { id: "2", varian: "Panjang", warna: "Abu-abu", ukuran: [{ ukuran: "M", jumlah: 2 }] },
    ],
  };
  const g = tariffGroups(it, tr, "Celana Sekolah");
  assert.ok(g.ok);
  if (g.ok) assert.deepEqual(g.groups.map((x) => [x.varian, x.jumlah]), [["Panjang", 3]]);
});
test("data lama dipisah untuk form baru: warna → Varian 2, Lainnya ikut warna bila semua lainnya warna", () => {
  assert.deepEqual(splitLegacyVarian(["Abu-abu", "Pramuka", "Biru", "Lainnya"], []), { model: [], warna: ["Abu-abu", "Pramuka", "Biru", "Lainnya"] });
  assert.deepEqual(splitLegacyVarian(["Panjang", "Pendek"], []), { model: ["Panjang", "Pendek"], warna: [] });
  assert.deepEqual(splitLegacyVarian(["Panjang", "biru", "Lainnya"], []), { model: ["Panjang", "Lainnya"], warna: ["Biru"] });
  // sudah format baru → tidak dipindah lagi
  assert.deepEqual(splitLegacyVarian(["Panjang"], ["Biru"]), { model: ["Panjang"], warna: ["Biru"] });
});

console.log(`\n${passed} tes lulus`);
