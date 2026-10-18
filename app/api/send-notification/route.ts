// app/api/send-notification/route.ts
//
// Kirim push ke SATU user (dipakai notificationHelper.sendNotification).
// Logika FCM-nya ada di lib/pushServer.ts (dipakai juga oleh /api/notify).

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { sendPushToUser } from '@/lib/pushServer';

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

    const result = await sendPushToUser({ userId, title, body, orderId });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.details ? { details: result.details } : {}) },
        { status: result.status }
      );
    }

    const { ok: _ok, ...rest } = result;
    return NextResponse.json({ success: true, ...rest });
  } catch (error: any) {
    console.error('🔥 Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
