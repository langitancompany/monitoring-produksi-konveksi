// app/components/apps/CalendarView.tsx
//
// Kalender: deadline & tanggal masuk pesanan (dibaca dari orders) + agenda
// manual tim (tabel calendar_events, migration 003). Tampilan & konsepnya sama
// dengan CalendarView Sablon (grid setinggi layar, pil agenda berwarna, pil status
// deadline, titik di HP, popup per hari dengan form agenda lengkap), tetapi tanpa
// date-fns (cukup Date bawaan) dan memakai client Supabase dari kerangka
// (PRD aturan no. 4).
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlignLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Package,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Order } from "@/types/order";
import { MONTHS, getStatusColor, toLocalISODate } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  event_time: string | null; // HH:mm
  location: string | null;
  color: string;
}

interface Props {
  /** pesanan yang tidak di Sampah (semua status) */
  orders: Order[];
  supabase: SupabaseClient;
  showAlert: (
    title: string,
    message: string,
    type?: "success" | "error",
  ) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  onSelectOrder: (orderId: string) => void;
}

// Warna label agenda: pilihan bebas pengguna (bukan token status), jadi memakai
// palet -500 standar. Tulis kelas LENGKAP di sini agar terbaca oleh Tailwind.
const EVENT_COLORS = [
  { name: "Merah", value: "bg-red-500" },
  { name: "Oranye", value: "bg-orange-500" },
  { name: "Kuning", value: "bg-amber-500" },
  { name: "Hijau", value: "bg-emerald-500" },
  { name: "Biru", value: "bg-blue-500" },
  { name: "Ungu", value: "bg-purple-500" },
  { name: "Pink", value: "bg-pink-500" },
  { name: "Abu", value: "bg-zinc-500" },
];
const DEFAULT_COLOR = "bg-blue-500";
const safeColor = (c: string) =>
  EVENT_COLORS.some((e) => e.value === c) ? c : DEFAULT_COLOR;

const DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_LONG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

/** Titik status pesanan (deadline): selaras warna status di daftar pesanan. */
const statusDot = (status: string) => {
  switch (status) {
    case "Selesai":
      return "bg-emerald-600";
    case "Ada Kendala":
      return "bg-orange-500";
    case "Revisi":
      return "bg-yellow-500";
    case "Pesanan Masuk":
      return "bg-zinc-400";
    case "Kirim":
      return "bg-cyan-600";
    case "On Process":
      return "bg-blue-600";
    case "Finishing":
      return "bg-purple-600";
    default:
      return "bg-zinc-400";
  }
};

/** Semua hari yang tampil di grid bulan (mulai Senin, genap per minggu). */
function buildMonthGrid(year: number, month: number): Date[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Senin
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from(
    { length: weeks * 7 },
    (_, i) => new Date(year, month, 1 - offset + i),
  );
}

/** Kelompokkan ke peta tanggal → daftar. */
function groupByDate<T>(
  items: T[],
  dateOf: (item: T) => string | null | undefined,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dateOf(item);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

const byTime = (a: CalendarEvent, b: CalendarEvent) =>
  (a.event_time ?? "").localeCompare(b.event_time ?? "");

const fieldCls =
  "w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-[#124540] outline-none transition-colors duration-150";

const KIND_LABEL = { utama: "Utama", non_utama: "Non-Utama" } as const;

export default function CalendarView({
  orders,
  supabase,
  showAlert,
  showConfirm,
  onSelectOrder,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toLocalISODate(today);

  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [showMasuk, setShowMasuk] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // rentang yang agendanya sudah termuat; "sedang memuat" = rentang tampil ≠ rentang termuat
  const [loadedRange, setLoadedRange] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // naikkan untuk memaksa muat ulang (tombol "Coba lagi")
  const [reloadToken, setReloadToken] = useState(0);

  // Modal hari
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  const days = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor],
  );
  const rangeStart = toLocalISODate(days[0]);
  const rangeEnd = toLocalISODate(days[days.length - 1]);

  // Agenda hanya dimuat untuk rentang yang tampil (bulan ini + sisa minggu di tepinya).
  // `cancelled` mencegah respons lama (bulan yang sudah ditinggalkan) menimpa data bulan baru.
  const rangeKey = `${rangeStart}_${rangeEnd}`;
  const loadingEvents = loadedRange !== rangeKey;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("date", rangeStart)
        .lte("date", rangeEnd)
        .order("event_time", { ascending: true, nullsFirst: true });
      if (cancelled) return;
      if (error) {
        setEventsError(
          error.code === "42P01" ||
            /does not exist|schema cache/i.test(error.message)
            ? "Tabel agenda belum ada. Jalankan supabase/migrations/003_calendar.sql di database."
            : `Agenda belum berhasil dimuat: ${error.message}`,
        );
      } else {
        setEvents((data ?? []) as CalendarEvent[]);
        setEventsError(null);
      }
      setLoadedRange(`${rangeStart}_${rangeEnd}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, rangeStart, rangeEnd, reloadToken]);

  const deadlines = useMemo(
    () => groupByDate(orders, (o) => o.deadline),
    [orders],
  );
  const masuk = useMemo(
    () => groupByDate(orders, (o) => o.tanggal_masuk),
    [orders],
  );
  const eventsByDate = useMemo(() => {
    const map = groupByDate(events, (e) => e.date);
    map.forEach((list) => list.sort(byTime));
    return map;
  }, [events]);

  const goMonth = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const goToday = () =>
    setCursor({ year: today.getFullYear(), month: today.getMonth() });

  const resetForm = useCallback(() => {
    setAdding(false);
    setTitle("");
    setTime("");
    setLocation("");
    setColor(DEFAULT_COLOR);
  }, []);
  const closeModal = useCallback(() => {
    setSelectedKey(null);
    resetForm();
  }, [resetForm]);

  // Esc menutup modal
  useEffect(() => {
    if (!selectedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKey, closeModal]);

  const handleAddEvent = async () => {
    if (!selectedKey || saving) return;
    const name = title.trim();
    if (!name) {
      showAlert("Judul kosong", "Isi judul agenda dulu.", "error");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .insert([
          {
            title: name,
            date: selectedKey,
            event_time: time || null,
            location: location.trim() || null,
            color,
          },
        ])
        .select()
        .single();
      if (error || !data) {
        showAlert(
          "Gagal menyimpan agenda",
          error?.message ?? "Tidak ada data kembali dari database.",
          "error",
        );
        return;
      }
      setEvents((prev) => [...prev, data as CalendarEvent]);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = (ev: CalendarEvent) =>
    showConfirm(
      "Hapus agenda?",
      `Agenda "${ev.title}" akan dihapus.`,
      async () => {
        const { data, error } = await supabase
          .from("calendar_events")
          .delete()
          .eq("id", ev.id)
          .select("id");
        if (error || !data || data.length === 0) {
          showAlert(
            "Gagal menghapus agenda",
            error?.message ??
              "Agenda tidak ditemukan atau Anda tidak punya izin.",
            "error",
          );
          return;
        }
        setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      },
    );

  // Isi modal (diturunkan dari data, jadi ikut berubah saat agenda ditambah/dihapus)
  const modal = useMemo(() => {
    if (!selectedKey) return null;
    const [y, m, d] = selectedKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return {
      label: `${DAY_LONG[date.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`,
      deadline: deadlines.get(selectedKey) ?? [],
      masuk: masuk.get(selectedKey) ?? [],
      events: eventsByDate.get(selectedKey) ?? [],
    };
  }, [selectedKey, deadlines, masuk, eventsByDate]);

  return (
    <div className="flex flex-col w-full p-4 md:p-0 mb-20 md:mb-0 h-auto md:h-[calc(100vh-120px)]">
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-auto md:h-full">
        {/* HEADER */}
        <div className="flex-none flex flex-wrap items-center justify-between gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 z-10">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
              {MONTHS[cursor.month]} {cursor.year}
            </h2>
            <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 mt-1 hidden md:block">
              {loadingEvents ? "Memuat..." : "Jadwal Produksi & Agenda"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="hidden sm:flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showMasuk}
                onChange={(e) => setShowMasuk(e.target.checked)}
                className="accent-[#124540] w-3.5 h-3.5"
              />
              Tampilkan tanggal masuk
            </label>
            <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 p-1 rounded-md border border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => goMonth(-1)}
                aria-label="Bulan sebelumnya"
                className="p-1.5 hover:bg-white dark:hover:bg-zinc-800 rounded-md transition-colors duration-150 text-zinc-600 dark:text-zinc-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
              >
                Hari Ini
              </button>
              <button
                onClick={() => goMonth(1)}
                aria-label="Bulan berikutnya"
                className="p-1.5 hover:bg-white dark:hover:bg-zinc-800 rounded-md transition-colors duration-150 text-zinc-600 dark:text-zinc-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {eventsError && (
          <div className="flex-none flex items-center justify-between gap-3 border-b border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
            <span>{eventsError}</span>
            <button
              onClick={() => setReloadToken((t) => t + 1)}
              className="font-semibold underline shrink-0"
            >
              Coba lagi
            </button>
          </div>
        )}

        {/* NAMA HARI */}
        <div className="flex-none grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          {DAY_SHORT.map((d) => (
            <div
              key={d}
              className="py-3 text-center text-[10px] md:text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* GRID TANGGAL */}
        <div className="flex-none md:flex-1 h-auto md:h-full md:overflow-y-auto custom-scrollbar bg-zinc-100 dark:bg-zinc-900">
          <div className="grid grid-cols-7 gap-[1px] border-b border-zinc-200 dark:border-zinc-800">
            {days.map((day) => {
              const key = toLocalISODate(day);
              const dayDeadlines = deadlines.get(key) ?? [];
              const dayMasuk = showMasuk ? (masuk.get(key) ?? []) : [];
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = day.getMonth() === cursor.month;
              const isToday = key === todayKey;
              const total =
                dayDeadlines.length + dayEvents.length + dayMasuk.length;

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`relative p-1 md:p-2 flex flex-col gap-1 text-left transition-colors duration-150 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#124540] min-h-[5.5rem] md:min-h-[140px] items-center md:items-stretch ${
                    inMonth
                      ? "bg-white dark:bg-zinc-950 hover:bg-[#124540]/5 dark:hover:bg-[#124540]/10"
                      : "bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-400"
                  }`}
                >
                  <div className="flex justify-center md:justify-between items-center w-full mt-1 md:mt-0">
                    <span
                      className={`text-xs md:text-sm font-semibold w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full transition-colors duration-150 ${
                        isToday
                          ? "bg-[#124540] text-white"
                          : inMonth
                            ? "text-zinc-700 dark:text-zinc-300"
                            : "text-zinc-400"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {total > 0 && (
                      <span className="hidden md:block font-mono tabular-nums text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {total}
                      </span>
                    )}
                  </div>

                  {/* DESKTOP LIST */}
                  <div className="hidden md:flex flex-col gap-1 mt-1 w-full min-w-0">
                    {/* Agenda: pil berwarna + jam */}
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold truncate text-white ${safeColor(ev.color)} flex items-center gap-1`}
                      >
                        {ev.event_time && (
                          <span className="font-mono text-[9px] opacity-90">
                            {ev.event_time}
                          </span>
                        )}
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}

                    {/* Deadline pesanan: pil status */}
                    {dayDeadlines.slice(0, 3).map((o) => (
                      <div
                        key={o.id}
                        className={`px-2 py-1 rounded-md border-l-[3px] text-[10px] font-semibold truncate opacity-90 text-left ${getStatusColor(o.status)}`}
                      >
                        {o.nama_pemesan}
                      </div>
                    ))}
                    {dayDeadlines.length > 3 && (
                      <div className="text-[9px] text-center text-zinc-400 font-medium pt-1">
                        + {dayDeadlines.length - 3} order
                      </div>
                    )}

                    {/* Tanggal masuk: redup, tidak mengalahkan deadline */}
                    {dayMasuk.slice(0, 2).map((o) => (
                      <div
                        key={`m-${o.id}`}
                        className="px-2 py-1 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-[10px] font-medium truncate text-zinc-400 dark:text-zinc-500"
                      >
                        Masuk · {o.nama_pemesan}
                      </div>
                    ))}
                    {dayMasuk.length > 2 && (
                      <div className="text-[9px] text-center text-zinc-400 font-medium">
                        + {dayMasuk.length - 2} masuk
                      </div>
                    )}
                  </div>

                  {/* MOBILE DOTS */}
                  <div className="flex md:hidden flex-wrap justify-center content-start gap-1 mt-1.5 px-0.5 w-full">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className={`w-1.5 h-1.5 rounded-full ${safeColor(ev.color)}`}
                      />
                    ))}
                    {dayDeadlines.slice(0, 6).map((o) => (
                      <div
                        key={o.id}
                        className={`w-1.5 h-1.5 rounded-full ${statusDot(o.status)}`}
                      />
                    ))}
                    {dayMasuk.slice(0, 3).map((o) => (
                      <div
                        key={`m-${o.id}`}
                        className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600"
                      />
                    ))}
                    {total > 6 && (
                      <span className="text-[6px] text-zinc-400 leading-none self-center">
                        +
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* LEGENDA */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-[10px] text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-950">
            <span className="font-semibold uppercase tracking-[0.12em]">
              Deadline:
            </span>
            {[
              "Pesanan Masuk",
              "On Process",
              "Finishing",
              "Kirim",
              "Ada Kendala",
              "Selesai",
            ].map((st) => (
              <span key={st} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${statusDot(st)}`} />
                {st}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL POPUP */}
      {modal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/80"
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.label}
            className="relative z-10 w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl flex flex-col max-h-[85vh] border border-zinc-200 dark:border-zinc-800"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 rounded-t-xl">
              <div>
                <h3 className="text-base md:text-lg font-semibold text-zinc-900 dark:text-white leading-tight tracking-tight">
                  {modal.label}
                </h3>
                <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {modal.deadline.length} Pesanan • {modal.events.length} Agenda
                  {showMasuk &&
                    modal.masuk.length > 0 &&
                    ` • ${modal.masuk.length} Masuk`}
                </p>
              </div>
              <button
                onClick={closeModal}
                aria-label="Tutup"
                className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 transition-colors duration-150"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar bg-zinc-50 dark:bg-zinc-950">
              {/* FORM TAMBAH AGENDA */}
              {adding ? (
                <div className="mb-6 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-[#124540]/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-[#49BFB4]" /> Agenda Baru
                    </h4>
                    <button
                      onClick={resetForm}
                      aria-label="Batal"
                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-colors duration-150"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>

                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder="Judul agenda"
                    className={`${fieldCls} mb-3`}
                  />

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clock className="w-4 h-4 text-zinc-400" />
                      </div>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        aria-label="Jam (opsional)"
                        className={`${fieldCls} pl-9`}
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                      </div>
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        maxLength={120}
                        placeholder="Lokasi"
                        className={`${fieldCls} pl-9 truncate`}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-[0.12em]">
                      Label Warna
                    </p>
                    <div
                      className="flex gap-2 flex-wrap"
                      role="radiogroup"
                      aria-label="Warna agenda"
                    >
                      {EVENT_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={color === c.value}
                          aria-label={c.name}
                          title={c.name}
                          onClick={() => setColor(c.value)}
                          className={`w-6 h-6 rounded-full ${c.value} transition-colors duration-150 flex items-center justify-center ${
                            color === c.value
                              ? "ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900"
                              : ""
                          }`}
                        >
                          {color === c.value && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2 border-t border-zinc-100 dark:border-zinc-700">
                    <button
                      onClick={() => void handleAddEvent()}
                      disabled={saving || !title.trim()}
                      className="w-full py-2 text-xs font-semibold bg-[#124540] text-white hover:bg-[#0d332f] rounded-md transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Simpan Agenda"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full mb-5 py-2.5 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-zinc-500 hover:bg-white hover:border-[#124540]/50 hover:text-[#124540] dark:hover:bg-zinc-900 dark:hover:text-[#49BFB4] transition-colors duration-150"
                >
                  <Plus className="w-4 h-4" /> Tambah Agenda Baru
                </button>
              )}

              {/* LIST */}
              <div className="space-y-6">
                {/* Agenda */}
                {modal.events.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
                      <AlignLeft className="w-3 h-3" /> Agenda Kegiatan
                    </h5>
                    <div className="space-y-2">
                      {modal.events.map((ev) => (
                        <div
                          key={ev.id}
                          className="group flex items-start gap-3 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-[#2589ff]/40 transition-colors duration-150"
                        >
                          <div
                            className={`w-1 self-stretch rounded-full ${safeColor(ev.color)} flex-shrink-0`}
                          />

                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 break-words">
                              {ev.title}
                            </h4>
                            {(ev.event_time || ev.location) && (
                              <div className="flex flex-wrap gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {ev.event_time && (
                                  <span className="flex items-center gap-1 font-mono tabular-nums">
                                    <Clock className="w-3 h-3" />{" "}
                                    {ev.event_time}
                                  </span>
                                )}
                                {ev.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {ev.location}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Di HP selalu tampak (tidak ada hover); di desktop muncul saat hover/fokus */}
                          <button
                            onClick={() => handleDeleteEvent(ev)}
                            aria-label={`Hapus agenda ${ev.title}`}
                            className="text-zinc-300 hover:text-red-500 transition-colors duration-150 p-1 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deadline produksi */}
                <OrderGroup
                  title="Deadline Produksi"
                  orders={modal.deadline}
                  onSelect={(id) => {
                    onSelectOrder(id);
                    closeModal();
                  }}
                />

                {/* Pesanan masuk */}
                {showMasuk && (
                  <OrderGroup
                    title="Pesanan Masuk"
                    orders={modal.masuk}
                    onSelect={(id) => {
                      onSelectOrder(id);
                      closeModal();
                    }}
                  />
                )}

                {/* Empty State */}
                {modal.events.length === 0 &&
                  modal.deadline.length === 0 &&
                  (!showMasuk || modal.masuk.length === 0) &&
                  !adding && (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-400 opacity-60">
                      <Clock className="w-12 h-12 mb-3 stroke-1" />
                      <p className="text-sm font-medium">
                        Tidak ada kegiatan hari ini
                      </p>
                    </div>
                  )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 md:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-b-xl flex justify-end">
              <button
                onClick={closeModal}
                className="px-5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Kartu pesanan pada satu hari (deadline atau masuk); klik membuka detail. Kosong → tidak tampil. */
function OrderGroup({
  title,
  orders,
  onSelect,
}: {
  title: string;
  orders: Order[];
  onSelect: (id: string) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <div>
      <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
        <Package className="w-3 h-3" /> {title}
      </h5>
      <div className="space-y-3">
        {orders.map((o) => (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(o.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(o.id);
              }
            }}
            className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-[#2589ff]/50 rounded-xl p-3 cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#124540]"
          >
            <div className="flex justify-between items-start mb-2">
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${getStatusColor(o.status)}`}
              >
                {o.status}
              </span>
              <span className="text-[9px] font-mono tabular-nums font-semibold text-zinc-400 dark:text-zinc-500">
                #{o.kode_produksi}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1 group-hover:text-[#2589ff] transition-colors duration-150 line-clamp-1">
              {o.nama_pemesan}
            </h4>
            <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-mono tabular-nums">{o.jumlah} pcs</span>
              <span className="w-1 h-1 rounded-full bg-zinc-300" />
              <span>{KIND_LABEL[o.kategori] ?? o.kategori}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
