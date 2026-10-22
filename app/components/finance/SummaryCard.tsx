import React from "react";
import { cardCls, sectionLabelCls } from "./ui";

/** Kartu angka ringkas dengan ikon (Ringkasan & Laporan). */
export function SummaryCard({
  label,
  value,
  icon,
  color,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  /** kelas latar belakang kotak ikon */
  color: string;
  hint?: string;
}) {
  return (
    <div className={`${cardCls} p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className={sectionLabelCls}>{label}</p>
        <p className="text-base font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 truncate">{value}</p>
        {hint && <p className="text-[10px] text-zinc-400 truncate">{hint}</p>}
      </div>
    </div>
  );
}
