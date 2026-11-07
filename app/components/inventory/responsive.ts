// Kelas Tailwind untuk tabel yang berubah jadi kartu di layar sempit.
// Tabel tetap tabel dari `md` (768px) ke atas; di bawahnya tiap baris jadi kartu dan tiap sel membawa
// keterangan kolomnya lewat atribut data-label. Kelas ditulis utuh supaya terbaca oleh Tailwind.

/** Ambang pakai tabel: `md` untuk tabel sempit, `lg` untuk Riwayat yang kolomnya lebih banyak. */
export const md = {
  table: "w-full text-sm max-md:block",
  head: "max-md:hidden",
  body: "max-md:grid max-md:gap-2 max-md:p-3 sm:max-md:grid-cols-2 md:divide-y md:divide-zinc-100 md:dark:divide-zinc-900",
  foot: "max-md:block max-md:border-t max-md:border-zinc-200 max-md:dark:border-zinc-800",
  row: "max-md:grid max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-2 max-md:rounded-lg max-md:border max-md:border-zinc-200 max-md:dark:border-zinc-800 max-md:p-3",
  cell: "md:px-4 md:py-2 max-md:block min-w-0",
  caption:
    "max-md:before:block max-md:before:mb-0.5 max-md:before:text-[10px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-[0.12em] max-md:before:text-zinc-500 max-md:before:dark:text-zinc-400 max-md:before:content-[attr(data-label)]",
  full: "max-md:col-span-full",
};

export const lg = {
  table: "w-full text-sm max-lg:block",
  head: "max-lg:hidden",
  body: "max-lg:grid max-lg:gap-2 max-lg:p-3 sm:max-lg:grid-cols-2 lg:divide-y lg:divide-zinc-100 lg:dark:divide-zinc-900",
  row: "max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-3 max-lg:gap-y-2 max-lg:rounded-lg max-lg:border max-lg:border-zinc-200 max-lg:dark:border-zinc-800 max-lg:p-3",
  cell: "lg:px-4 lg:py-2.5 max-lg:block min-w-0",
  caption:
    "max-lg:before:block max-lg:before:mb-0.5 max-lg:before:text-[10px] max-lg:before:font-semibold max-lg:before:uppercase max-lg:before:tracking-[0.12em] max-lg:before:text-zinc-500 max-lg:before:dark:text-zinc-400 max-lg:before:content-[attr(data-label)]",
  full: "max-lg:col-span-full",
};

/** Isian angka: penuh di kartu, lebar tetap di tabel; 16px di HP supaya iOS tidak memperbesar halaman. */
export const countInputCls = "!h-11 !text-base md:!text-sm md:!w-24 text-right tabular-nums";

/** Target sentuh minimal 44px di HP; kembali ke ukuran ringkas di layar lebar. */
export const tapCls = "min-h-11 sm:min-h-0";
