// hooks/useTeams.ts
//
// Master data Tim produksi. Dikelola di Pengaturan → Tim; dipilih di form
// Pesanan Baru / Edit Pesanan dan ditampilkan di Detail Pesanan.
// Pola sama dengan useProductionTypes. Izin dicek database (RLS, migration 006).

import { useState, useCallback, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { TeamData, TeamInput } from "@/types/team";
import { normalizeTeam, teamErrorMessage, validateTeamInput } from "@/lib/teams";

interface Props {
  supabase: SupabaseClient;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export function useTeams({ supabase, showAlert, showConfirm }: Props) {
  const [teams, setTeams] = useState<TeamData[]>([]);
  // Pesan bila daftar tim gagal dimuat (mis. migration 006 belum dijalankan)
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    const { data, error } = await supabase.from("teams").select("*").order("name");
    if (error) {
      setTeamsError(teamErrorMessage(error));
      return;
    }
    setTeams((data ?? []).map(normalizeTeam));
    setTeamsError(null);
  }, [supabase]);

  /** Tambah (tanpa id) atau ubah (dengan id). true = berhasil → form boleh ditutup. */
  const handleSaveTeam = useCallback(
    async (t: TeamInput): Promise<boolean> => {
      const problem = validateTeamInput(t, teams);
      if (problem) {
        showAlert("Gagal", problem, "error");
        return false;
      }
      const payload = {
        name: t.name.trim(),
        description: t.description.trim() || null,
        member_ids: Array.from(new Set(t.member_ids)),
      };

      // .select("id") supaya terlihat bila RLS menolak diam-diam (0 baris)
      const { data, error } = t.id
        ? await supabase.from("teams").update(payload).eq("id", t.id).select("id")
        : await supabase.from("teams").insert([payload]).select("id");

      if (error) {
        showAlert("Gagal", teamErrorMessage(error), "error");
        return false;
      }
      if (!data || data.length === 0) {
        await fetchTeams();
        showAlert(
          "Gagal",
          "Tim tidak tersimpan: Anda tidak punya izin, atau tim ini sudah dihapus orang lain. Data sudah dimuat ulang.",
          "error",
        );
        return false;
      }
      await fetchTeams();
      showAlert("Sukses", t.id ? "Tim diperbarui" : "Tim dibuat");
      return true;
    },
    [supabase, teams, fetchTeams, showAlert],
  );

  const handleToggleTeam = useCallback(
    async (t: TeamData) => {
      const { data, error } = await supabase
        .from("teams")
        .update({ is_active: !t.is_active })
        .eq("id", t.id)
        .select("id");
      if (error) return showAlert("Gagal", teamErrorMessage(error), "error");
      if (!data || data.length === 0) {
        await fetchTeams();
        return showAlert("Gagal", "Anda tidak punya izin mengubah tim ini.", "error");
      }
      await fetchTeams();
    },
    [supabase, fetchTeams, showAlert],
  );

  const handleDeleteTeam = useCallback(
    (t: TeamData) => {
      showConfirm(
        "Hapus Tim?",
        `Tim "${t.name}" dihapus. Pesanan yang memakai tim ini tidak ikut terhapus, tetapi kolom timnya jadi kosong dan tidak bisa dikembalikan. Kalau hanya ingin menyembunyikan dari pilihan, gunakan tombol Nonaktifkan.`,
        async () => {
          const { data, error } = await supabase.from("teams").delete().eq("id", t.id).select("id");
          if (error) return showAlert("Gagal", teamErrorMessage(error), "error");
          if (!data || data.length === 0) {
            await fetchTeams();
            return showAlert("Gagal", "Anda tidak punya izin menghapus tim ini.", "error");
          }
          await fetchTeams();
          showAlert("Sukses", "Tim dihapus");
        },
      );
    },
    [supabase, fetchTeams, showAlert, showConfirm],
  );

  /** Hanya tim aktif — untuk pilihan di form pesanan baru. */
  const activeTeams = useMemo(() => teams.filter((t) => t.is_active), [teams]);

  return {
    teams,
    activeTeams,
    teamsError,
    fetchTeams,
    handleSaveTeam,
    handleToggleTeam,
    handleDeleteTeam,
  };
}
