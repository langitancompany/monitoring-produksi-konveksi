// app/components/misc/FCMManager.tsx
"use client";

import { useEffect, useState } from "react";
import { getFCM, getToken } from "@/lib/firebase";
import { onMessage } from "firebase/messaging";
import { createClient } from "@/lib/supabase/client";

const VAPID_KEY =
  "BLGGnbBrSV79Yq6qsWxWcVJ_l7oFkW1xM9tcYQaqalCew_qoIyC7KhHM0gdUzgLB4Rpq8QAJeNzUO9m-hLYdLP8";
const TOKEN_STORAGE_KEY = "fcm_token";

// ─── Fungsi inti: daftarkan SW dan ambil token ────────────────────────────────
async function registerFCMToken(): Promise<string | null> {
  try {
    const swReg = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      {
        scope: "/",
      },
    );

    // Tunggu SW benar-benar activated
    await new Promise<void>((resolve) => {
      if (swReg.active) {
        resolve();
        return;
      }
      const pendingSW = swReg.installing ?? swReg.waiting;
      if (!pendingSW) {
        resolve();
        return;
      }
      pendingSW.addEventListener("statechange", () => {
        if (pendingSW.state === "activated") resolve();
      });
    });

    const messaging = await getFCM();
    if (!messaging) return null;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    return token ?? null;
  } catch (err) {
    console.error("💥 registerFCMToken error:", err);
    return null;
  }
}

// ─── Tampilkan notifikasi saat app di foreground (seperti WhatsApp) ───────────
function showForegroundNotification(title: string, body: string, data?: any) {
  // Gunakan Notification API langsung — ini yang muncul meski tab aktif
  if (Notification.permission !== "granted") return;

  const notif = new Notification(title, {
    body,
    icon: `${window.location.origin}/logo.png`,
    badge: `${window.location.origin}/icon-bedge.png`,
    tag: data?.orderId ? `order-${data.orderId}` : "notif-general",
    renotify: true,
  } as any);

  // Klik notifikasi → fokus ke tab aplikasi
  notif.onclick = () => {
    window.focus();
    notif.close();
    // Navigasi ke order jika ada orderId
    if (data?.orderId) {
      window.dispatchEvent(
        new CustomEvent("fcm-notification-click", {
          detail: { orderId: data.orderId },
        }),
      );
    }
  };
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
const FCMManager = () => {
  // PERBAIKAN: dibuat SEKALI saja lewat lazy initializer useState.
  // Sebelumnya `createClient()` dipanggil ulang di setiap render,
  // yang menghasilkan banyak instance client "hantu" — masing-masing
  // otomatis menyalakan timer auto-refresh token sendiri di background,
  // sehingga terjadi ribuan request refresh_token tanpa henti dan
  // menghabiskan rate limit Supabase.
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      if (typeof window === "undefined") return;
      if (!("Notification" in window) || !("serviceWorker" in navigator))
        return;

      // Cek login DULU sebelum minta izin notifikasi — supaya pengunjung
      // yang belum login (misal buka portal reseller publik) tidak ditanya.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Kalau belum pernah ditanya sama sekali ("default"), langsung minta izin
      // otomatis saat pertama kali buka app setelah login — tidak perlu lagi
      // buka menu Settings dulu.
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
      } else if (Notification.permission !== "granted") {
        // User sudah pernah menolak ("denied") — browser tidak akan
        // menampilkan popup lagi kalau kita minta ulang, jadi berhenti di sini.
        return;
      }

      // Auto-refresh token jika berubah
      const token = await registerFCMToken();
      if (token) {
        const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (storedToken !== token) {
          const { error } = await supabase
            .from("user_fcm_tokens")
            .upsert(
              { user_id: user.id, token, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
          if (!error) {
            localStorage.setItem(TOKEN_STORAGE_KEY, token);
            console.log("✅ FCM token auto-refreshed");
          }
        }
      }

      // ── Foreground message listener ─────────────────────────────────────────
      // Ini yang menangkap notifikasi saat app sedang aktif di foreground
      // Sama seperti WhatsApp yang tetap muncul popup meski app dibuka
      const messaging = await getFCM();
      if (!messaging) return;

      const unsub = onMessage(messaging, (payload) => {
        console.log("📨 Foreground message diterima:", payload);

        const title = payload.notification?.title ?? "Notifikasi Baru";
        const body = payload.notification?.body ?? "";
        const data = payload.data ?? {};

        showForegroundNotification(title, body, data);
      });

      unsubscribe = unsub;
    };

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return null;
};

export default FCMManager;

// ─── Fungsi publik: dipanggil dari tombol "Aktifkan Notifikasi" ───────────────
export async function requestAndRegisterFCM(): Promise<
  "granted" | "denied" | "unsupported"
> {
  try {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator)
    ) {
      return "unsupported";
    }

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "denied";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const token = await registerFCMToken();
    if (!token) return "denied";

    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken === token) return "granted";

    const { error } = await supabase
      .from("user_fcm_tokens")
      .upsert(
        { user_id: user.id, token, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("❌ Gagal simpan token:", error);
      return "denied";
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    console.log("✅ Token tersimpan");
    return "granted";
  } catch (err) {
    console.error("💥 requestAndRegisterFCM error:", err);
    return "denied";
  }
}
