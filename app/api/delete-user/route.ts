// app/api/delete-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

// Role yang boleh menghapus user — sesuaikan kalau perlu
const DELETE_USER_ROLES = ['admin', 'manager'];

export async function DELETE(req: NextRequest) {
  const guard = await requireUser(req, DELETE_USER_ROLES);
  if (!guard.ok) return guard.response;

  const supabaseAdmin = getSupabaseAdmin();
  const { userId } = await req.json();
  console.log('Delete user request:', userId);

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  // Jika user tidak ditemukan di auth, anggap sukses
  // (user dibuat manual tanpa Supabase Auth)
  if (error && error.code !== 'user_not_found') {
    console.error('Auth delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}