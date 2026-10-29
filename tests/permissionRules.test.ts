// tests/permissionRules.test.ts — aturan pemberian izin (lib/permissionRules.ts)
// Jalankan: npx tsx tests/permissionRules.test.ts
import assert from "node:assert/strict";
import { findPermissionEscalation, holdsPermission, permissionsEqual } from "../lib/permissionRules";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const caller = { orders: { view: true, create: true, edit: false }, keuangan: { view: true, delete: false } };
const target = { orders: { view: true }, keuangan: { view: false } };

console.log("findPermissionEscalation");
test("menambah izin yang dimiliki pemberi → boleh", () => {
  const next = { orders: { view: true, create: true }, keuangan: { view: true } };
  assert.equal(findPermissionEscalation(next, target, caller), null);
});
test("menambah izin yang TIDAK dimiliki pemberi → ditolak, label izin disebut", () => {
  const next = { orders: { view: true, edit: true } };
  assert.equal(findPermissionEscalation(next, target, caller), "Pesanan · Edit");
  assert.equal(findPermissionEscalation({ keuangan: { delete: true } }, target, caller), "Keuangan · Hapus");
});
test("izin yang sudah dimiliki target dan tidak berubah → tidak dianggap eskalasi", () => {
  const cur = { orders: { edit: true } };
  assert.equal(findPermissionEscalation({ orders: { edit: true } }, cur, caller), null);
});
test("mengurangi izin → boleh walau pemberi tidak punya izin itu", () => {
  const cur = { orders: { edit: true } };
  assert.equal(findPermissionEscalation({ orders: { edit: false } }, cur, caller), null);
});
test("izin baru modul 'view_all' ikut dicek", () => {
  assert.equal(findPermissionEscalation({ orders: { view_all: true } }, {}, caller), "Pesanan · Akses semua pesanan");
});

console.log("permissionsEqual / holdsPermission");
test("sama persis walau modul/aksi false tidak tertulis", () => {
  assert.equal(permissionsEqual({ orders: { view: true, edit: false } }, { orders: { view: true } }), true);
  assert.equal(permissionsEqual({ orders: { view: true } }, { orders: { view: false } }), false);
  assert.equal(permissionsEqual(null, {}), true);
});
test("holdsPermission hanya true murni", () => {
  assert.equal(holdsPermission(caller, "orders", "create"), true);
  assert.equal(holdsPermission(caller, "orders", "edit"), false);
  assert.equal(holdsPermission(null, "orders", "view"), false);
});

console.log(`\n${passed} test lulus`);
