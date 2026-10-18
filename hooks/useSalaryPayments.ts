// hooks/useSalaryPayments.ts
//
// Status "gaji sudah dibayar" satu bulan (tabel salary_payments, migration 007).
// Tulis HANYA lewat fungsi database mark_salary_paid / unmark_salary_paid (izin dicek di sana,
// jejaknya masuk salary_audit_log) — jangan insert/update/delete langsung dari browser.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalaryKategori, SalaryPayment } from "@/types/salary";
import { salaryErrorMessage } from "@/lib/salary";

interface Props {
  supabase: SupabaseClient;
  /** 1–12 */
  month: number;
  year: number;
}

export const paymentKey = (userId: string, kategori: SalaryKategori) => `${userId}:${kategori}`;

export function useSalaryPayments({ supabase, month, year }: Props) {
  const [payments, setPayments] = useState<Record<string, SalaryPayment>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // kunci pembayaran yang sedang diproses (tombolnya menampilkan loading, tidak bisa dobel klik)
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = useRef(false);
  // hanya jawaban permintaan TERBARU yang dipakai (ganti bulan cepat-cepat tidak menimpa data)
  const requestId = useRef(0);

  const fetchPayments = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("salary_payments")
      .select("*")
      .eq("period_month", month)
      .eq("period_year", year);
    if (id !== requestId.current) return;
    if (err) {
      setError(salaryErrorMessage(err));
    } else {
      const map: Record<string, SalaryPayment> = {};
      for (const p of (data ?? []) as SalaryPayment[]) {
        map[paymentKey(p.user_id, p.kategori)] = { ...p, total_amount: Number(p.total_amount) };
      }
      setPayments(map);
      setError(null);
    }
    setLoading(false);
  }, [supabase, month, year]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  /** Mengembalikan pesan galat, atau null bila berhasil. */
  const markPaid = useCallback(
    async (userId: string, kategori: SalaryKategori, amount: number): Promise<string | null> => {
      if (busyRef.current) return "Masih ada proses lain berjalan.";
      busyRef.current = true;
      setBusyKey(paymentKey(userId, kategori));
      try {
        const { error: err } = await supabase.rpc("mark_salary_paid", {
          p_user_id: userId,
          p_month: month,
          p_year: year,
          p_kategori: kategori,
          p_amount: Math.round(amount),
        });
        await fetchPayments(); // selalu muat ulang: sukses → status baru, bentrok → status orang lain
        return err ? salaryErrorMessage(err) : null;
      } finally {
        busyRef.current = false;
        setBusyKey(null);
      }
    },
    [supabase, month, year, fetchPayments],
  );

  const unmarkPaid = useCallback(
    async (userId: string, kategori: SalaryKategori): Promise<string | null> => {
      if (busyRef.current) return "Masih ada proses lain berjalan.";
      busyRef.current = true;
      setBusyKey(paymentKey(userId, kategori));
      try {
        const { error: err } = await supabase.rpc("unmark_salary_paid", {
          p_user_id: userId,
          p_month: month,
          p_year: year,
          p_kategori: kategori,
        });
        await fetchPayments();
        return err ? salaryErrorMessage(err) : null;
      } finally {
        busyRef.current = false;
        setBusyKey(null);
      }
    },
    [supabase, month, year, fetchPayments],
  );

  return { payments, loading, error, busyKey, fetchPayments, markPaid, unmarkPaid };
}
