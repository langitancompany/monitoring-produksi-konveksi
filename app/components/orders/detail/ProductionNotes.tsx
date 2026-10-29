// app/components/orders/detail/ProductionNotes.tsx
//
// Kotak "Catatan" di bawah kartu 02 Produksi, 03 QC & Packing, dan 04 Pengiriman
// (diadopsi dari ProductionNotes Sablon). Data dimuat sekali per pesanan oleh
// useOrderNotes; komponen ini hanya menampilkan satu bagian + kolom tulis.
"use client";

import React, { useState } from "react";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { NOTE_MAX_LENGTH, type NoteSection } from "@/lib/meetingNotes";
import { formatDateTime } from "@/lib/utils";
import type { OrderNotesApi } from "@/hooks/useOrderNotes";

interface Props {
  section: NoteSection;
  api: OrderNotesApi;
}

export default function ProductionNotes({ section, api }: Props) {
  const [input, setInput] = useState("");
  const notes = api.notes.filter((n) => n.section === section);
  const saving = api.savingSection === section;

  const send = async () => {
    if (!input.trim() || api.savingSection) return;
    // kosongkan kolom hanya bila berhasil disimpan (kalau gagal, ketikan tidak hilang)
    if (await api.add(section, input)) setInput("");
  };

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
          Catatan
        </span>
        {notes.length > 0 && (
          <span className="font-mono tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
            {notes.length}
          </span>
        )}
      </div>

      {api.loading ? (
        <div className="flex items-center gap-2 py-2 mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          <span className="text-xs text-zinc-400">Memuat catatan...</span>
        </div>
      ) : api.loadError ? (
        <div className="mb-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <p>{api.loadError}</p>
          <button onClick={api.reload} className="mt-1 font-semibold underline">
            Coba lagi
          </button>
        </div>
      ) : notes.length === 0 ? (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic mb-3">Belum ada catatan</p>
      ) : (
        <div className="space-y-2 mb-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2 border-l-2 border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
                  {note.content}
                </p>
                <p className="text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 mt-1">
                  {note.created_by_name} · {formatDateTime(note.created_at)}
                </p>
              </div>
              {api.canDelete(note) && (
                <button
                  onClick={() => api.remove(note)}
                  disabled={api.deletingId !== null}
                  title="Hapus catatan"
                  className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors duration-150 flex-shrink-0 mt-0.5"
                >
                  {api.deletingId === note.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {api.canWrite && (
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Tulis catatan..."
          maxLength={NOTE_MAX_LENGTH}
          disabled={saving}
          className="flex-1 min-w-0 text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:border-[#124540] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 disabled:opacity-60 transition-colors duration-150"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // isComposing: jangan kirim saat masih memilih huruf (keyboard HP / IME)
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void send();
          }}
        />
        <button
          onClick={() => void send()}
          disabled={!input.trim() || api.savingSection !== null}
          title="Kirim catatan"
          className="bg-[#124540] text-white px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0d332f] disabled:opacity-50 transition-colors duration-150"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
      )}
    </div>
  );
}
