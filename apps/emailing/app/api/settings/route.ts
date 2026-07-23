import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSetting } from '@/lib/db';
import { googleConnected, googleEmail } from '@/lib/google';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'google_client_id',
  'google_client_secret',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'from_email',
  'gmail_user',
  'gmail_app_password',
  'sender_name',
  'calendly_url',
  'daily_cap',
  'base_url',
  'send_start',
  'send_end',
  'send_days',
];

export async function GET() {
  const s = getSettings();
  return NextResponse.json({
    settings: {
      ...Object.fromEntries(EDITABLE.map((k) => [k, s[k] ?? ''])),
      gmail_app_password: s.gmail_app_password ? '••••••••' : '',
      smtp_pass: s.smtp_pass ? '••••••••' : '',
      google_client_secret: s.google_client_secret ? '••••••••' : '',
      sending_enabled: s.sending_enabled,
    },
    googleConnected: googleConnected(),
    googleEmail: googleEmail(),
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  for (const key of EDITABLE) {
    if (typeof body[key] === 'string') {
      if (
        (key === 'gmail_app_password' || key === 'smtp_pass' || key === 'google_client_secret') &&
        body[key].includes('•')
      )
        continue;
      setSetting(key, body[key].trim());
    }
  }
  return NextResponse.json({ ok: true });
}
