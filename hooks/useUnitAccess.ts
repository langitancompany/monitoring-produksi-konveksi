'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface UnitInfo {
  code: string;
  label: string;
  domain: string;
}

// Daftar semua unit usaha yang terdaftar dalam sistem.
// Tambahkan baris baru di sini setiap kali ada unit usaha baru.
export const ALL_UNITS: UnitInfo[] = [
  { code: 'sablon', label: 'Sablon', domain: 'sablon.langitan.co' },
  { code: 'konveksi', label: 'Konveksi', domain: 'konveksi.langitan.co' },
  { code: 'percetakan', label: 'Percetakan', domain: 'percetakan.langitan.co' },
];

/**
 * Ambil daftar unit usaha yang boleh diakses user yang sedang login,
 * berdasarkan tabel direksi_access. Karyawan biasa (bukan direksi)
 * akan mendapat array kosong — artinya dropdown switcher tidak perlu
 * ditampilkan untuk mereka.
 */
export function useUnitAccess(userId: string | undefined) {
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    if (!userId) {
      setUnits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAccess() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('direksi_access')
        .select('unit_code')
        .eq('user_id', userId);


      if (cancelled) return;

      if (error || !data) {
        setUnits([]);
        setLoading(false);
        return;
      }

      const codes = data.map((row) => row.unit_code as string);
      const accessible = ALL_UNITS.filter((u) => codes.includes(u.code));


      setUnits(accessible);
      setLoading(false);
    }

    fetchAccess();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { units, loading };
}