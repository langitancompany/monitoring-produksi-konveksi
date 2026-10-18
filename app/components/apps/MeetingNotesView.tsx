// app/components/apps/MeetingNotesView.tsx
//
// Catatan Rapat: rekap catatan produksi (tabel production_notes) per pesanan
// untuk rapat mingguan. Diadopsi dari WeeklyNotesView Sablon. Beda:
//  - memakai client Supabase dari kerangka (PRD aturan no. 4),
//  - pesanan di Sampah tidak ikut tampil, kode pesanan bisa diklik ke detailnya,
//  - PDF lewat dialog cetak browser ("Cetak / Simpan PDF") — tanpa library jsPDF,
//  - galat pemuatan ditampilkan (bukan diam-diam kosong) + tombol Coba lagi.
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Printer, RefreshCw } from "lucide-react";
import type { Order } from "@/types/order";
import { formatDateTime } from "@/lib/utils";
import {
  NOTE_COLUMNS,
  NOTE_SECTIONS,
  buildReportHtml,
  countNotes,
  groupNotesByOrder,
  noteErrorMessage,
  weekRange,
  type OrderNotes,
  type ProductionNote,
  type WeekFilter,
} from "@/lib/meetingNotes";

interface Props {
  supabase: SupabaseClient;
  /** pesanan yang tidak di Sampah (catatan pesanan lain tidak ditampilkan) */
  orders: Order[];
  ordersLoading: boolean;
  /** buka detail pesanan dari rekap */
  onSelectOrder: (orderId: string) => void;
}

// Batas muat: catatan TERBARU (PostgREST juga membatasi 1000 baris per permintaan)
const NOTES_LIMIT = 1000;

const FILTERS: { value: WeekFilter; label: string }[] = [
  { value: "this", label: "Minggu ini" },
  { value: "last", label: "Minggu lalu" },
  { value: "all", label: "Semua" },
];

/** Cetak HTML lewat iframe tersembunyi → dialog cetak browser (bisa "Simpan sebagai PDF"). */
function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return cleanup();
    win.onafterprint = cleanup;
    win.focus();
    win.print();
    // cadangan bila browser tidak memanggil onafterprint
    setTimeout(cleanup, 60_000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

// ─── Satu bagian (Produksi / QC & Packing / Pengiriman) ──────────────────────

function SectionRow({ label, notes }: { label: string; notes: ProductionNote[] }) {
  return (
    <div className="py-3 border-b border-zinc-200 dark:border-zinc-800 last:border-0">
      <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-2">{label}</p>
      {notes.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">Tidak ada catatan</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2 border-l-2 border-zinc-200 dark:border-zinc-800"
            >
              <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
                {note.content}
              </p>
              <p className="text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 mt-1">
                {note.created_by_name} · {formatDateTime(note.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Kartu satu pesanan ──────────────────────────────────────────────────────

function OrderCard({ group, onOpen }: { group: OrderNotes; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const total = countNotes(group);

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-900">
        <div className="min-w-0 flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate">
              {group.nama_pemesan}
            </p>
            <button
              onClick={onOpen}
              title="Buka detail pesanan"
              className="text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 mt-0.5 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:underline transition-colors duration-150"
            >
              #{group.kode_produksi}
            </button>
          </div>
          <span className="font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300">
            {total} catatan
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Ciutkan" : "Buka"}
          className="p-1 -mr-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150 shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4">
          {NOTE_SECTIONS.map((s) => (
            <SectionRow key={s.value} label={s.label} notes={group.sections[s.value]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Halaman ─────────────────────────────────────────────────────────────────

export default function MeetingNotesView({ supabase, orders, ordersLoading, onSelectOrder }: Props) {
  const [filter, setFilter] = useState<WeekFilter>("this");
  const [notes, setNotes] = useState<ProductionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // naik = muat ulang

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { from, to } = weekRange(filter, new Date());
    // Filter dipasang SEBELUM order/limit (urutan yang aman di semua versi supabase-js)
    let query = supabase.from("production_notes").select(NOTE_COLUMNS);
    if (from) query = query.gte("created_at", from.toISOString());
    if (to) query = query.lt("created_at", to.toISOString());

    const run = async () => {
      try {
        const { data, error: err } = await query
          .order("created_at", { ascending: false })
          .limit(NOTES_LIMIT);
        if (cancelled) return;
        if (err) {
          setError(noteErrorMessage(err));
          setNotes([]);
        } else {
          setNotes((data ?? []) as ProductionNote[]);
        }
      } catch (e) {
        // koneksi putus dsb. — jangan biarkan spinner berputar selamanya
        if (cancelled) return;
        setError(noteErrorMessage({ message: e instanceof Error ? e.message : String(e) }));
        setNotes([]);
      }
      if (!cancelled) setLoading(false);
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [filter, tick, supabase]);

  const groups = useMemo(() => groupNotesByOrder(notes, orders), [notes, orders]);
  const totalNotes = useMemo(() => groups.reduce((n, g) => n + countNotes(g), 0), [groups]);
  const reachedLimit = notes.length >= NOTES_LIMIT;
  const busy = loading || ordersLoading;

  const handlePrint = useCallback(() => {
    printHtml(buildReportHtml(groups, filter, new Date()));
  }, [groups, filter]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return (
    <div className="space-y-4 md:space-y-5 pb-24">
      <div className="hidden md:block">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Catatan Rapat</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Rekap catatan produksi untuk rapat mingguan — ditulis di detail pesanan (kartu Produksi, QC &amp; Packing, Pengiriman)
        </p>
      </div>

      {/* Filter + tombol cetak */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors duration-150 ${
              filter === f.value
                ? "bg-[#124540] text-white border-[#124540]"
                : "bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}

        {!busy && !error && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">
            <span className="font-mono tabular-nums">{groups.length}</span> pesanan ·{" "}
            <span className="font-mono tabular-nums">{totalNotes}</span> catatan
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={reload}
            disabled={loading}
            title="Muat ulang"
            className="p-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors duration-150"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {!busy && !error && groups.length > 0 && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#124540] hover:bg-[#0d332f] transition-colors duration-150"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak / Simpan PDF
            </button>
          )}
        </div>
      </div>

      {reachedLimit && !busy && !error && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Menampilkan {NOTES_LIMIT} catatan terbaru. Pilih Minggu ini / Minggu lalu untuk melihat rentang yang lebih sempit.
        </p>
      )}

      {/* Isi */}
      {busy ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-400">Memuat catatan...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-4 text-xs text-red-700 dark:text-red-300">
          <p className="font-semibold mb-1">Catatan tidak bisa dimuat</p>
          <p>{error}</p>
          <button onClick={reload} className="mt-2 font-semibold underline">
            Coba lagi
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
          <MessageSquare className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Belum ada catatan</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1 text-center max-w-xs">
            Catatan muncul di sini setelah tim menambahkannya di detail pesanan
            {filter !== "all" ? " pada periode ini" : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <OrderCard key={g.order_id} group={g} onOpen={() => onSelectOrder(g.order_id)} />
          ))}
        </div>
      )}
    </div>
  );
}
