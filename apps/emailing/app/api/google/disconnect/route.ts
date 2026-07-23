import { NextResponse } from 'next/server';
import { disconnectGoogle } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function POST() {
  disconnectGoogle();
  return NextResponse.json({ ok: true });
}
