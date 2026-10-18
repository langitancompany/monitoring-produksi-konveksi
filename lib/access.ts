// lib/access.ts
//
// Pengecekan hak akses di sisi tampilan (UI). Penegak sebenarnya tetap RLS
// database (has_perm) — ini hanya supaya tombol yang tidak boleh dipakai
// tidak muncul. Supervisor selalu boleh semuanya (sama seperti has_perm di SQL).

import type { UserData } from "@/types";
import type { StepPerm } from "@/lib/steps";

type Actor = Pick<UserData, "role" | "permissions"> | null | undefined;

/** Boleh melakukan `action` pada `module`? */
export function can(
  user: Actor,
  module: StepPerm[0],
  action: StepPerm[1],
): boolean {
  if (!user) return false;
  if (user.role === "supervisor") return true;
  const perm = (user.permissions as unknown as Record<string, Record<string, boolean> | undefined>)?.[module];
  return perm?.[action] === true;
}

/** Salah satu dari beberapa izin cukup. */
export function canAny(user: Actor, perms: StepPerm[]): boolean {
  return perms.some(([m, a]) => can(user, m, a));
}
