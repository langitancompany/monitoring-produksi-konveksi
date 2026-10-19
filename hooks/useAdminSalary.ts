// hooks/useAdminSalary.ts
//
// Data gaji bulanan Admin (migration 008): gaji tetap (riwayat), closing pilihan, dan bonus manual.
// Gaji tetap hanya DITAMBAH (database menolak update/delete); closing & bonus boleh dihapus.
// Pembayaran tetap lewat useSalaryPayments (kategori "admin"). Lihat docs/PRD.md §20.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalaryBonus, SalaryClosing, SalaryFixed } from "@/types/salary";
import { adminSalaryErrorMessage, fixedSalaryAt, monthEndKey, type AdminSalaryData } from "@/lib/salary";

interface Props {
  supabase: SupabaseClient;
  /** 1–12 */
  month: number;
  year: number;
}

const PAGE = 1000;
const num = (v: unknown) => Number(v);

// baris mentah dari PostgREST (angka numeric/bigint bisa datang sebagai string)
interface FixedRow { id: number | string; user_id: string; amount: number | string; effective_date: string }
interface ClosingRow { id: number | string; user_id: string; order_id: string; period_month: number | string; period_year: number | string }
interface BonusRow extends ClosingRowBase { label: string; amount: number | string }
interface ClosingRowBase { id: number | string; user_id: string; period_month: number | string; period_year: number | string }

export function useAdminSalary({ supabase, month, year }: Props) {
  const [data, setData] = useState<AdminSalaryData>({ fixed: [], closings: [], bonuses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // hanya jawaban permintaan TERBARU yang dipakai (ganti bulan cepat-cepat tidak menimpa data)
  const requestId = useRef(0);

  const fetchAll = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);

    // riwayat gaji tetap dibaca per halaman supaya tidak terpotong batas PostgREST
    const fixed: SalaryFixed[] = [];
    let failure: string | null = null;
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error: err } = await supabase
        .from("salary_fixed")
        .select("*")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (err) {
        failure = adminSalaryErrorMessage(err);
        break;
      }
      fixed.push(
        ...((rows ?? []) as FixedRow[]).map((r) => ({
          id: num(r.id),
          user_id: r.user_id as string,
          amount: num(r.amount),
          effective_date: r.effective_date as string,
        })),
      );
      if (!rows || rows.length < PAGE) break;
    }

    const [cl, bn] = await Promise.all([
      supabase.from("salary_closings").select("*").eq("period_month", month).eq("period_year", year),
      supabase.from("salary_bonus_manual").select("*").eq("period_month", month).eq("period_year", year),
    ]);
    if (id !== requestId.current) return;

    const err = cl.error || bn.error;
    if (failure || err) {
      setError(failure ?? adminSalaryErrorMessage(err));
    } else {
      setData({
        fixed,
        closings: ((cl.data ?? []) as ClosingRow[]).map(
          (r): SalaryClosing => ({
            id: num(r.id),
            user_id: r.user_id,
            order_id: r.order_id,
            period_month: num(r.period_month),
            period_year: num(r.period_year),
          }),
        ),
        bonuses: ((bn.data ?? []) as BonusRow[]).map(
          (r): SalaryBonus => ({
            id: num(r.id),
            user_id: r.user_id,
            period_month: num(r.period_month),
            period_year: num(r.period_year),
            label: r.label,
            amount: num(r.amount),
          }),
        ),
      });
      setError(null);
    }
    setLoading(false);
  }, [supabase, month, year]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /** Jalankan satu aksi tulis; kembalikan pesan galat, atau null bila berhasil. Selalu muat ulang. */
  const run = useCallback(
    async (action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<string | null> => {
      if (busyRef.current) return "Masih ada proses lain berjalan.";
      busyRef.current = true;
      setBusy(true);
      try {
        const { error: err } = await action();
        await fetchAll();
        return err ? adminSalaryErrorMessage(err) : null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [fetchAll],
  );

  /**
   * Simpan gaji tetap mulai bulan ini (tanggal 1) dan seterusnya sampai diubah lagi; bulan sebelumnya
   * tidak berubah. Nilai yang sama dengan yang berlaku sekarang tidak disimpan ulang.
   */
  const saveFixed = useCallback(
    async (userId: string, amount: number): Promise<string | null> => {
      const value = Math.max(0, Math.round(amount));
      if (fixedSalaryAt(data.fixed, userId, monthEndKey(month, year)) === value) return null;
      const effective_date = `${year}-${String(month).padStart(2, "0")}-01`;
      return run(() => supabase.from("salary_fixed").insert({ user_id: userId, amount: value, effective_date }));
    },
    [supabase, data.fixed, month, year, run],
  );

  const addBonus = useCallback(
    (userId: string, label: string, amount: number) =>
      run(() =>
        supabase.from("salary_bonus_manual").insert({
          user_id: userId,
          period_month: month,
          period_year: year,
          label: label.trim(),
          amount: Math.round(amount),
        }),
      ),
    [supabase, month, year, run],
  );

  const deleteBonus = useCallback(
    (id: number) => run(() => supabase.from("salary_bonus_manual").delete().eq("id", id)),
    [supabase, run],
  );

  const addClosing = useCallback(
    (userId: string, orderId: string) =>
      run(() =>
        supabase
          .from("salary_closings")
          .insert({ user_id: userId, order_id: orderId, period_month: month, period_year: year }),
      ),
    [supabase, month, year, run],
  );

  const deleteClosing = useCallback(
    (id: number) => run(() => supabase.from("salary_closings").delete().eq("id", id)),
    [supabase, run],
  );

  return { data, loading, error, busy, fetchAll, saveFixed, addBonus, deleteBonus, addClosing, deleteClosing };
}
