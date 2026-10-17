// app/components/orders/OrderDetail.tsx
// Detail pesanan. BAGIAN 1: hanya baca (info + daftar tahap).
// BAGIAN 2 menambah aksi tiap tahap (approval, upload, QC, kendala, edit, hapus).
"use client";

import React from "react";
import { ArrowLeft, Check, Circle, Phone } from "lucide-react";
import type { Order, ProductionTypeData } from "@/types/order";
import { formatDate, getStatusColor, openWA, typeLabel } from "@/lib/utils";

interface Props {
  order: Order;
  productionTypes: ProductionTypeData[];
  onBack: () => void;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">{label}</p>
    <div className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{children}</div>
  </div>
);

export default function OrderDetail({ order, productionTypes, onBack }: Props) {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150">
        <ArrowLeft className="w-4 h-4" /> Kembali ke daftar
      </button>

      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono tabular-nums text-xs text-zinc-500 dark:text-zinc-400">{order.kode_produksi}</p>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{order.nama_pemesan}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pesanan {order.kategori === "utama" ? "Utama" : "Non-Utama"}
            </p>
          </div>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(order.status)}`}>{order.status}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Row label="Jenis produksi">{order.jenis_produksi ? typeLabel(order.jenis_produksi, productionTypes) : "Belum dipilih"}</Row>
          <Row label="Jumlah"><span className="font-mono tabular-nums">{order.jumlah}</span> pcs</Row>
          <Row label="Tanggal masuk">{formatDate(order.tanggal_masuk)}</Row>
          <Row label="Deadline">{formatDate(order.deadline)}</Row>
          <Row label="No. HP">
            {order.no_hp ? (
              <button onClick={() => openWA(order.no_hp)} className="inline-flex items-center gap-1 font-mono tabular-nums text-[#124540] dark:text-[#49BFB4] underline underline-offset-2">
                <Phone className="w-3 h-3" /> {order.no_hp}
              </button>
            ) : "-"}
          </Row>
          <Row label="Alamat">{order.alamat_pemesan || "-"}</Row>
        </div>

        {order.catatan_pesanan && <Row label="Catatan">{order.catatan_pesanan}</Row>}
      </div>

      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-4">Tahapan Produksi</h3>
        <ol className="space-y-3">
          {order.steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${s.isCompleted ? "bg-[#124540] text-white" : "border border-zinc-300 dark:border-zinc-700 text-zinc-400"}`}>
                {s.isCompleted ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-2.5 h-2.5" />}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${s.isCompleted ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"}`}>
                  {i + 1}. {s.name}
                </p>
                {s.isCompleted && s.completedAt && (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {formatDate(s.completedAt)}{s.uploadedBy ? ` · ${s.uploadedBy}` : ""}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
