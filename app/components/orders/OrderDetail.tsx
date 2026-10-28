// app/components/orders/OrderDetail.tsx
// Detail pesanan — susunan sama dengan Sablon: header & info pesanan, lalu
// 4 kartu tahap: 01 Approval · 02 Produksi (+ kendala) · 03 QC & Packing · 04 Pengiriman.
// Semua tahap dikerjakan dengan upload foto; pengunggah & waktunya tampil.
// Hak akses: orders (edit/hapus), produksi (approval, mockup, potong, jahit),
// finishing (QC, packing, kirim, terima) — aturan di lib/steps.ts & lib/access.ts.
"use client";

import React from "react";
import { ChevronRight, Loader2, Pencil, Phone, Trash2 } from "lucide-react";
import type { KendalaNote, Order, ProductionStep, ProductionTypeData } from "@/types/order";
import type { UserData } from "@/types";
import type { TeamData } from "@/types/team";
import type { ActionLog, OrderFields } from "@/hooks/useOrders";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useOrderNotes } from "@/hooks/useOrderNotes";
import { can, canAny } from "@/lib/access";
import { teamLabel, teamMembers } from "@/lib/teams";
import TeamAvatars from "@/app/components/ui/TeamAvatars";
import { canUndoStep, stepPosition, stepUndoPerms, stepWorkPerms } from "@/lib/steps";
import { formatDate, getDeadlineStatus, getStatusColor, openWA, userLabel } from "@/lib/utils";
import type { StepCtx } from "./detail/stepUi";
import StepApproval from "./detail/StepApproval";
import { itemTitle } from "@/lib/orderItems";
import ItemBreakdown from "@/app/components/orders/ItemBreakdown";
import StepProduksi from "./detail/StepProduksi";
import StepFinishing from "./detail/StepFinishing";
import OrderFinanceSection from "@/app/components/finance/OrderFinanceSection";

interface Props {
  /** client Supabase dari kerangka (dipakai untuk catatan produksi) */
  supabase: SupabaseClient;
  order: Order;
  productionTypes: ProductionTypeData[];
  /** semua tim + semua user — untuk menampilkan tim pesanan beserta avatar anggotanya */
  teams: TeamData[];
  users: UserData[];
  currentUser: UserData & { id: string };
  /** sedang ada penyimpanan berjalan */
  isSaving: boolean;
  isUploading: boolean;
  applyStepUpdate: (
    order: Order,
    stepKey: string,
    patch: Partial<ProductionStep>,
    options?: { log?: ActionLog; fields?: OrderFields; also?: Record<string, Partial<ProductionStep>> },
  ) => Promise<boolean>;
  applyKendalaUpdate: (order: Order, kendala: KendalaNote[], log: ActionLog) => Promise<boolean>;
  uploadProof: (
    order: Pick<Order, "id" | "kode_produksi" | "status">,
    file: File,
    label: string,
    opts?: { allowPdf?: boolean; highRes?: boolean },
  ) => Promise<string | null>;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  onBack: () => void;
  onEdit: () => void;
  /** dipanggil setelah konfirmasi; menghapus = pindah ke Sampah */
  onDelete: (order: Order) => void;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">{label}</p>
    <div className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{children}</div>
  </div>
);

export default function OrderDetail(props: Props) {
  const {
    supabase, order, productionTypes, teams, users, currentUser, isSaving, isUploading,
    applyStepUpdate, applyKendalaUpdate, uploadProof, showAlert, showConfirm,
    onBack, onEdit, onDelete,
  } = props;

  const detail = useOrderDetail({
    order, productionTypes, currentUser, applyStepUpdate, applyKendalaUpdate, uploadProof, showAlert, showConfirm,
  });

  // Catatan produksi (kartu 02, 03, 04) — dimuat sekali untuk satu pesanan
  const notes = useOrderNotes({ supabase, order, currentUser, showAlert, showConfirm });

  const disabled = isSaving || isUploading || detail.busyKey !== null;
  const canEdit = can(currentUser, "orders", "edit");
  const canDelete = can(currentUser, "orders", "delete");
  const canKendala = canAny(currentUser, [["produksi", "edit"], ["finishing", "edit"], ["orders", "edit"]]);
  const canDeleteKendala = canAny(currentUser, [["produksi", "delete"], ["finishing", "delete"], ["orders", "delete"]]);
  const isLate = getDeadlineStatus(order.deadline, order.status) === "overdue" && order.status !== "Ada Kendala";
  const team = order.team_id ? teams.find((t) => t.id === order.team_id) ?? null : null;
  const teamMemberList = teamMembers(team, users);

  const indexOf = (key: string) => order.steps.findIndex((s) => s.key === key);
  const ctx: StepCtx = {
    order,
    disabled,
    busyKey: detail.busyKey,
    canWork: (key) => canAny(currentUser, stepWorkPerms(key)),
    canUndo: (key) => {
      const i = indexOf(key);
      return i >= 0 && canUndoStep(order.steps, i) && canAny(currentUser, stepUndoPerms(key));
    },
    position: (key) => {
      const i = indexOf(key);
      return i >= 0 ? stepPosition(order.steps, i) : "locked";
    },
    onUpload: detail.uploadStep,
    onUndo: detail.undoStep,
  };

  const confirmDelete = () =>
    showConfirm(
      "Hapus pesanan?",
      `Pesanan ${order.kode_produksi} (${order.nama_pemesan}) akan dipindah ke Sampah. Data tidak hilang dan bisa dipulihkan.`,
      () => onDelete(order),
    );

  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-6 pb-24 relative">
      {/* Tombol aksi atas */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 hover:text-[#49BFB4] flex items-center gap-2 font-semibold p-2 -ml-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors duration-150"
        >
          <ChevronRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" /> Kembali
        </button>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              onClick={onEdit}
              disabled={disabled}
              className="bg-[#124540] text-white px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-60 transition-colors duration-150"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={confirmDelete}
              disabled={disabled}
              className="bg-red-600 text-white px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-2 hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {isSaving ? (<><Loader2 className="w-3 h-3 animate-spin" /> Menghapus...</>) : (<><Trash2 className="w-3 h-3" /> Hapus</>)}
            </button>
          )}
        </div>
      </div>

      {/* Info pesanan */}
      <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-semibold text-zinc-900 dark:text-white mb-1">{order.nama_pemesan}</h1>
          <div className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 font-medium flex flex-wrap gap-2 md:gap-3 items-center">
            <span className="font-mono tabular-nums bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-300">
              #{order.kode_produksi}
            </span>
            <span className="font-mono tabular-nums">{order.kategori === "utama" && order.jumlah === 0 ? "Jumlah diisi saat Approval" : `${order.jumlah} Pcs`}</span>
            <span className={isLate ? "font-mono tabular-nums text-red-600 dark:text-red-400 font-semibold" : "font-mono tabular-nums"}>
              {formatDate(order.deadline)}
            </span>
            <span className="text-[10px] uppercase tracking-wide">{order.kategori === "utama" ? "Pesanan Utama" : "Non-Utama"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end w-full md:w-auto">
          <div className={`px-2.5 py-1 rounded-full font-semibold text-[11px] uppercase tracking-wide text-center w-full md:w-auto border ${getStatusColor(order.status)}`}>
            {order.status}
          </div>
          {isLate && (
            <div className="px-2.5 py-1 rounded-full font-semibold text-[11px] bg-red-600 text-white uppercase tracking-wide text-center w-full md:w-auto">
              Telat Deadline
            </div>
          )}
        </div>
      </div>

      {/* Detail pesanan */}
      <div className="bg-white dark:bg-zinc-950 p-5 md:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Row label="Tanggal masuk">{formatDate(order.tanggal_masuk)}</Row>
          <Row label="No. HP">
            {order.no_hp ? (
              <button onClick={() => openWA(order.no_hp)} className="inline-flex items-center gap-1 font-mono tabular-nums text-[#124540] dark:text-[#49BFB4] underline underline-offset-2">
                <Phone className="w-3 h-3" /> {order.no_hp}
              </button>
            ) : "-"}
          </Row>
          <Row label="Alamat">{order.alamat_pemesan || "-"}</Row>
        </div>

        <Row label="Penanggung jawab (PJ)">
          {order.assigned_to ? (
            <span className="font-semibold">{userLabel(users, order.assigned_to)}</span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">Belum ditentukan</span>
          )}
        </Row>

        <Row label="Tim pengerjaan">
          {order.team_id ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{teamLabel(teams, order.team_id)}</span>
              {team && <TeamAvatars members={teamMemberList} max={8} size="sm" />}
            </div>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">Belum ditentukan</span>
          )}
        </Row>

        {order.items.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1.5">Item pesanan</p>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800">
              {order.items.map((it) => (
                <li key={it.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-900 dark:text-zinc-100">
                      {itemTitle(it, productionTypes)}
                      {it.catatan && <span className="text-xs text-zinc-400 dark:text-zinc-500"> — {it.catatan}</span>}
                    </span>
                    <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{it.jumlah} pcs</span>
                  </div>
                  <ItemBreakdown item={it} />
                  {it.mockup_url && (
                    <a
                      href={it.mockup_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.mockup_url} alt={`Mockup ${it.nama_model ?? ""}`} className="w-20 h-20 object-contain rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900" />
                      Lihat mockup
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {order.kategori === "utama" && order.items.length === 0 && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">Jenis produksi & item ditentukan saat Approval.</p>
        )}
        {order.catatan_pesanan && <Row label="Catatan">{order.catatan_pesanan}</Row>}
      </div>

      {/* 01 Approval */}
      <StepApproval ctx={ctx} productionTypes={productionTypes} onApproval={detail.submitApproval} />

      {/* 02 Produksi */}
      <StepProduksi
        ctx={ctx}
        productionTypes={productionTypes}
        canKendala={canKendala}
        canDeleteKendala={canDeleteKendala}
        onAddKendala={detail.addKendala}
        onResolveKendala={detail.resolveKendala}
        onDeleteKendala={detail.deleteKendala}
        onAddKendalaBukti={detail.addKendalaBukti}
        notes={notes}
      />

      {/* 03 QC & Packing, 04 Pengiriman */}
      <StepFinishing ctx={ctx} onQC={detail.submitQC} notes={notes} />

      {/* Harga & Pembayaran — hanya untuk yang punya izin Keuangan (Bagian 6, langkah 6.4) */}
      {can(currentUser, "keuangan", "view") && (
        <OrderFinanceSection orderId={order.id} productionTypes={productionTypes} />
      )}
    </div>
  );
}
