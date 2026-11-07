// tests/warna_saran.test.ts — saran & penyatuan penulisan warna (lib/inventory/warna.ts).
// Jalankan: npx tsx tests/warna_saran.test.ts
import assert from "node:assert/strict";
import { skuKey } from "../lib/inventory/sku";
import {
  canonicalWarna, closestWarna, editDistance, exactWarna, normWarna, suggestWarna, tidyWarna, warnaScore, withLocalWarna,
  type WarnaOption,
} from "../lib/inventory/warna";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const opt = (warna: string, n = 1, jenis: string[] = [], stok = true): WarnaOption => ({ warna, n, jenis, stok });
const daftar = [
  opt("Hitam", 40, ["kaos_polos"]),
  opt("Putih", 30, ["kaos_polos", "kaos_polo"]),
  opt("Abu-abu", 12, ["celana"]),
  opt("Biru Dongker", 9, ["kaos_polo"]),
  opt("Hijau Botol", 4, ["kaos_polo"]),
  opt("Merah", 3, []),
];
const names = (l: WarnaOption[]) => l.map((o) => o.warna);

test("normWarna sama dengan normalisasi kunci stok", () => {
  assert.equal(normWarna("  Abu   ABU| "), "abu abu");
  assert.equal(skuKey({ jenis_produksi: "k", varian: "", warna: "  HITAM ", ukuran: "S" }), `k||${normWarna("  HITAM ")}|s`);
});
test("jarak edit: salah huruf, hilang, lebih, tertukar = 1", () => {
  assert.equal(editDistance("hitam", "hitam"), 0);
  assert.equal(editDistance("hitm", "hitam"), 1);
  assert.equal(editDistance("hittam", "hitam"), 1);
  assert.equal(editDistance("hitan", "hitam"), 1);
  assert.equal(editDistance("htiam", "hitam"), 1);
  assert.ok(editDistance("merah", "hitam", 2) > 2);
});
test("awalan: 'hi' langsung memunculkan Hitam", () => {
  assert.equal(names(suggestWarna("hi", daftar))[0], "Hitam");
  assert.deepEqual(names(suggestWarna("hi", daftar)), ["Hitam", "Hijau Botol"]); // yang paling sering dipakai di atas
});
test("salah ketik: hitm / htiam / hitan / hittam → Hitam paling atas", () => {
  for (const salah of ["hitm", "htiam", "hitan", "hittam", "HITAM"]) {
    assert.equal(names(suggestWarna(salah, daftar))[0], "Hitam", salah);
  }
});
test("kata di tengah: 'dongker' / 'botol' menemukan warna bernama dua kata", () => {
  assert.equal(names(suggestWarna("dongker", daftar))[0], "Biru Dongker");
  assert.equal(names(suggestWarna("botol", daftar))[0], "Hijau Botol");
  assert.equal(names(suggestWarna("dongkr", daftar))[0], "Biru Dongker");
});
test("beda spasi/tanda hubung dianggap sama persis: 'abu abu' = 'Abu-abu'", () => {
  assert.equal(warnaScore("abu abu", "Abu-abu"), 0);
  assert.equal(exactWarna("ABU  ABU", daftar)?.warna, "Abu-abu");
});
test("kolom kosong: jenis yang sedang diisi diutamakan, lalu paling sering dipakai", () => {
  assert.equal(names(suggestWarna("", daftar))[0], "Hitam");
  assert.deepEqual(names(suggestWarna("", daftar, { jenis: "celana", limit: 2 })), ["Abu-abu", "Hitam"]);
});
test("warna pendek tidak asal cocok: 'abu' tidak menyarankan Biru", () => {
  assert.deepEqual(names(suggestWarna("abu", daftar)), ["Abu-abu"]);
  assert.deepEqual(suggestWarna("xyz", daftar), []);
});
test("closestWarna: salah ketik atau awalan pendek ya; warna sah yang berbeda tidak", () => {
  assert.equal(closestWarna("hitm", daftar)?.warna, "Hitam");
  assert.equal(closestWarna("hi", daftar)?.warna, "Hitam");
  assert.equal(closestWarna("Hitam", daftar), null); // sudah persis
  assert.equal(closestWarna("Biru", [opt("Biru Dongker")]), null); // warna berbeda yang sah
  assert.equal(closestWarna("Kuning", daftar), null);
});
test("canonicalWarna: ejaan baku bila sudah ada, warna baru dirapikan", () => {
  assert.equal(canonicalWarna("hitam", daftar), "Hitam");
  assert.equal(canonicalWarna("  HITAM ", daftar), "Hitam");
  assert.equal(canonicalWarna("abu abu", daftar), "Abu-abu");
  assert.equal(canonicalWarna("kuning telur", daftar), "Kuning Telur");
  assert.equal(canonicalWarna("Navy", daftar), "Navy");
  assert.equal(canonicalWarna("   ", daftar), "");
  assert.equal(tidyWarna("abu-abu muda"), "Abu-abu Muda");
});
test("warna yang baru diketik di form yang sama ikut jadi saran, tanpa dobel", () => {
  const o = withLocalWarna(daftar, ["kuning", "Kuning", "hitam", undefined, "  "]);
  assert.equal(o.length, daftar.length + 1);
  assert.equal(names(suggestWarna("kunin", o))[0], "Kuning");
});
test("hasil akhir satu kelompok: semua ejaan di atas menghasilkan kunci stok yang sama", () => {
  const keys = new Set(
    ["hitam", "HITAM", " Hitam ", "hitm", "htiam"].map((x) =>
      skuKey({ jenis_produksi: "kaos_polos", varian: "", warna: canonicalWarna(suggestWarna(x, daftar)[0]?.warna ?? x, daftar), ukuran: "S" }),
    ),
  );
  assert.equal(keys.size, 1);
});

console.log(`\n${passed} tes lulus`);
