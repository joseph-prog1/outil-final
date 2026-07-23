import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { GOOGLE_SCOPES } from '@/lib/google';

export const dynamic = 'force-dynamic';

// Redirige vers l'écran de consentement Google (« Continuer avec Google »)
export async function GET(req: NextRequest) {
  const clientId = getSetting('google_client_id');
  if (!clientId) {
    return NextResponse.redirect(new URL('/reglages?google=missing_client', req.nextUrl.origin));
  }
  const redirectUri = `${req.nextUrl.origin}/api/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return NextResponse.redirect(url);
}
