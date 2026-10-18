// app/components/orders/detail/KendalaSection.tsx
// Laporan kendala pesanan: lapor (boleh dengan foto bukti), tandai selesai,
// hapus. Selama ada kendala yang belum selesai status pesanan = "Ada Kendala".
"use client";

import React, { useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import type { KendalaNote } from "@/types/order";
import { formatDateTime } from "@/lib/utils";
import { inputCls } from "@/app/components/settings/settingsShared";

interface Props {
  kendala: KendalaNote[];
  canReport: boolean;
  canDelete: boolean;
  /** disabled: ada penyimpanan lain berjalan; busyKey: id yang sedang diproses */
  disabled: boolean;
  busyKey: string | null;
  onAdd: (notes: string, file: File | null) => Promise<boolean>;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onAddBukti: (id: string, file: File) => void;
}

const isImageUrl = (url: string) => /\.(jpe?g|png|webp|gif)$/i.test(url.split("?")[0]);

export default function KendalaSection({
  kendala, canReport, canDelete, disabled, busyKey, onAdd, onResolve, onDelete, onAddBukti,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const adding = busyKey === "kendala:add";
  const unresolved = kendala.filter((k) => !k.isResolved).length;

  const submit = async () => {
    const ok = await onAdd(text, file);
    if (ok) {
      setText("");
      setFile(null);
      setOpen(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" /> Kendala
          {unresolved > 0 && (
            <span className="font-mono tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
              {unresolved} aktif
            </span>
          )}
        </h3>
        {canReport && !open && (
          <button
            onClick={() => setOpen(true)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Lapor kendala
          </button>
        )}
      </div>

      {open && (
        <div className="mb-4 space-y-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3">
          <textarea
            rows={2}
            disabled={disabled}
            className={inputCls}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Apa kendalanya? (mis. kain kurang, mesin rusak)"
          />
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-200 dark:file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-700 dark:file:text-zinc-200"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setOpen(false); setText(""); setFile(null); }}
              disabled={disabled}
              className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-900 text-xs transition-colors duration-150"
            >
              Batal
            </button>
            <button
              onClick={submit}
              disabled={disabled || !text.trim()}
              className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-colors duration-150"
            >
              {adding && <Loader2 className="w-4 h-4 animate-spin" />} Kirim laporan
            </button>
          </div>
        </div>
      )}

      {kendala.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-600">Belum ada laporan kendala.</p>
      ) : (
        <ul className="space-y-3">
          {[...kendala].reverse().map((k) => {
            const busy = busyKey === `kendala:${k.id}`;
            return (
              <li
                key={k.id}
                className={`rounded-md border-l-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 ${
                  k.isResolved ? "border-emerald-400" : "border-orange-500"
                }`}
              >
                <p className="text-sm text-zinc-900 dark:text-zinc-100">{k.notes}</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {k.reportedBy} · {formatDateTime(k.timestamp)}
                  {k.isResolved && k.resolvedBy && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {" "}· selesai oleh {k.resolvedBy} ({formatDateTime(k.resolvedTimestamp)})
                    </span>
                  )}
                </p>

                {k.buktiFile &&
                  (isImageUrl(k.buktiFile) ? (
                    <a href={k.buktiFile} target="_blank" rel="noreferrer" className="inline-block mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={k.buktiFile} alt="Bukti kendala" loading="lazy" className="h-16 w-auto rounded-md border border-zinc-200 dark:border-zinc-800 object-cover" />
                    </a>
                  ) : (
                    <a href={k.buktiFile} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] underline underline-offset-2">
                      <ExternalLink className="w-3 h-3" /> Buka bukti
                    </a>
                  ))}

                {canReport && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {!k.isResolved && (
                      <button
                        onClick={() => onResolve(k.id)}
                        disabled={disabled}
                        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Tandai selesai
                      </button>
                    )}
                    {!k.buktiFile && (
                      <label className={`flex items-center gap-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 cursor-pointer ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
                        <Camera className="w-3 h-3" /> Tambah foto
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) onAddBukti(k.id, f);
                          }}
                        />
                      </label>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(k.id)}
                        disabled={disabled}
                        className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors duration-150"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
