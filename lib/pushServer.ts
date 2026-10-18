// lib/pushServer.ts
//
// Kirim push notification (FCM) ke satu user. HANYA untuk server (route API).
// Dipakai bersama oleh /api/send-notification dan /api/notify supaya logika
// token kedaluwarsa & format pesan tidak ditulis dua kali.

import type admin from "firebase-admin";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { UNIT } from "@/lib/config";

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/mismatched-credential",
]);

export type PushResult =
  | {
      ok: true;
      sent_count: number;
      failure_count: number;
      cleaned_tokens: number;
      note?: string;
    }
  | { ok: false; status: number; error: string; details?: string };

export async function sendPushToUser(params: {
  userId: string;
  title: string;
  body: string;
  orderId?: string;
}): Promise<PushResult> {
  const { userId, title, body, orderId } = params;
  const appUrl = UNIT.appUrl;

  let fbAdmin: typeof admin;
  try {
    fbAdmin = getFirebaseAdmin();
  } catch (err: any) {
    console.error("🔥 Firebase Admin init error:", err.message);
    return {
      ok: false,
      status: 500,
      error: "Firebase Admin tidak terkonfigurasi",
      details: err.message,
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: userTokens, error } = await supabaseAdmin
    .from("user_fcm_tokens")
    .select("token")
    .eq("user_id", userId);

  if (error) return { ok: false, status: 500, error: "Database error" };

  if (!userTokens || userTokens.length === 0) {
    return {
      ok: true,
      sent_count: 0,
      failure_count: 0,
      cleaned_tokens: 0,
      note: "No token registered",
    };
  }

  const uniqueTokens: string[] = [
    ...new Set<string>(userTokens.map((t: any) => t.token)),
  ];

  const message = {
    // notification: dipakai service worker saat app di background
    notification: { title, body },
    // data: dipakai onMessage saat app di foreground (semua value HARUS string)
    data: { title, body, orderId: orderId ?? "", userId, url: `${appUrl}/` },
    webpush: {
      notification: {
        title,
        body,
        icon: `${appUrl}/logo.png`,
        badge: `${appUrl}/icon-bedge.png`,
        tag: orderId ? `order-${orderId}` : `notif-${userId}`,
        renotify: true,
        click_action: `${appUrl}/`,
      },
      fcmOptions: { link: `${appUrl}/` },
    },
    tokens: uniqueTokens,
  };

  const fcmResponse = await fbAdmin
    .messaging()
    .sendEachForMulticast(message as any);

  // Hapus token yang sudah kedaluwarsa
  const tokensToDelete: string[] = [];
  fcmResponse.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error) {
      if (INVALID_TOKEN_ERRORS.has(resp.error.code ?? "")) {
        tokensToDelete.push(uniqueTokens[idx]);
      }
    }
  });
  if (tokensToDelete.length > 0) {
    await supabaseAdmin.from("user_fcm_tokens").delete().in("token", tokensToDelete);
    console.log(`🗑️ ${tokensToDelete.length} token expired dihapus`);
  }

  return {
    ok: true,
    sent_count: fcmResponse.successCount,
    failure_count: fcmResponse.failureCount,
    cleaned_tokens: tokensToDelete.length,
  };
}
