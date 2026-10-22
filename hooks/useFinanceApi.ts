// hooks/useFinanceApi.ts
// Pemanggil API keuangan. Semua operasi uang lewat /api/finance/* (server), tidak langsung ke Supabase.

import { useCallback, useEffect, useState } from "react";
import type { FinanceMeta, FinanceVendor } from "@/lib/finance/types";

export class FinanceApiError extends Error {
  status: number;
  code?: string;
  data?: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = typeof data?.code === "string" ? data.code : undefined;
    this.data = data;
  }
}

export async function finFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new FinanceApiError(body?.error ?? `Permintaan gagal (${res.status})`, res.status, body ?? undefined);
  }
  return body as T;
}

export const postJson = <T,>(url: string, payload: unknown) =>
  finFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan");

/** Akun kas/bank, kategori, pengaturan, dan hak pengguna (GET /api/finance/meta). */
export function useFinanceMeta() {
  const [meta, setMeta] = useState<FinanceMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setMeta(await finFetch<FinanceMeta>("/api/finance/meta"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { meta, error, loading, reload };
}

/** Vendor/pemasok aktif (GET /api/finance/vendors) + `addVendor` untuk menambah hasil POST tanpa muat ulang. */
export function useVendors() {
  const [vendors, setVendors] = useState<FinanceVendor[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    finFetch<{ vendors: FinanceVendor[] }>("/api/finance/vendors")
      .then((r) => {
        if (!cancelled) setVendors(r.vendors);
      })
      .catch((e) => {
        if (!cancelled) setError(errMsg(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addVendor = useCallback(
    (v: FinanceVendor) =>
      setVendors((list) => (list.some((x) => x.id === v.id) ? list : [...list, v].sort((a, b) => a.name.localeCompare(b.name)))),
    [],
  );

  return { vendors, error, addVendor };
}
