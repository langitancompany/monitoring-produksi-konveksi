// app/components/apps/CalendarView.tsx
//
// Kalender: deadline & tanggal masuk pesanan (dibaca dari orders) + agenda
// manual tim (tabel calendar_events, migration 003). Diadopsi dari CalendarView
// Sablon, tetapi tanpa date-fns (cukup Date bawaan) dan memakai client Supabase
// dari kerangka (PRD aturan no. 4).
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
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
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
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
const safeColor = (c: string) => (EVENT_COLORS.some((e) => e.value === c) ? c : DEFAULT_COLOR);

const DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

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
  return Array.from({ length: weeks * 7 }, (_, i) => new Date(year, month, 1 - offset + i));
}

/** Kelompokkan ke peta tanggal → daftar. */
function groupByDate<T>(items: T[], dateOf: (item: T) => string | null | undefined): Map<string, T[]> {
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

const byTime = (a: CalendarEvent, b: CalendarEvent) => (a.event_time ?? "").localeCompare(b.event_time ?? "");

const fieldCls =
  "w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#124540] bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500";

export default function CalendarView({ orders, supabase, showAlert, showConfirm, onSelectOrder }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toLocalISODate(today);

  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
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

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
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
          error.code === "42P01" || /does not exist|schema cache/i.test(error.message)
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

  const deadlines = useMemo(() => groupByDate(orders, (o) => o.deadline), [orders]);
  const masuk = useMemo(() => groupByDate(orders, (o) => o.tanggal_masuk), [orders]);
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
  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });

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
        .insert([{ title: name, date: selectedKey, event_time: time || null, location: location.trim() || null, color }])
        .select()
        .single();
      if (error || !data) {
        showAlert("Gagal menyimpan agenda", error?.message ?? "Tidak ada data kembali dari database.", "error");
        return;
      }
      setEvents((prev) => [...prev, data as CalendarEvent]);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = (ev: CalendarEvent) =>
    showConfirm("Hapus agenda?", `Agenda "${ev.title}" akan dihapus.`, async () => {
      const { data, error } = await supabase.from("calendar_events").delete().eq("id", ev.id).select("id");
      if (error || !data || data.length === 0) {
        showAlert("Gagal menghapus agenda", error?.message ?? "Agenda tidak ditemukan atau Anda tidak punya izin.", "error");
        return;
      }
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    });

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
    <div className="flex flex-col w-full mb-20 md:mb-0">
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
              {MONTHS[cursor.month]} {cursor.year}
            </h2>
            <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {loadingEvents ? "Memuat agenda…" : "Deadline pesanan & agenda tim"}
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
          <div className="flex items-center justify-between gap-3 border-b border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
            <span>{eventsError}</span>
            <button onClick={() => setReloadToken((t) => t + 1)} className="font-semibold underline shrink-0">
              Coba lagi
            </button>
          </div>
        )}

        {/* NAMA HARI */}
        <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
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
        <div className="bg-zinc-100 dark:bg-zinc-900">
          <div className="grid grid-cols-7 gap-[1px] border-b border-zinc-200 dark:border-zinc-800">
            {days.map((day) => {
              const key = toLocalISODate(day);
              const dayDeadlines = deadlines.get(key) ?? [];
              const dayMasuk = showMasuk ? (masuk.get(key) ?? []) : [];
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = day.getMonth() === cursor.month;
              const isToday = key === todayKey;

              // Daftar chip desktop: agenda → deadline → masuk (maks 3, sisanya "+N lagi")
              const chips: Array<{ id: string; dot: string; text: string; muted?: boolean }> = [
                ...dayEvents.map((e) => ({ id: `e-${e.id}`, dot: safeColor(e.color), text: `${e.event_time ? e.event_time + " " : ""}${e.title}` })),
                ...dayDeadlines.map((o) => ({ id: `d-${o.id}`, dot: statusDot(o.status), text: o.nama_pemesan })),
                ...dayMasuk.map((o) => ({ id: `m-${o.id}`, dot: "bg-zinc-300 dark:bg-zinc-600", text: `Masuk · ${o.nama_pemesan}`, muted: true })),
              ];
              const shown = chips.slice(0, 3);
              const more = chips.length - shown.length;

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`relative p-1 md:p-2 flex flex-col gap-1 text-left transition-colors duration-150 min-h-[5rem] md:min-h-[8.5rem] items-center md:items-stretch outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#124540] ${
                    inMonth
                      ? "bg-white dark:bg-zinc-950 hover:bg-[#124540]/5 dark:hover:bg-[#124540]/10"
                      : "bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-400"
                  }`}
                >
                  <span
                    className={`text-xs md:text-sm font-semibold w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full self-center md:self-start ${
                      isToday
                        ? "bg-[#124540] text-white"
                        : inMonth
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-400"
                    }`}
                  >
                    {day.getDate()}
                  </span>

                  {/* HP: titik saja */}
                  <div className="flex md:hidden flex-wrap justify-center gap-1">
                    {chips.slice(0, 6).map((c) => (
                      <span key={c.id} className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    ))}
                  </div>

                  {/* Desktop: chip bernama */}
                  <div className="hidden md:flex flex-col gap-0.5 w-full min-w-0">
                    {shown.map((c) => (
                      <span
                        key={c.id}
                        className={`flex items-center gap-1.5 text-[10px] leading-tight truncate ${
                          c.muted ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-300 font-semibold"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                        <span className="truncate">{c.text}</span>
                      </span>
                    ))}
                    {more > 0 && (
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">+{more} lagi</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* LEGENDA */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
          <span className="font-semibold uppercase tracking-[0.12em]">Deadline:</span>
          {["Pesanan Masuk", "On Process", "Finishing", "Kirim", "Ada Kendala", "Selesai"].map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* MODAL HARI */}
      {modal && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-zinc-950/40 dark:bg-zinc-950/70 p-0 md:p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.label}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-zinc-950 rounded-t-xl md:rounded-xl border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">{modal.label}</h3>
              <button
                onClick={closeModal}
                aria-label="Tutup"
                className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar p-4 space-y-5">
              <OrderGroup title="Deadline pesanan" orders={modal.deadline} emptyText="Tidak ada deadline di hari ini." onSelect={onSelectOrder} />
              {showMasuk && modal.masuk.length > 0 && (
                <OrderGroup title="Pesanan masuk" orders={modal.masuk} emptyText="" onSelect={onSelectOrder} />
              )}

              {/* AGENDA */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Agenda
                  </h4>
                  {!adding && (
                    <button
                      onClick={() => setAdding(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#124540] dark:text-[#49BFB4] hover:underline underline-offset-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah agenda
                    </button>
                  )}
                </div>

                {modal.events.length === 0 && !adding && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Belum ada agenda.</p>
                )}

                <ul className="space-y-2">
                  {modal.events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${safeColor(ev.color)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 break-words">{ev.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {ev.event_time && (
                            <span className="flex items-center gap-1 font-mono tabular-nums">
                              <Clock className="w-3 h-3" /> {ev.event_time}
                            </span>
                          )}
                          {ev.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {ev.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(ev)}
                        aria-label={`Hapus agenda ${ev.title}`}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>

                {adding && (
                  <div className="mt-3 space-y-3 rounded-md border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={120}
                      placeholder="Judul agenda"
                      className={fieldCls}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Jam (opsional)" className={fieldCls} />
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        maxLength={120}
                        placeholder="Tempat (opsional)"
                        className={fieldCls}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Warna agenda">
                      {EVENT_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={color === c.value}
                          aria-label={c.name}
                          title={c.name}
                          onClick={() => setColor(c.value)}
                          className={`w-6 h-6 rounded-full ${c.value} transition-shadow duration-150 ${
                            color === c.value ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-white dark:ring-offset-zinc-950" : ""
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={resetForm}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors duration-150"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => void handleAddEvent()}
                        disabled={saving || !title.trim()}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center gap-1.5"
                      >
                        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Simpan
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Daftar pesanan pada satu hari (deadline atau masuk); klik membuka detail. */
function OrderGroup({
  title,
  orders,
  emptyText,
  onSelect,
}: {
  title: string;
  orders: Order[];
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2">
        {title}
      </h4>
      {orders.length === 0 ? (
        emptyText && <p className="text-xs text-zinc-400 dark:text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => onSelect(o.id)}
                className="w-full text-left rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 hover:border-[#124540] dark:hover:border-[#49BFB4] hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors duration-150"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{o.nama_pemesan}</span>
                  <span
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide whitespace-nowrap ${getStatusColor(o.status)}`}
                  >
                    {o.status}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  <span className="font-mono">#{o.kode_produksi}</span> ·{" "}
                  <span className="font-mono tabular-nums">{o.jumlah}</span> pcs ·{" "}
                  {o.kategori === "utama" ? "Utama" : "Non-Utama"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
