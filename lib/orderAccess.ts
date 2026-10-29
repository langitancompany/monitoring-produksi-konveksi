// lib/orderAccess.ts
//
// Siapa boleh melihat / mengubah SATU pesanan. Cermin dari migration 017
// (fungsi can_manage_all_orders, can_view_all_orders, is_order_crew).
// Penegak sebenarnya tetap RLS database; modul ini hanya supaya tampilan
// (tombol, kolom catatan) dan penerima notifikasi mengikuti aturan yang sama.
//
// MENGUBAH ATURAN? Ubah di DUA tempat: fungsi SQL di migration 017 (atau
// migration baru yang menggantinya) dan file ini. Uji: tests/orderAccess.test.ts.
//
//  • Pengelola  : Super Admin, atau izin orders.edit / orders.delete / trash.delete
//                 → melihat & mengubah SEMUA pesanan.
//  • Pemantau   : izin keuangan.view / salary.view → melihat SEMUA pesanan
//                 (Keuangan & Gaji memang menghitung dari semua pesanan), tidak mengubah.
//  • Kru        : pembuat pesanan, PJ (assigned_to), atau anggota tim (team_id)
//                 → melihat & (dengan izin produksi/finishing) mengubah pesanan itu.

import type { UserData } from "@/types";
import type { Order } from "@/types/order";
import type { TeamData } from "@/types/team";
import { can } from "./access";

/** Pengguna yang dicek. `id` dibutuhkan untuk mengenali kru. */
type Actor = (Pick<UserData, "role" | "permissions"> & { id?: string | null }) | null | undefined;
type OrderRef = Pick<Order, "created_by" | "assigned_to" | "team_id">;
type TeamRef = Pick<TeamData, "id" | "member_ids">;

/** Pengelola: melihat & mengubah semua pesanan. */
export function canManageAllOrders(user: Actor): boolean {
  return (
    can(user, "orders", "edit") ||
    can(user, "orders", "delete") ||
    can(user, "trash", "delete")
  );
}

/** Boleh MELIHAT semua pesanan (pengelola + pemantau keuangan/gaji). */
export function canViewAllOrders(user: Actor): boolean {
  return (
    canManageAllOrders(user) ||
    can(user, "keuangan", "view") ||
    can(user, "salary", "view")
  );
}

/** Pembuat, PJ, atau anggota tim pesanan ini? (tim nonaktif tetap dihitung) */
export function isOrderCrew(
  order: OrderRef | null | undefined,
  user: Actor,
  teams: TeamRef[] | null | undefined,
): boolean {
  const uid = user?.id;
  if (!order || !uid) return false;
  if (order.created_by === uid || order.assigned_to === uid) return true;
  if (!order.team_id) return false;
  const team = (teams ?? []).find((t) => t.id === order.team_id);
  return !!team && Array.isArray(team.member_ids) && team.member_ids.includes(uid);
}

/** Boleh melihat pesanan ini. */
export function canAccessOrder(order: OrderRef | null | undefined, user: Actor, teams: TeamRef[] | null | undefined): boolean {
  return canViewAllOrders(user) || isOrderCrew(order, user, teams);
}

/**
 * Boleh MENGERJAKAN pesanan ini (tahap, kendala, catatan) — pengelola atau kru.
 * Ini hanya syarat "pesanan ini miliknya"; izin per tahap (produksi/finishing)
 * tetap dicek terpisah (lib/steps.ts).
 */
export function canOperateOrder(order: OrderRef | null | undefined, user: Actor, teams: TeamRef[] | null | undefined): boolean {
  return canManageAllOrders(user) || isOrderCrew(order, user, teams);
}

// ─── Penerima notifikasi (dipakai /api/notify di server) ─────────────────────

/** Baris `users` apa adanya dari database. */
export interface RecipientRow {
  id: string;
  role?: string | null;
  permissions?: unknown;
}

/**
 * Dari calon penerima, ambil yang BERHAK tahu pesanan ini: kru pesanan itu
 * + semua yang boleh melihat semua pesanan. Pesanan tidak ditemukan →
 * hanya yang boleh melihat semua (aman: jangan bocorkan info pesanan).
 */
export function filterOrderRecipients<T extends RecipientRow>(
  order: OrderRef | null | undefined,
  team: Pick<TeamData, "member_ids"> | null | undefined,
  candidates: T[],
): T[] {
  const crew = new Set<string>();
  if (order?.created_by) crew.add(order.created_by);
  if (order?.assigned_to) crew.add(order.assigned_to);
  if (team && Array.isArray(team.member_ids)) team.member_ids.forEach((id) => crew.add(id));

  return candidates.filter((c) => {
    if (crew.has(c.id)) return true;
    const actor = { id: c.id, role: (c.role ?? "") as UserData["role"], permissions: c.permissions as UserData["permissions"] };
    return canViewAllOrders(actor);
  });
}
