import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireUser } from '@/lib/apiAuth'
import { UNIT } from '@/lib/config'

export const dynamic = 'force-dynamic'

// Role yang boleh download backup — sesuaikan kalau perlu
const BACKUP_ROLES = ['admin', 'manager']

export async function GET(request: NextRequest) {
  const guard = await requireUser(request, BACKUP_ROLES)
  if (!guard.ok) return guard.response

  try {
    const supabase = getSupabaseAdmin()

    // Ambil daftar tabel via RPC function
    const { data: tables, error: tableError } = await supabase
      .rpc('get_public_tables')

    if (tableError) throw tableError

    const backup: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      app: `monitoring-produksi-${UNIT.code}`,
    }

    // Ambil semua data tiap tabel
    for (const { table_name } of tables) {
      const { data, error } = await supabase
        .from(table_name)
        .select('*')

      if (!error && data) {
        backup[table_name] = data
      }
    }

    const filename = `backup-${new Date().toISOString().split('T')[0]}.json`

    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}