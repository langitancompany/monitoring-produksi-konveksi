// app/components/orders/detail/StepProduksi.tsx
// Kartu 02 — Produksi: Potong Kain & Jahit (utama) atau Produksi Massal
// (non-utama), semuanya Upload Foto. Laporan kendala ada di kartu ini.
"use client";

import React, { useState } from "react";
import { AlertTriangle, Camera, Clock, Eye, Loader2, MessageSquare, Send, Trash2, User } from "lucide-react";
import type { KendalaNote, ProductionTypeData } from "@/types/order";
import { formatDateTime, typeLabel } from "@/lib/utils";
import { ByLine, DoneBadge, SectionCard, StepCtx, UploadButton, getStep } from "./stepUi";

interface Props {
  ctx: StepCtx;
  productionTypes: ProductionTypeData[];
  canKendala: boolean;
  canDeleteKendala: boolean;
  onAddKendala: (notes: string, file: File | null) => Promise<boolean>;
  onResolveKendala: (id: string) => void;
  onDeleteKendala: (id: string) => void;
  onAddKendalaBukti: (id: string, file: File) => void;
}

const PRODUKSI_KEYS = ["potong_kain", "produksi_massal"];

export default function StepProduksi({
  ctx, productionTypes, canKendala, canDeleteKendala,
  onAddKendala, onResolveKendala, onDeleteKendala, onAddKendalaBukti,
}: Props) {
  const { order, disabled, busyKey } = ctx;
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const steps = PRODUKSI_KEYS.map((k) => getStep(order, k)).filter((s): s is NonNullable<typeof s> => !!s);
  const active: KendalaNote[] = order.kendala.filter((k) => !k.isResolved);

  // QC gagal → catatan revisi tampil di tahap Produksi yang dibuka lagi
  const qc = getStep(order, "qc");
  const revisiNote = qc && !qc.isCompleted && qc.qc?.passed === false ? qc.qc.notes : null;

  const jenis = order.items.map((it) => typeLabel(it.jenis_produksi, productionTypes)).join(", ");

  const submitKendala = async () => {
    const ok = await onAddKendala(note, file);
    if (ok) {
      setNote("");
      setFile(null);
      setShowForm(false);
    }
  };

  return (
    <SectionCard
      num="02"
      title={`Produksi${jenis ? ` (${jenis})` : ""}`}
      right={
        canKendala && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors duration-150"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {showForm ? "Tutup Laporan" : "Lapor Kendala"}
          </button>
        )
      }
    >
      {/* Form kendala */}
      {showForm && (
        <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-400 uppercase mb-2">Form Laporan Kendala</h4>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Tulis detail kendala"
              disabled={disabled}
              className="flex-1 text-sm px-3 py-2 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-md outline-none focus:border-[#124540] dark:bg-zinc-950 transition-colors duration-150"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label
              title="Lampirkan foto bukti (opsional)"
              className={`px-3 py-2 rounded-md border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                file
                  ? "border-[#124540] text-[#124540] dark:text-[#49BFB4]"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
              } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
            >
              <Camera className="w-3.5 h-3.5" /> {file ? "Foto ✓" : "Foto"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button
              onClick={submitKendala}
              disabled={!note.trim() || disabled}
              className="bg-[#124540] text-white px-4 py-2 rounded-md font-semibold text-xs hover:bg-[#0d332f] disabled:opacity-50 flex items-center gap-2 transition-colors duration-150"
            >
              {busyKey === "kendala:add" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Kirim
            </button>
          </div>
        </div>
      )}

      {/* Kendala aktif */}
      {active.length > 0 && (
        <div className="mb-6 space-y-3">
          {active.map((k) => (
            <div
              key={k.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 md:p-4 flex flex-col sm:flex-row gap-3"
            >
              <div className="flex items-start gap-3 flex-1 border-l-2 border-orange-600 pl-3">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm mb-1">{k.notes}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {k.reportedBy}</span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3 h-3" /> {formatDateTime(k.timestamp)}
                    </span>
                    {k.buktiFile ? (
                      <a href={k.buktiFile} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                        <Eye className="w-3 h-3" /> Lihat Bukti
                      </a>
                    ) : (
                      canKendala && (
                        <label className={`flex items-center gap-1 font-semibold cursor-pointer hover:underline ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
                          <Camera className="w-3 h-3" /> Tambah foto
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) onAddKendalaBukti(k.id, f);
                            }}
                          />
                        </label>
                      )
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 w-full sm:w-auto border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800 pt-2 sm:pt-0 mt-1 sm:mt-0">
                {canKendala && (
                  <button
                    onClick={() => onResolveKendala(k.id)}
                    disabled={disabled}
                    className="bg-emerald-600 text-white text-[10px] px-3 py-1.5 rounded-full font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap"
                  >
                    {busyKey === `kendala:${k.id}` ? "Memproses..." : "Selesaikan"}
                  </button>
                )}
                {canDeleteKendala && (
                  <button
                    onClick={() => onDeleteKendala(k.id)}
                    disabled={disabled}
                    className="text-zinc-400 hover:text-red-500 p-1.5 rounded-md transition-colors duration-150"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daftar tahap produksi */}
      <div className="space-y-4">
        {steps.map((step) => {
          const pos = ctx.position(step.key);
          const isRevisi = !step.isCompleted && !!revisiNote && step.key === "produksi_massal";
          const locked = pos === "locked";
          return (
            <div key={step.id} className="flex flex-col border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-0 gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className={`font-semibold text-sm md:text-base ${step.isCompleted ? "text-zinc-900 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-600"}`}>
                    {step.name}
                  </div>

                  {isRevisi && (
                    <div className="mt-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs px-3 py-2 rounded-md border border-red-100 dark:border-red-900/50 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-[10px] uppercase">Catatan Revisi (dari QC):</span>
                        {revisiNote}
                      </div>
                    </div>
                  )}

                  <ByLine step={step} />

                  {step.fileUrl && (
                    <a
                      href={step.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-1 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" /> Lihat Bukti
                    </a>
                  )}
                </div>

                {step.isCompleted ? (
                  <DoneBadge canUndo={ctx.canUndo(step.key)} disabled={disabled} onUndo={() => ctx.onUndo(step.key)} />
                ) : (
                  ctx.canWork(step.key) && (
                    <UploadButton
                      label={isRevisi ? "Upload Ulang (Revisi)" : step.fileUrl ? "Ganti Foto" : "Upload Foto"}
                      variant={isRevisi ? "warning" : "outline"}
                      disabled={disabled || locked}
                      busy={busyKey === `step:${step.key}`}
                      title={locked ? "Selesaikan langkah sebelumnya terlebih dahulu" : undefined}
                      onFile={(f) => ctx.onUpload(step.key, f)}
                    />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
