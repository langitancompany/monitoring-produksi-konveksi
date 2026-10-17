// hooks/useNotifications.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { UNIT } from '@/lib/config';

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  orderId?: string;
  type?: 'warning' | 'info' | 'success';
}

interface UseNotificationsProps {
  currentUserId: string | null;
  supabase: SupabaseClient;
}

export function useNotifications({ currentUserId, supabase }: UseNotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Waktu terakhir fallback fetch dijalankan karena Realtime error.
  // Dipakai supaya retry otomatis Supabase tidak memicu fetch berulang-ulang.
  const lastFallbackFetchRef = useRef(0);

  const mapNotification = (n: any): Notification => ({
    id: n.id,
    title: n.title,
    message: n.message,
    time: new Date(n.created_at).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
    isRead: n.is_read,
    orderId: n.order_id,
    type: n.type ?? 'info',
  });

  const fetchNotifications = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data.map(mapNotification));
      }
    } catch (error) {
      console.error('Err fetch notifications:', error);
    }
  }, [currentUserId, supabase]);

  // ─── Realtime subscription ──────────────────────────────────────────────────
  // Menggantikan setInterval 60 detik — notifikasi muncul instan saat INSERT
  useEffect(() => {
    if (!currentUserId) return;

    // Fetch awal
    fetchNotifications();

    // Bersihkan channel lama jika ada (misal user berganti)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: UNIT.dbSchema,
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          // Tambah notifikasi baru langsung ke state tanpa fetch ulang
          const newNotif = mapNotification(payload.new);
          setNotifications(prev => {
            // Cegah duplikat jika somehow event datang dua kali
            if (prev.some(n => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev].slice(0, 20);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: UNIT.dbSchema,
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          // Sync status is_read secara realtime (misal dibaca di tab lain)
          setNotifications(prev =>
            prev.map(n =>
              n.id === payload.new.id ? { ...n, isRead: payload.new.is_read } : n
            )
          );
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime notifications aktif');
        }
        if (status === 'CHANNEL_ERROR') {
          // Sertakan `err` supaya kelihatan penyebab aslinya
          // (tabel belum di-enable untuk Realtime, atau koneksi WebSocket gagal).
          console.warn('⚠️ Realtime error, fallback ke fetch manual', err);

          // Supabase otomatis retry dan callback ini terpanggil tiap retry gagal.
          // Batasi fallback fetch maksimal sekali per 30 detik.
          const now = Date.now();
          if (now - lastFallbackFetchRef.current > 30_000) {
            lastFallbackFetchRef.current = now;
            fetchNotifications();
          }
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUserId, supabase]); // fetchNotifications sengaja tidak dimasukkan agar tidak re-subscribe

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      // Optimistic update — tidak perlu tunggu Realtime
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
    } catch (error) {
      console.error('Err mark as read:', error);
    }
  }, [supabase]);

  const markAllAsRead = useCallback(async () => {
    if (!currentUserId) return;
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Err mark all as read:', error);
    }
  }, [currentUserId, supabase]);

  return {
    notifications,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}