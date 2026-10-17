// lib/orderLogic.ts
//
// Pemicu notifikasi pesanan: siapa menerima pesan berdasarkan status & deadline.
// (Diadopsi dari Sablon; versi WhatsApp belum dibawa.)
// Notifikasi tersimpan di tabel `notifications` + push FCM lewat notificationHelper.

import type { Order } from "@/types/order";
import { sendToRoles, sendToAllUsers } from "./notificationHelper";

export const triggerOrderNotifications = async (
  orderData: Order,
  oldStatus?: string,
) => {
  const finalStatus = orderData.status;
  const title = `Update: ${orderData.kode_produksi}`;
  const orderId = orderData.id;

  // 1. Pesanan baru
  if (!oldStatus) {
    await sendToAllUsers(
      "📦 Pesanan Baru Masuk!",
      `Order ${orderData.kode_produksi} (${orderData.nama_pemesan}) baru saja dibuat.`,
      orderId,
    );
    return;
  }

  // 2. Status berubah
  if (oldStatus !== finalStatus) {
    switch (finalStatus) {
      case "On Process":
        await sendToRoles(["produksi", "supervisor"], title, "Pesanan siap diproduksi.", orderId);
        break;
      case "Ada Kendala":
        await sendToRoles(["admin", "supervisor", "manager"], "⚠️ ADA KENDALA!", `Order ${orderData.kode_produksi} melaporkan kendala.`, orderId);
        break;
      case "Finishing":
        await sendToRoles(["qc", "supervisor"], title, "Pesanan masuk tahap QC & Packing.", orderId);
        break;
      case "Revisi": {
        const qc = orderData.steps?.find((s) => s.key === "qc");
        await sendToRoles(["produksi", "supervisor", "manager"], "⚠️ REVISI QC", `QC gagal: ${qc?.qc?.notes ?? "-"}`, orderId);
        break;
      }
      case "Selesai":
        await sendToAllUsers("✅ Pesanan Selesai", `Order ${orderData.kode_produksi} telah selesai sepenuhnya!`, orderId);
        break;
    }
  }

  // 3. Mepet / telat
  if (orderData.deadline && finalStatus !== "Selesai" && finalStatus !== "Kirim") {
    const diffDays = Math.ceil(
      (new Date(orderData.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0) {
      await sendToRoles(["produksi", "admin", "supervisor"], "⛔ PESANAN TELAT", `Order ${orderData.kode_produksi} sudah melewati deadline!`, orderId);
    } else if (diffDays <= 2) {
      await sendToRoles(["produksi", "admin", "supervisor"], "🔥 URGENT / MEPET", `Order ${orderData.kode_produksi} deadline tinggal ${diffDays} hari!`, orderId);
    }
  }
};
