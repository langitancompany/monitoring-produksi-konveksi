// tests/orderAccess.test.ts — uji logika murni akses pesanan (lib/orderAccess.ts)
// Cermin aturan RLS migration 017. Jalankan: npx tsx tests/orderAccess.test.ts
import assert from "node:assert/strict";
import {
  canAccessOrder,
  canManageAllOrders,
  canOperateOrder,
  canViewAllOrders,
  filterOrderRecipients,
  isOrderCrew,
} from "../lib/orderAccess";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

// Pengguna dengan izin tertentu (modul lain default false)
const user = (id: string, role: string, perms: Record<string, Record<string, boolean>> = {}) =>
  ({ id, role, permissions: perms }) as any;

const superAdmin = user("sa", "super_admin");
const pengelola = user("adm", "admin", { orders: { view: true, edit: true } });
const penghapus = user("del", "admin", { trash: { view: true, delete: true } });
const keuangan = user("fin", "manager", { keuangan: { view: true } });
const gaji = user("pay", "manager", { salary: { view: true } });
const penjahit = user("u1", "produksi", { produksi: { view: true, edit: true } }); // PJ
const anggota = user("u2", "produksi", { produksi: { view: true, edit: true } }); // anggota tim
const pembuat = user("cr", "admin", { orders: { view: true, create: true } }); // hanya membuat
const orangLain = user("x9", "produksi", { produksi: { view: true, edit: true } }); // bukan siapa-siapa

const teams = [
  { id: "t1", member_ids: ["u2", "u3"] },
  { id: "t2", member_ids: ["x9"] },
];
const order = { created_by: "cr", assigned_to: "u1", team_id: "t1" };

console.log("canManageAllOrders / canViewAllOrders");
test("Super Admin: kelola & lihat semua", () => {
  assert.equal(canManageAllOrders(superAdmin), true);
  assert.equal(canViewAllOrders(superAdmin), true);
});
test("orders.edit = pengelola", () => {
  assert.equal(canManageAllOrders(pengelola), true);
  assert.equal(canViewAllOrders(pengelola), true);
});
test("trash.delete = pengelola (perlu melihat Sampah untuk memulihkan)", () => {
  assert.equal(canManageAllOrders(penghapus), true);
});
test("keuangan.view / salary.view = pemantau: lihat semua, TIDAK kelola", () => {
  for (const u of [keuangan, gaji]) {
    assert.equal(canViewAllOrders(u), true);
    assert.equal(canManageAllOrders(u), false);
  }
});
test("izin produksi saja TIDAK cukup untuk lihat semua", () => {
  assert.equal(canViewAllOrders(penjahit), false);
  assert.equal(canManageAllOrders(penjahit), false);
});
test("tanpa pengguna → false", () => {
  assert.equal(canViewAllOrders(null), false);
  assert.equal(canManageAllOrders(undefined), false);
});

console.log("isOrderCrew");
test("PJ, anggota tim, dan pembuat = kru", () => {
  assert.equal(isOrderCrew(order, penjahit, teams), true);
  assert.equal(isOrderCrew(order, anggota, teams), true);
  assert.equal(isOrderCrew(order, pembuat, teams), true);
});
test("user di tim LAIN bukan kru", () => {
  assert.equal(isOrderCrew(order, orangLain, teams), false);
});
test("pesanan tanpa tim: hanya pembuat & PJ", () => {
  const o = { created_by: "cr", assigned_to: "u1", team_id: null };
  assert.equal(isOrderCrew(o, anggota, teams), false);
  assert.equal(isOrderCrew(o, penjahit, teams), true);
});
test("tim tidak ditemukan / daftar tim kosong → bukan kru", () => {
  assert.equal(isOrderCrew(order, anggota, []), false);
  assert.equal(isOrderCrew(order, anggota, undefined), false);
  assert.equal(isOrderCrew({ ...order, team_id: "hilang" }, anggota, teams), false);
});
test("pesanan tanpa PJ, tim, pembuat → tidak ada kru", () => {
  const o = { created_by: null, assigned_to: null, team_id: null };
  for (const u of [penjahit, anggota, pembuat, orangLain]) assert.equal(isOrderCrew(o, u, teams), false);
});
test("pengguna tanpa id / pesanan null → false", () => {
  assert.equal(isOrderCrew(order, { role: "produksi", permissions: {} } as any, teams), false);
  assert.equal(isOrderCrew(null, penjahit, teams), false);
});

console.log("canAccessOrder / canOperateOrder");
test("orang lain: tidak bisa melihat maupun mengerjakan", () => {
  assert.equal(canAccessOrder(order, orangLain, teams), false);
  assert.equal(canOperateOrder(order, orangLain, teams), false);
});
test("kru: bisa melihat dan mengerjakan", () => {
  for (const u of [penjahit, anggota, pembuat]) {
    assert.equal(canAccessOrder(order, u, teams), true);
    assert.equal(canOperateOrder(order, u, teams), true);
  }
});
test("pemantau keuangan/gaji: bisa melihat, tidak bisa mengerjakan", () => {
  for (const u of [keuangan, gaji]) {
    assert.equal(canAccessOrder(order, u, teams), true);
    assert.equal(canOperateOrder(order, u, teams), false);
  }
});
test("pengelola & Super Admin: bisa semuanya walau bukan kru", () => {
  for (const u of [pengelola, penghapus, superAdmin]) {
    assert.equal(canAccessOrder(order, u, teams), true);
    assert.equal(canOperateOrder(order, u, teams), true);
  }
});

console.log("filterOrderRecipients (notifikasi)");
const row = (id: string, role: string, permissions: unknown = {}) => ({ id, role, permissions });
const everyone = [
  row("sa", "super_admin"),
  row("adm", "admin", { orders: { edit: true } }),
  row("fin", "manager", { keuangan: { view: true } }),
  row("u1", "produksi", { produksi: { edit: true } }),
  row("u2", "produksi", { produksi: { edit: true } }),
  row("u3", "qc", { finishing: { edit: true } }),
  row("cr", "admin", { orders: { create: true } }),
  row("x9", "produksi", { produksi: { edit: true } }),
];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

test("hanya kru + yang boleh lihat semua; staf lain tidak dapat", () => {
  const got = filterOrderRecipients(order, { member_ids: ["u2", "u3"] }, everyone);
  assert.deepEqual(ids(got), ["adm", "cr", "fin", "sa", "u1", "u2", "u3"]);
  assert.equal(ids(got).includes("x9"), false);
});
test("pesanan tanpa tim: anggota tim lain tidak dapat", () => {
  const got = filterOrderRecipients({ created_by: "cr", assigned_to: "u1", team_id: null }, null, everyone);
  assert.deepEqual(ids(got), ["adm", "cr", "fin", "sa", "u1"]);
});
test("pesanan tidak ditemukan → hanya yang boleh lihat semua (aman)", () => {
  assert.deepEqual(ids(filterOrderRecipients(null, null, everyone)), ["adm", "fin", "sa"]);
});
test("permissions kosong / null dari database tidak membuat error", () => {
  const got = filterOrderRecipients(order, null, [row("u1", "produksi", null), row("x9", "produksi", undefined)]);
  assert.deepEqual(ids(got), ["u1"]);
});

console.log(`\n${passed} test lulus`);
