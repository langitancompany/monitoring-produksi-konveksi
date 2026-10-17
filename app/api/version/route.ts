// app/api/version/route.ts
import { APP_INFO } from '@/lib/changelog';

export async function GET() {
  return Response.json({
    version: APP_INFO.version,
    notes: APP_INFO.notes,
  });
}