// lib/access.ts
//
// Pengecekan hak akses di sisi tampilan (UI). Penegak sebenarnya tetap RLS
// database (has_perm) — ini hanya supaya tombol yang tidak boleh dipakai
// tidak muncul. Supervisor selalu boleh semuanya (sama seperti has_perm di SQL).

import type { UserData, UserPermissions } from "@/types";

type Actor = Pick<UserData, "role" | "permissions"> | null | undefined;

/** Nama modul hak akses (key di UserPermissions), mis. "orders", "trash", "logs". */
export type PermModule = keyof UserPermissions;
export type PermAction = "view" | "create" | "edit" | "delete";

/** Boleh melakukan `action` pada `module`? */
export function can(user: Actor, module: PermModule, action: PermAction): boolean {
  if (!user) return false;
  if (user.role === "supervisor") return true;
  const perm = (user.permissions as unknown as Record<string, Record<string, boolean> | undefined>)?.[module];
  return perm?.[action] === true;
}

/** Salah satu dari beberapa izin cukup. */
export function canAny(user: Actor, perms: Array<[PermModule, PermAction]>): boolean {
  return perms.some(([m, a]) => can(user, m, a));
}
