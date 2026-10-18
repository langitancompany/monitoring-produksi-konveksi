// lib/notificationHelper.ts - FIXED VERSION WITH order_id

import { createClient } from '@/lib/supabase/client';

// 1. Kirim ke 1 User (Spesifik)
// ✅ UPDATED: Tambah parameter orderId
export const sendNotification = async (
  targetUserId: string, 
  title: string, 
  body: string, 
  orderId?: string
) => {
  try {
    if (!targetUserId) return;

    const supabase = createClient();

    // Simpan notifikasi ke database untuk ditampilkan di icon lonceng
    const { error: dbError } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      title,
      message: body,
      order_id: orderId, // ✅ Tambahkan order_id
      is_read: false
    });

    if (dbError) {
      console.error('❌ Gagal simpan notifikasi ke database:', dbError);
    } else {
      console.log(`✅ Notifikasi "${title}" disimpan untuk user ${targetUserId}`);
    }

    // (Opsional) Kirim push notification jika API tersedia
    try {
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, title, body }),
      });
    } catch (pushError) {
      // Push notification gagal tidak masalah, notifikasi tetap tersimpan di database
      console.log('ℹ️ Push notification tidak tersedia');
    }

  } catch (error) {
    console.error("❌ Gagal kirim notif:", error);
  }
};

// 2 & 3. Kirim ke banyak user (per role / semua user).
// Penerima dicari di SERVER (/api/notify, service role) — dari browser, user
// non-admin tidak boleh membaca daftar user lain sehingga hasilnya kosong
// (lihat docs/PRD.md §13.4). Gagal kirim tidak boleh menggagalkan aksi utama,
// jadi error hanya dicatat di console.
async function notifyServer(payload: {
  roles?: string[];
  all?: boolean;
  title: string;
  message: string;
  orderId?: string;
}) {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      console.error('❌ /api/notify gagal:', res.status, json?.error);
    }
  } catch (error) {
    console.error('❌ Tidak bisa menghubungi /api/notify:', error);
  }
}

// Contoh: sendToRoles(['produksi', 'supervisor'], 'Judul', 'Pesan', 'order-uuid')
export const sendToRoles = async (
  roles: string[],
  title: string,
  body: string,
  orderId?: string
) => {
  await notifyServer({ roles, title, message: body, orderId });
};

export const sendToAllUsers = async (
  title: string,
  body: string,
  orderId?: string
) => {
  await notifyServer({ all: true, title, message: body, orderId });
};

// 4. Tandai notifikasi sebagai sudah dibaca
export const markAsRead = async (notificationId: string) => {
  const supabase = createClient();
  
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    
    if (error) {
      console.error('❌ Error mark as read:', error);
    }
  } catch (error) {
    console.error('❌ Error markAsRead:', error);
  }
};

// 5. Tandai semua notifikasi user sebagai sudah dibaca
export const markAllAsRead = async (userId: string) => {
  const supabase = createClient();
  
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    
    if (error) {
      console.error('❌ Error mark all as read:', error);
    } else {
      console.log('✅ Semua notifikasi ditandai sebagai dibaca');
    }
  } catch (error) {
    console.error('❌ Error markAllAsRead:', error);
  }
};