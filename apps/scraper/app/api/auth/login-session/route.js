import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { userId, storageState } = await request.json();

    if (!userId || !storageState) {
      return NextResponse.json(
        { error: 'userId and storageState required' },
        { status: 400 }
      );
    }

    // Save session
    const sessionDir = path.join(process.cwd(), '.sessions');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const sessionFile = path.join(sessionDir, `${userId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify({
      storageState,
      createdAt: new Date().toISOString()
    }, null, 2));

    console.log(`[AUTH] Session saved for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: `Session saved for ${userId}`,
      userId,
    });

  } catch (error) {
    console.error('[AUTH] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
