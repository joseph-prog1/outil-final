import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/google';

export const dynamic = 'force-dynamic';

// Retour de l'écran de consentement Google : échange le code contre les jetons
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  if (error || !code) {
    return NextResponse.redirect(new URL(`/reglages?google=refused`, req.nextUrl.origin));
  }
  try {
    await exchangeCode(code, `${req.nextUrl.origin}/api/google/callback`);
    return NextResponse.redirect(new URL('/reglages?google=ok', req.nextUrl.origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(new URL(`/reglages?google=error&detail=${encodeURIComponent(message)}`, req.nextUrl.origin));
  }
}
