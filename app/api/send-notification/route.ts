// app/api/send-notification/route.ts

import { NextResponse, type NextRequest } from 'next/server';
import type admin from 'firebase-admin';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { UNIT } from '@/lib/config';

// URL publik aplikasi (untuk link & ikon notifikasi). Set NEXT_PUBLIC_APP_URL di Coolify.
const APP_URL = UNIT.appUrl;

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  try {
    const { userId, title, body, orderId } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json(
        { error: 'Missing userId, title, or body' },
        { status: 400 }
      );
    }

    let fbAdmin: typeof admin;
    try {
      fbAdmin = getFirebaseAdmin();
    } catch (err: any) {
      console.error('🔥 Firebase Admin init error:', err.message);
      return NextResponse.json(
        { error: 'Firebase Admin tidak terkonfigurasi', details: err.message },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: userTokens, error } = await supabaseAdmin
      .from('user_fcm_tokens')
      .select('token')
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!userTokens || userTokens.length === 0) {
      return NextResponse.json({ success: true, sent_count: 0, note: 'No token registered' });
    }

    const uniqueTokens: string[] = [...new Set<string>(userTokens.map((t: any) => t.token))];

    const message = {
      // notification: dipakai oleh SW saat app di background
      notification: { title, body },

      // data: dipakai oleh onMessage saat app di foreground
      // Semua value HARUS string
      data: {
        title,
        body,
        orderId: orderId ?? '',
        userId,
        url: `${APP_URL}/`,
      },

      webpush: {
        notification: {
          title,
          body,
          icon: `${APP_URL}/logo.png`,
          badge: `${APP_URL}/icon-bedge.png`,
          tag: orderId ? `order-${orderId}` : `notif-${userId}`,
          renotify: true,
          click_action: `${APP_URL}/`,
        },
        // fcmOptions memastikan foreground message juga di-handle
        fcmOptions: {
          link: `${APP_URL}/`,
        },
      },
      tokens: uniqueTokens,
    };

    const fcmResponse = await fbAdmin.messaging().sendEachForMulticast(message as any);

    // Hapus token yang sudah expired
    const tokensToDelete: string[] = [];
    fcmResponse.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const errCode = resp.error.code ?? '';
        if (INVALID_TOKEN_ERRORS.has(errCode)) {
          tokensToDelete.push(uniqueTokens[idx]);
        }
      }
    });

    if (tokensToDelete.length > 0) {
      await supabaseAdmin
        .from('user_fcm_tokens')
        .delete()
        .in('token', tokensToDelete);
      console.log(`🗑️ ${tokensToDelete.length} token expired dihapus`);
    }

    return NextResponse.json({
      success: true,
      sent_count: fcmResponse.successCount,
      failure_count: fcmResponse.failureCount,
      cleaned_tokens: tokensToDelete.length,
    });

  } catch (error: any) {
    console.error('🔥 Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}