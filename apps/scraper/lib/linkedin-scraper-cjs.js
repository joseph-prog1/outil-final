const { chromium } = require('playwright');
const fs = require('fs');

const humanDelay = async (min = 500, max = 2000) => {
  const delay = Math.random() * (max - min) + min;
  await new Promise(r => setTimeout(r, delay));
};

const randomMouseMove = async (page, x, y) => {
  await page.mouse.move(x + Math.random() * 50 - 25, y + Math.random() * 50 - 25);
  await humanDelay(100, 300);
};

const humanClick = async (page, selector) => {
  try {
    const element = await page.locator(selector).first();
    if (!element) throw new Error(`Element not found: ${selector}`);

    const box = await element.boundingBox();
    if (!box) throw new Error(`Cannot get bounding box: ${selector}`);

    await randomMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
    await humanDelay(200, 600);
    await page.click(selector);
    await humanDelay(300, 800);
  } catch (error) {
    console.log(`[SCRAPE] Click error (non-critical): ${error.message}`);
  }
};

const humanScroll = async (page, scrollHeight = 3000) => {
  const scrolls = Math.ceil(scrollHeight / 500);
  for (let i = 0; i < scrolls; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await humanDelay(800, 1500);
  }
};

const getProfileInfo = async (page) => {
  try {
    const name = await page.locator('[data-test-id="profile-card-name"]').textContent().catch(() => 'N/A');
    const title = await page.locator('[data-test-id="headline"]').textContent().catch(() => 'N/A');
    const company = await page.locator('[data-test-id="company"]').textContent().catch(() => 'N/A');

    return {
      name: (name || 'N/A').trim(),
      title: (title || 'N/A').trim(),
      company: (company || 'N/A').trim()
    };
  } catch {
    return { name: 'N/A', title: 'N/A', company: 'N/A' };
  }
};

async function scrapeComments(postUrl, cookieFile) {
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });

    let storageState;
    if (cookieFile && fs.existsSync(cookieFile)) {
      storageState = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
    }

    const context = await browser.createBrowserContext({
      storageState,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    console.log(`[SCRAPE] Opening ${postUrl}`);
    await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await humanDelay(1000, 2000);

    // Scroll to end of comments
    console.log('[SCRAPE] Scrolling to end...');
    await humanScroll(page, 5000);

    // Find all comment elements
    const comments = await page.locator('[data-test-id="comment-card"]').all().catch(() => []);
    console.log(`[SCRAPE] Found ${comments.length} comments`);

    const results = [];
    const profilesClicked = new Set();

    // Click on first 5 unique profiles
    for (let i = 0; i < comments.length && profilesClicked.size < 5; i++) {
      try {
        const profileLink = await comments[i].locator('a[href*="/in/"]').first().catch(() => null);
        if (!profileLink) continue;

        const profileUrl = await profileLink.getAttribute('href').catch(() => null);
        if (!profileUrl || profilesClicked.has(profileUrl)) continue;

        profilesClicked.add(profileUrl);

        console.log(`[SCRAPE] Clicking profile ${profilesClicked.size}/5`);
        await humanClick(page, `a[href="${profileUrl}"]`);

        // Wait for new page
        const pagePromise = context.waitForEvent('page').catch(() => null);
        await humanDelay(1500, 2500);
        const newPage = await pagePromise;

        if (newPage) {
          const profileInfo = await getProfileInfo(newPage);
          console.log(`[SCRAPE] Extracted: ${profileInfo.name} - ${profileInfo.title}`);

          results.push({
            name: profileInfo.name,
            title: profileInfo.title,
            company: profileInfo.company,
            url: profileUrl,
            timestamp: new Date().toISOString(),
          });

          await newPage.close();
        }

        await humanDelay(800, 1200);

      } catch (error) {
        console.error(`[SCRAPE] Error processing profile ${i}:`, error.message);
      }
    }

    await context.close();
    return { success: true, profiles: results, count: results.length };

  } catch (error) {
    console.error('[SCRAPE] Fatal error:', error.message);
    return { success: false, error: error.message, profiles: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapeComments, humanDelay };
