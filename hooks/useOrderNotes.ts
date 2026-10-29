// hooks/useOrderNotes.ts
//
// Catatan produksi satu pesanan (tabel production_notes) untuk kartu 02, 03, 04
// di Detail Pesanan. Satu kali muat untuk ketiga bagian (Sablon memuat tiga kali).
// Catatan hanya bisa ditambah atau dihapus — tidak diubah. Hak akses dijaga RLS
// (migration 004); di sini hanya mengatur tampilan tombol.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserData } from "@/types";
import type { Order } from "@/types/order";
import {
  NOTE_COLUMNS,
  canDeleteNote,
  cleanNoteText,
  noteErrorMessage,
  type NoteSection,
  type ProductionNote,
} from "@/lib/meetingNotes";

interface Props {
  supabase: SupabaseClient;
  order: Pick<Order, "id" | "kode_produksi" | "nama_pemesan">;
  currentUser: UserData & { id: string };
  /**
   * Boleh menulis catatan? false untuk yang hanya melihat pesanan (bukan PJ / anggota tim /
   * pengelola). Penegak sebenarnya RLS production_notes (migration 017). Bawaan: true.
   */
  canWrite?: boolean;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

/** Yang dibutuhkan komponen ProductionNotes dari hook ini. */
export interface OrderNotesApi {
  notes: ProductionNote[];
  loading: boolean;
  /** pesan galat pemuatan (mis. migration 004 belum dijalankan); null = baik-baik saja */
  loadError: string | null;
  /** bagian yang sedang menyimpan catatan baru (tombol kirim menampilkan loading) */
  savingSection: NoteSection | null;
  /** id catatan yang sedang dihapus */
  deletingId: string | null;
  /** false = tampilan hanya-baca: kolom tulis catatan disembunyikan */
  canWrite: boolean;
  add: (section: NoteSection, text: string) => Promise<boolean>;
  remove: (note: ProductionNote) => void;
  canDelete: (note: ProductionNote) => boolean;
  reload: () => void;
}

export function useOrderNotes({ supabase, order, currentUser, canWrite = true, showAlert, showConfirm }: Props): OrderNotesApi {
  const [notes, setNotes] = useState<ProductionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<NoteSection | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // kunci anti dobel-kirim (state terlambat satu render, ref langsung)
  const busyRef = useRef(false);

  // Kode & nama pesanan dibaca saat menyimpan — jangan jadi dependency muat ulang
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const orderId = order.id;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("production_notes")
        .select(NOTE_COLUMNS)
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      return { data: (data ?? []) as ProductionNote[], error };
    } catch (e) {
      // koneksi putus dsb. — ubah jadi galat biasa supaya "Memuat..." tidak menggantung
      return { data: [] as ProductionNote[], error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }, [supabase, orderId]);

  // Muat saat pesanan dibuka / berganti. `cancelled` mencegah hasil pesanan lama menimpa yang baru.
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotes([]);
    void load().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setLoadError(noteErrorMessage(error));
      else setNotes(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load, reloadTick]);

  const add = useCallback(
    async (section: NoteSection, text: string): Promise<boolean> => {
      const content = cleanNoteText(text);
      if (!content || busyRef.current) return false;
      busyRef.current = true;
      setSavingSection(section);
      try {
        const o = orderRef.current;
        const { data, error } = await supabase
          .from("production_notes")
          .insert({
            order_id: o.id,
            kode_produksi: o.kode_produksi,
            nama_pemesan: o.nama_pemesan,
            content,
            section,
            created_by_id: currentUser.id,
            created_by_name: currentUser.name,
          })
          .select(NOTE_COLUMNS)
          .single();
        if (error || !data) {
          showAlert("Gagal menyimpan catatan", noteErrorMessage(error), "error");
          return false;
        }
        setNotes((prev) =>
          prev.some((n) => n.id === (data as ProductionNote).id) ? prev : [...prev, data as ProductionNote],
        );
        return true;
      } finally {
        busyRef.current = false;
        setSavingSection(null);
      }
    },
    [supabase, currentUser.id, currentUser.name, showAlert],
  );

  const doDelete = useCallback(
    async (note: ProductionNote) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setDeletingId(note.id);
      try {
        // .select() supaya tahu apakah baris benar-benar terhapus (RLS menolak tanpa galat)
        const { data, error } = await supabase
          .from("production_notes")
          .delete()
          .eq("id", note.id)
          .select("id");
        if (error) {
          showAlert("Gagal menghapus catatan", noteErrorMessage(error), "error");
          return;
        }
        if (!data || data.length === 0) {
          showAlert(
            "Tidak terhapus",
            "Catatan ini sudah dihapus orang lain, atau Anda tidak punya izin menghapusnya.",
            "error",
          );
        }
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
      } finally {
        busyRef.current = false;
        setDeletingId(null);
      }
    },
    [supabase, showAlert],
  );

  const remove = useCallback(
    (note: ProductionNote) =>
      showConfirm("Hapus catatan?", "Catatan ini akan dihapus dan tidak bisa dikembalikan.", () => void doDelete(note)),
    [showConfirm, doDelete],
  );

  const canDelete = useCallback((note: ProductionNote) => canDeleteNote(note, currentUser), [currentUser]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  return useMemo(
    () => ({ notes, loading, loadError, savingSection, deletingId, canWrite, add, remove, canDelete, reload }),
    [notes, loading, loadError, savingSection, deletingId, canWrite, add, remove, canDelete, reload],
  );
}
