// app/components/orders/detail/WarnaInput.tsx
//
// Isian warna bebas dengan saran. Dipakai ItemsEditor bila Varian 2 (warna) jenis itu hanya "Lainnya".
//  - saat mengetik: muncul warna yang sudah ada & mirip (tap untuk memakai ejaan bakunya);
//  - kolom kosong: warna yang paling sering dipakai;
//  - selesai mengetik: ejaan disamakan dengan yang sudah ada ("hitam" → "Hitam"), warna baru dirapikan;
//  - bila tampak salah ketik: "Mirip dengan Hitam" + tombol untuk memakainya.
// Tujuannya supaya satu warna tidak pecah jadi beberapa baris stok (buku besar stok tidak bisa diubah).
"use client";

import React, { useMemo, useState } from "react";
import { useWarnaOptions } from "@/hooks/useInventoryApi";
import {
  canonicalWarna,
  closestWarna,
  exactWarna,
  suggestWarna,
  withLocalWarna,
} from "@/lib/inventory/warna";

interface Props {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  className: string;
  disabled?: boolean;
  /** Jenis produksi yang sedang diisi: warna yang pernah dipakai jenis ini diutamakan. */
  jenis?: string;
  /** Warna lain yang sudah diketik di form yang sama (belum tersimpan), ikut jadi saran. */
  siblings?: Array<string | undefined>;
  placeholder?: string;
}

export default function WarnaInput({
  value,
  onChange,
  className,
  disabled,
  jenis,
  siblings = [],
  placeholder,
}: Props) {
  const fetched = useWarnaOptions();
  const siblingsKey = siblings.join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(
    () => withLocalWarna(fetched, siblings),
    [fetched, siblingsKey],
  );
  const [focused, setFocused] = useState(false);

  const text = value ?? "";
  const hasText = text.trim() !== "";
  const exact = hasText ? exactWarna(text, options) : null;
  const sameSpelling = exact?.warna === text;

  const suggestions = useMemo(() => {
    if (!focused) return [];
    return suggestWarna(text, options, { jenis, limit: 6 }).filter(
      (o) => o.warna !== text,
    );
  }, [focused, text, options, jenis]);

  const hint = !focused && hasText ? closestWarna(text, options) : null;

  const pick = (w: string) => onChange(w);

  const finish = () => {
    setFocused(false);
    if (!hasText) {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const next = canonicalWarna(text, options);
    if (next !== text) onChange(next);
  };

  const chip =
    "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors duration-150 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-[#49BFB4] hover:text-[#124540] dark:hover:text-[#49BFB4] disabled:opacity-50";

  return (
    <div className="space-y-1.5">
      <input
        disabled={disabled}
        className={className}
        maxLength={40}
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={placeholder ?? "mis. Hitam, Navy"}
        onFocus={() => setFocused(true)}
        onBlur={finish}
        onChange={(e) => onChange(e.target.value || undefined)}
      />

      {focused && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {hasText ? "Maksud Anda:" : "Sering dipakai:"}
          </span>
          {suggestions.map((o) => (
            <button
              key={o.warna}
              type="button"
              disabled={disabled}
              className={chip}
              title={
                o.stok
                  ? "Sudah ada di Stok Barang Jadi"
                  : "Sudah dipakai di pesanan"
              }
              // pointerdown dicegah supaya kolom tidak kehilangan fokus (dan tidak dirapikan) sebelum dipilih
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(o.warna)}
            >
              {o.warna}
            </button>
          ))}
        </div>
      )}

      {focused && hasText && exact && sameSpelling && (
        <p className="text-[11px] text-[#124540] dark:text-[#49BFB4]">
          Warna ini sudah ada{exact.stok ? " di stok" : ""}.
        </p>
      )}

      {hint && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Mirip dengan <span className="font-semibold">{hint.warna}</span>
          {hint.stok ? " (sudah ada di stok)" : ""}. Salah ketik?{" "}
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => pick(hint.warna)}
          >
            Pakai {hint.warna}
          </button>
        </p>
      )}
    </div>
  );
}
