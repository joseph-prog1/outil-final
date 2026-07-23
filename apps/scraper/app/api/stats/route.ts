import { NextResponse } from 'next/server';

// Module CJS partagé qui lit + score les profils réellement scrapés
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getScoredProfiles, computeStats } = require('../../../lib/scraped-profiles.js');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const profiles = getScoredProfiles();
    return NextResponse.json(computeStats(profiles));
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
