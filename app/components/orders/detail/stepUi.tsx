// app/components/orders/detail/stepUi.tsx
// Elemen tampilan bersama untuk 4 kartu tahap (gaya sama dengan Sablon):
// judul bernomor, baris "Oleh: nama | waktu", badge Selesai, tombol upload.
"use client";

import React from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import type { Order, ProductionStep } from "@/types/order";
import { formatDateTime } from "@/lib/utils";

/** Semua yang dibutuhkan kartu tahap dari OrderDetail. */
export interface StepCtx {
  order: Order;
  /** ada penyimpanan/upload lain yang sedang berjalan → tombol dinonaktifkan */
  disabled: boolean;
  /** kunci aksi yang sedang diproses, mis. "step:packing" */
  busyKey: string | null;
  /** boleh mengerjakan tahap ini (izin) */
  canWork: (stepKey: string) => boolean;
  /** boleh membatalkan tahap ini (izin + tahap sesudahnya belum selesai) */
  canUndo: (stepKey: string) => boolean;
  /** "done" | "active" | "locked" */
  position: (stepKey: string) => "done" | "active" | "locked";
  onUpload: (stepKey: string, file: File) => void;
  onUndo: (stepKey: string) => void;
}

export const getStep = (order: Order, key: string): ProductionStep | undefined =>
  order.steps.find((s) => s.key === key);

export function SectionCard({
  num,
  title,
  right,
  children,
}: {
  num: string;
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex justify-between items-center mb-4 gap-3">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">{num}</span>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

/** "Oleh: Budi | 17 Okt 2026, 14.05" — siapa yang mengerjakan & kapan. */
export function ByLine({ step, prefix = "Oleh" }: { step: ProductionStep; prefix?: string }) {
  if (!step.isCompleted) return null;
  return (
    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
      {prefix}: {step.uploadedBy ?? "-"} | {formatDateTime(step.completedAt ?? step.timestamp)}
    </div>
  );
}

export function DoneBadge({
  canUndo,
  disabled,
  onUndo,
}: {
  canUndo: boolean;
  disabled: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pl-2 border-l-2 border-emerald-600">
      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
        Selesai
      </span>
      {canUndo && (
        <button
          onClick={onUndo}
          disabled={disabled}
          title="Batalkan tahap ini"
          className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors duration-150 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

const VARIANTS = {
  outline:
    "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 w-full sm:w-auto",
  primary:
    "bg-[#124540] text-white px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#0d332f]",
  warning:
    "bg-orange-600 text-white px-4 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-2 hover:bg-orange-700 w-full sm:w-auto",
  big: "bg-[#124540] text-white w-full py-4 rounded-md font-semibold text-sm flex flex-col items-center justify-center gap-2 hover:bg-[#0d332f]",
} as const;

/** Tombol pilih foto → langsung diupload (sama seperti "Upload Foto" di Sablon). */
export function UploadButton({
  label,
  variant = "outline",
  disabled,
  busy,
  title,
  onFile,
}: {
  label: string;
  variant?: keyof typeof VARIANTS;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  onFile: (file: File) => void;
}) {
  const off = disabled || busy;
  return (
    <label
      title={title}
      className={`${VARIANTS[variant]} transition-colors duration-150 cursor-pointer ${
        off ? "opacity-50 pointer-events-none cursor-not-allowed" : ""
      }`}
    >
      {busy ? (
        <Loader2 className={variant === "big" ? "w-5 h-5 animate-spin" : "w-4 h-4 animate-spin"} />
      ) : (
        <Camera className={variant === "big" ? "w-5 h-5" : "w-4 h-4"} />
      )}
      <span>{busy ? "Mengupload…" : label}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={off}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // foto yang sama bisa dipilih lagi
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
