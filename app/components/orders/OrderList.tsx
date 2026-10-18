// app/components/orders/OrderList.tsx
// Daftar pesanan aktif (menu Pesanan Utama & Pesanan Non-Utama) — tampilan sama
// dengan Sablon: papan Kanban di desktop (Pesanan Masuk · Produksi · Finishing ·
// Pengiriman), kartu (HP & Kanban) dengan progress bar + keterangan tahap, filter status/bulan/jenis,
// urut paling mendesak, dan tombol hapus (pindah ke Sampah).
"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import type { Order, OrderStatus, ProductionTypeData } from "@/types/order";
import { activeStepName, currentPhase, stepProgress } from "@/lib/steps";
import {
  MONTHS,
  formatDate,
  daysUntil,
  getDeadlineStatus,
  parseLocalDate,
  typeLabel as typeName,
} from "@/lib/utils";

interface Props {
  orders: Order[];
  productionTypes: ProductionTypeData[];
  title: string;
  loading?: boolean;
  canCreate: boolean;
  canDelete: boolean;
  /** id pesanan yang sedang dihapus (spinner di tombol hapus) */
  deletingOrderId?: string | null;
  onNewOrder: () => void;
  onSelectOrder: (id: string) => void;
  /** konfirmasi hapus ditangani pemanggil */
  onDeleteOrder: (order: Order) => void;
}

// ─── Teks & status ───────────────────────────────────────────────────────────

/** "Seragam Sekolah, Celana Sekolah" — dari item; pesanan utama sebelum Approval belum punya. */
function typeLabelOf(o: Order, types: ProductionTypeData[]): string {
  if (o.items.length > 0)
    return o.items.map((it) => typeName(it.jenis_produksi, types)).join(", ");
  if (o.jenis_produksi) return typeName(o.jenis_produksi, types);
  return "Belum dipilih";
}

const isOverdueOrder = (o: Order) =>
  o.status === "Telat" || getDeadlineStatus(o.deadline, o.status) === "overdue";

const isSpecialStatus = (status: string) =>
  ["Revisi", "Ada Kendala", "Telat"].includes(status);

function statusBadgeClass(status: string): string {
  switch (status) {
    case "Pesanan Masuk":
      return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    case "On Process":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
    case "Finishing":
      return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800";
    case "Kirim":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
    case "Selesai":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800";
    case "Revisi":
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
    case "Ada Kendala":
    case "Telat":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    default:
      return "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
  }
}

// ─── Progress tahap (dipakai kartu HP & Kanban) ──────────────────────────────
// Bar = persentase tahap yang sudah selesai; di bawahnya tertulis sudah sampai
// tahap apa ("Tahap: Jahit"). Warna bar berubah bila telat / kendala / revisi.

function StepProgress({
  order,
  overdue,
  compact,
}: {
  order: Order;
  overdue: boolean;
  compact?: boolean;
}) {
  const progress = stepProgress(order.steps);
  const tahap = activeStepName(order.steps);
  const barColor =
    overdue || order.status === "Ada Kendala"
      ? "bg-red-500 dark:bg-red-500"
      : order.status === "Revisi"
        ? "bg-orange-400 dark:bg-orange-500"
        : "bg-[#124540] dark:bg-[#49BFB4]";

  return (
    <div className={compact ? "mt-2 mb-2" : "mt-2 mb-1"}>
      <div className="h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div
        className={`mt-1.5 flex items-center justify-between gap-2 text-zinc-500 dark:text-zinc-400 ${compact ? "text-[10px]" : "text-[11px]"}`}
      >
        <span className="truncate">Tahap: {tahap}</span>
        <span className="font-mono tabular-nums shrink-0">{progress}%</span>
      </div>
    </div>
  );
}

// ─── Tombol hapus (dipakai kartu HP & Kanban) ────────────────────────────────

function DeleteButton({
  isDeleting,
  compact,
  onClick,
}: {
  isDeleting: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={isDeleting}
      aria-busy={isDeleting}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDeleting) onClick();
      }}
      className={`mt-2 w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-150 border border-red-200 dark:border-red-900/50 flex items-center justify-center gap-1.5 disabled:cursor-wait ${
        compact
          ? `px-2 py-1 text-[9px] ${isDeleting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
          : "px-3 py-1.5 text-[10px]"
      }`}
    >
      {isDeleting ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" /> Menghapus…
        </>
      ) : (
        <>
          <Trash2 className="w-3 h-3" /> Hapus
        </>
      )}
    </button>
  );
}

// ─── Kartu HP ────────────────────────────────────────────────────────────────

interface CardProps {
  order: Order;
  types: ProductionTypeData[];
  canDelete: boolean;
  isDeleting: boolean;
  onSelectOrder: (id: string) => void;
  onDeleteOrder: (order: Order) => void;
}

function MobileCard({
  order,
  types,
  canDelete,
  isDeleting,
  onSelectOrder,
  onDeleteOrder,
}: CardProps) {
  const overdue = isOverdueOrder(order);
  const isKendala = order.status === "Ada Kendala";
  const isDone = order.status === "Selesai" || order.status === "Kirim";

  let borderAccent = "border-zinc-200 dark:border-zinc-800";
  if (overdue)
    borderAccent =
      "border-t-2 border-t-red-400 border-x-zinc-200 border-b-zinc-200 dark:border-t-red-600 dark:border-x-zinc-800 dark:border-b-zinc-800";
  else if (isKendala)
    borderAccent =
      "border-t-2 border-t-orange-400 border-x-zinc-200 border-b-zinc-200 dark:border-t-orange-500 dark:border-x-zinc-800 dark:border-b-zinc-800";
  else if (isDone)
    borderAccent =
      "border-t-2 border-t-emerald-400 border-x-zinc-200 border-b-zinc-200 dark:border-t-emerald-600 dark:border-x-zinc-800 dark:border-b-zinc-800";

  return (
    <div
      onClick={() => {
        if (!isDeleting) onSelectOrder(order.id);
      }}
      aria-busy={isDeleting}
      className={`block bg-white dark:bg-zinc-950 rounded-xl border ${borderAccent} p-3 transition-colors duration-150 ${isDeleting ? "cursor-wait" : "cursor-pointer"}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500">
          #{order.kode_produksi}
        </span>
        <div className="flex items-center gap-1">
          {isSpecialStatus(order.status) && (
            <AlertTriangle className="w-3 h-3 text-red-500 dark:text-red-400" />
          )}
          <span
            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${statusBadgeClass(overdue && !isKendala ? "Telat" : order.status)}`}
          >
            {overdue && !isKendala ? "Telat" : order.status}
          </span>
        </div>
      </div>

      <p className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1 mb-1 leading-tight">
        {order.nama_pemesan}
      </p>

      <StepProgress order={order} overdue={overdue} />

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">
            {order.jumlah.toLocaleString("id-ID")} pcs
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
            ·
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-semibold truncate">
            {typeLabelOf(order, types)}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold shrink-0 ${overdue ? "text-red-500 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          {formatDate(order.deadline)}
        </span>
      </div>

      {canDelete && (
        <DeleteButton
          isDeleting={isDeleting}
          onClick={() => onDeleteOrder(order)}
        />
      )}
    </div>
  );
}

// ─── Kanban (desktop) ────────────────────────────────────────────────────────

const KANBAN_COLUMNS: {
  phase: OrderStatus;
  label: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  countClass: string;
}[] = [
  {
    phase: "Pesanan Masuk",
    label: "Pesanan Masuk",
    borderClass: "border-t-zinc-400 dark:border-t-zinc-500",
    bgClass: "bg-zinc-100 dark:bg-zinc-800/60",
    textClass: "text-zinc-700 dark:text-zinc-200",
    countClass: "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300",
  },
  {
    phase: "On Process",
    label: "Produksi",
    borderClass: "border-t-blue-500 dark:border-t-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-900/30",
    textClass: "text-blue-700 dark:text-blue-300",
    countClass:
      "bg-blue-100 dark:bg-blue-800/60 text-blue-600 dark:text-blue-300",
  },
  {
    phase: "Finishing",
    label: "Finishing",
    borderClass: "border-t-violet-500 dark:border-t-violet-400",
    bgClass: "bg-violet-50 dark:bg-violet-900/30",
    textClass: "text-violet-700 dark:text-violet-300",
    countClass:
      "bg-violet-100 dark:bg-violet-800/60 text-violet-600 dark:text-violet-300",
  },
  {
    phase: "Kirim",
    label: "Pengiriman",
    borderClass: "border-t-amber-500 dark:border-t-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-900/30",
    textClass: "text-amber-700 dark:text-amber-300",
    countClass:
      "bg-amber-100 dark:bg-amber-800/60 text-amber-600 dark:text-amber-300",
  },
];

function KanbanCard({
  order,
  types,
  canDelete,
  isDeleting,
  onSelectOrder,
  onDeleteOrder,
}: CardProps) {
  const overdue = isOverdueOrder(order);
  const isKendala = order.status === "Ada Kendala";
  const isRevisi = order.status === "Revisi";

  let leftBorder = "";
  if (overdue) leftBorder = "border-l-2 border-l-red-400 dark:border-l-red-600";
  else if (isKendala)
    leftBorder = "border-l-2 border-l-orange-400 dark:border-l-orange-500";
  else if (isRevisi)
    leftBorder = "border-l-2 border-l-amber-400 dark:border-l-amber-500";

  return (
    <div
      onClick={() => {
        if (!isDeleting) onSelectOrder(order.id);
      }}
      aria-busy={isDeleting}
      className={`block bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 ${leftBorder} p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors duration-150 group ${isDeleting ? "cursor-wait" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 font-semibold mt-0.5">
          #{order.kode_produksi}
        </span>
        {isSpecialStatus(order.status) && (
          <span
            className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wide flex items-center gap-0.5 ${statusBadgeClass(order.status)}`}
          >
            <AlertTriangle className="w-2 h-2" /> {order.status}
          </span>
        )}
      </div>

      <p className="font-semibold text-xs text-zinc-900 dark:text-white line-clamp-2 leading-tight mb-2">
        {order.nama_pemesan}
      </p>

      <StepProgress order={order} overdue={overdue} compact />

      <div className="space-y-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3 shrink-0" />
          <span className="font-mono tabular-nums font-medium">
            {order.jumlah.toLocaleString("id-ID")} pcs
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className="uppercase font-semibold truncate">
            {typeLabelOf(order, types)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0" />
          <span
            className={
              overdue ? "text-red-500 dark:text-red-400 font-semibold" : ""
            }
          >
            {formatDate(order.deadline)}
            {overdue && " · Telat!"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 shrink-0" />
          <span>{formatDate(order.tanggal_masuk)}</span>
        </div>
      </div>

      {canDelete && (
        <DeleteButton
          compact
          isDeleting={isDeleting}
          onClick={() => onDeleteOrder(order)}
        />
      )}
    </div>
  );
}

/** Telat dulu, lalu yang deadline-nya ≤ 3 hari, sisanya menurut tanggal masuk. */
function sortByUrgency(orders: Order[]): Order[] {
  const tier = (o: Order): number => {
    if (isOverdueOrder(o)) return 0;
    return daysUntil(o.deadline) <= 3 ? 1 : 2;
  };

  return [...orders].sort((a, b) => {
    const ta = tier(a),
      tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta < 2)
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    return (
      new Date(a.tanggal_masuk).getTime() - new Date(b.tanggal_masuk).getTime()
    );
  });
}

function KanbanBoard({
  orders,
  ...card
}: { orders: Order[] } & Omit<CardProps, "order" | "isDeleting"> & {
    deletingOrderId?: string | null;
  }) {
  const sorted = sortByUrgency(orders);
  const { deletingOrderId, ...rest } = card;
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {KANBAN_COLUMNS.map((col) => {
        const colOrders = sorted.filter((o) => currentPhase(o) === col.phase);
        return (
          <div key={col.phase} className="flex-1 min-w-44">
            <div
              className={`rounded-xl border-t-2 border border-zinc-200 dark:border-zinc-800 ${col.borderClass} ${col.bgClass} mb-2 px-3 py-2 flex items-center justify-between`}
            >
              <span className={`text-xs font-semibold ${col.textClass}`}>
                {col.label}
              </span>
              <span
                className={`font-mono tabular-nums text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.countClass}`}
              >
                {colOrders.length}
              </span>
            </div>
            <div className="space-y-2">
              {colOrders.map((o) => (
                <KanbanCard
                  key={o.id}
                  order={o}
                  isDeleting={deletingOrderId === o.id}
                  {...rest}
                />
              ))}
              {colOrders.length === 0 && (
                <div className="text-center text-[10px] text-zinc-300 dark:text-zinc-700 py-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
                  Kosong
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Komponen utama ──────────────────────────────────────────────────────────

const selectCls =
  "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs rounded-md px-2 py-2 focus:ring-2 focus:ring-[#124540] focus:border-[#124540] outline-none transition-colors duration-150";

export default function OrderList({
  orders,
  productionTypes,
  title,
  loading,
  canCreate,
  canDelete,
  deletingOrderId,
  onNewOrder,
  onSelectOrder,
  onDeleteOrder,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");

  // pilihan "Semua Jenis": hanya jenis kategori daftar ini (utama / non-utama)
  const kategori = orders[0]?.kategori;
  const typeOptions = useMemo(
    () => productionTypes.filter((t) => !kategori || t.kategori === kategori),
    [productionTypes, kategori],
  );

  // Arsip "Selesai" ada di menu Pesanan Selesai (Bagian 3), bukan di sini
  const active = useMemo(
    () => orders.filter((o) => o.status !== "Selesai"),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((o) => {
      if (
        statusFilter === "process" &&
        !["On Process", "Finishing", "Pesanan Masuk"].includes(o.status)
      )
        return false;
      if (statusFilter === "overdue" && !isOverdueOrder(o)) return false;
      if (
        statusFilter === "kendala" &&
        !["Ada Kendala", "Revisi"].includes(o.status)
      )
        return false;
      if (statusFilter === "ready" && o.status !== "Kirim") return false;
      if (
        monthFilter !== "all" &&
        parseLocalDate(o.tanggal_masuk).getMonth().toString() !== monthFilter
      )
        return false;
      if (typeFilter !== "all") {
        const has =
          o.items.some((it) => it.jenis_produksi === typeFilter) ||
          o.jenis_produksi === typeFilter;
        if (!has) return false;
      }
      if (
        q &&
        !`${o.kode_produksi} ${o.nama_pemesan} ${o.no_hp ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [active, statusFilter, monthFilter, typeFilter, query]);

  const countOverdue = active.filter(isOverdueOrder).length;
  const countKendala = active.filter((o) =>
    ["Ada Kendala", "Revisi"].includes(o.status),
  ).length;

  const filterButtons: {
    id: string | null;
    label: string;
    count: number | null;
  }[] = [
    { id: null, label: "Semua", count: null },
    { id: "process", label: "Proses", count: null },
    { id: "overdue", label: "Telat", count: countOverdue },
    { id: "kendala", label: "Kendala", count: countKendala },
    { id: "ready", label: "Siap Kirim", count: null },
  ];

  const cardProps = {
    types: productionTypes,
    canDelete,
    onSelectOrder,
    onDeleteOrder,
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="hidden md:block">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            {title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            <span className="font-mono tabular-nums">{filtered.length}</span>{" "}
            pesanan ditampilkan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none md:w-48 min-w-32">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode, nama, HP…"
              className={`${selectCls} w-full pl-8`}
            />
          </div>
          <select
            className={selectCls}
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="all">Semua Bulan</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i.toString()}>
                {m}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Semua Jenis</option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.value}>
                {t.name}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              onClick={onNewOrder}
              className="ml-auto md:ml-0 bg-[#124540] hover:bg-[#0d332f] text-white px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors duration-150 whitespace-nowrap"
            >
              <ClipboardList className="w-3.5 h-3.5" /> Pesanan baru
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {filterButtons.map((f) => (
          <button
            key={f.id ?? "all"}
            onClick={() => setStatusFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 border ${
              statusFilter === f.id
                ? "bg-[#124540] text-white border-[#124540]"
                : "bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
          >
            {f.label}
            {f.count !== null && f.count > 0 && (
              <span
                className={`font-mono tabular-nums text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                  statusFilter === f.id
                    ? "bg-white/20 text-white"
                    : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                }`}
              >
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">
          Memuat data pesanan…
        </p>
      ) : (
        <>
          {/* Kanban — desktop */}
          <div className="hidden md:block">
            {filtered.length > 0 ? (
              <KanbanBoard
                orders={filtered}
                deletingOrderId={deletingOrderId}
                {...cardProps}
              />
            ) : (
              <div className="text-center text-zinc-400 dark:text-zinc-500 py-16 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/50 text-sm">
                Tidak ada pesanan sesuai filter
              </div>
            )}
          </div>

          {/* Kartu — HP */}
          <div className="md:hidden space-y-2.5">
            {filtered.length > 0 ? (
              sortByUrgency(filtered).map((o) => (
                <MobileCard
                  key={o.id}
                  order={o}
                  isDeleting={deletingOrderId === o.id}
                  {...cardProps}
                />
              ))
            ) : (
              <div className="text-center text-zinc-400 dark:text-zinc-500 py-12 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/50 text-xs">
                Tidak ada pesanan sesuai filter
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
