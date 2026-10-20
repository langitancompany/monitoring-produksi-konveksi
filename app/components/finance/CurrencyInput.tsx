// app/components/finance/CurrencyInput.tsx
// Isian nominal Rupiah (hanya angka, tampil "Rp 1.234.000"). Menyimpan bilangan bulat; tanpa pecahan.
"use client";

import React, { useState } from "react";
import { formatRupiah } from "./utils";

interface CurrencyInputProps {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  required?: boolean;
  /** ukuran ringkas untuk baris tabel (tanpa label) */
  compact?: boolean;
  ariaLabel?: string;
}

/** Maksimum 12 digit (batas wajar uang di database: Rp 100 miliar). */
const MAX_DIGITS = 12;

export function CurrencyInput({
  label,
  value,
  onChange,
  readOnly = false,
  required = false,
  compact = false,
  ariaLabel,
}: CurrencyInputProps) {
  const [raw, setRaw] = useState(value > 0 ? String(value) : "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
    setRaw(digits);
    onChange?.(parseInt(digits, 10) || 0);
  };

  const display = readOnly ? formatRupiah(value) : raw ? `Rp ${parseInt(raw, 10).toLocaleString("id-ID")}` : "";

  const baseCls =
    "w-full border rounded-md px-3 py-2 text-sm font-mono tabular-nums transition-colors duration-150 outline-none focus:ring-2 focus:ring-[#124540]";
  const editCls =
    "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500";
  const readonlyCls =
    "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 cursor-not-allowed";

  const control = readOnly ? (
    <div className={`${baseCls} ${readonlyCls}`}>{display || "Rp 0"}</div>
  ) : (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder="Rp 0"
      aria-label={ariaLabel ?? label}
      className={`${baseCls} ${editCls} ${compact ? "!py-1.5 text-right" : ""}`}
    />
  );

  if (compact) return control;

  return (
    <div>
      <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {control}
    </div>
  );
}
