import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

export async function POST(request) {
  let browser;
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || 'default';

    console.log(`[AUTH] Starting login for user ${userId}`);

    // Launch browser WITH VISIBLE WINDOW for 2FA
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to LinkedIn login
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

    console.log(`[AUTH] Browser opened - please log in manually with your email/password and 2FA code`);
    console.log(`[AUTH] Waiting for login to complete (checking for feed page)...`);

    // Wait for successful login - give user 5 minutes to handle 2FA
    try {
      await page.waitForURL('**/feed/**', { timeout: 300000 }); // 5 minutes
      console.log(`[AUTH] Login successful!`);
    } catch (err) {
      const currentUrl = page.url();
      console.log(`[AUTH] Timeout or error. Current URL: ${currentUrl}`);
      throw new Error('Login timed out. Make sure you completed 2FA verification.');
    }

    console.log(`[AUTH] Capturing session...`);

    // Capture storage state (cookies + session storage)
    const storageState = await context.storageState();

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

    await browser.close();

    return NextResponse.json({
      success: true,
      message: `Session saved for ${userId}`,
      userId,
    });

  } catch (error) {
    console.error('[AUTH] Error:', error);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('[AUTH] Error closing browser:', e);
      }
    }

    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}
