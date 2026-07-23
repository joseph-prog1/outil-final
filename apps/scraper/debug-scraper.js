const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.linkedin.com/in/thomas-higadere/recent-activity/all/';
const DEBUG_DIR = path.join(__dirname, 'debug');

if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Polyfill for waitForTimeout (replaced in newer Puppeteer)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function debugLinkedIn() {
  console.log('🔍 LinkedIn Structure Inspector (Debug Mode)\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });

    console.log('📱 Opening LinkedIn...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for login if needed
    console.log('⏳ Waiting for login (if needed)...');
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });
    } catch (e) {
      // OK if no navigation
    }

    await sleep(3000);
    console.log('✅ Page loaded!\n');

    // Scroll once to load some content
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await sleep(2000);

    // Take a screenshot
    const screenshotPath = path.join(DEBUG_DIR, 'page-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}\n`);

    // Extract HTML structure for analysis
    console.log('📊 Analyzing page structure...\n');

    const structure = await page.evaluate(() => {
      const analysis = {
        pageUrl: window.location.href,
        pageTitle: document.title,
        totalText: document.body.innerText.length,

        // Look for posts
        postContainers: {
          'article[role="article"]': document.querySelectorAll('article[role="article"]').length,
          'div[data-id^="urn:li:activity:"]': document.querySelectorAll('div[data-id^="urn:li:activity:"]').length,
          '[role="article"]': document.querySelectorAll('[role="article"]').length,
          '.feed-shared-update-v2': document.querySelectorAll('.feed-shared-update-v2').length,
          'span[data-test-id*="post"]': document.querySelectorAll('span[data-test-id*="post"]').length
        },

        // Look for comments
        commentContainers: {
          '[data-test-id*="comment"]': document.querySelectorAll('[data-test-id*="comment"]').length,
          '.comments-section': document.querySelectorAll('.comments-section').length,
          '[class*="comment"]': document.querySelectorAll('[class*="comment"]').length,
          'li.comments': document.querySelectorAll('li.comments').length,
        },

        // Look for profile links
        profileLinks: {
          'a[href*="/in/"]': document.querySelectorAll('a[href*="/in/"]').length,
          'a[data-test-id*="profile-link"]': document.querySelectorAll('a[data-test-id*="profile-link"]').length,
        }
      };

      return analysis;
    });

    console.log('📈 Page Structure Analysis:');
    console.log(`  URL: ${structure.pageUrl}`);
    console.log(`  Title: ${structure.pageTitle}`);
    console.log(`  Total text length: ${structure.totalText} chars\n`);

    console.log('  Post Containers Found:');
    Object.entries(structure.postContainers).forEach(([selector, count]) => {
      if (count > 0) console.log(`    ✅ ${selector}: ${count}`);
    });

    console.log('\n  Comment Containers Found:');
    Object.entries(structure.commentContainers).forEach(([selector, count]) => {
      if (count > 0) console.log(`    ✅ ${selector}: ${count}`);
    });

    console.log('\n  Profile Links Found:');
    Object.entries(structure.profileLinks).forEach(([selector, count]) => {
      if (count > 0) console.log(`    ✅ ${selector}: ${count}`);
    });

    // Extract sample post HTML
    console.log('\n📄 Extracting sample post HTML...');

    const sampleHTML = await page.evaluate(() => {
      const posts = document.querySelectorAll('article[role="article"], [data-id^="urn:li:activity:"]');
      if (posts.length === 0) return 'No posts found';

      const post = posts[0];
      const html = post.outerHTML.substring(0, 2000);
      return html;
    });

    const htmlFile = path.join(DEBUG_DIR, 'sample-post.html');
    fs.writeFileSync(htmlFile, sampleHTML);
    console.log(`📝 Sample HTML saved: ${htmlFile}\n`);

    // Extract all profile links with context
    console.log('🔗 Extracting all profile links (first 20)...\n');

    const links = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'))
        .slice(0, 20)
        .map(link => ({
          text: link.innerText.trim(),
          href: link.href,
          class: link.className,
          parent: link.parentElement?.tagName,
          parentClass: link.parentElement?.className
        }));
      return allLinks;
    });

    links.forEach((link, idx) => {
      console.log(`${idx + 1}. ${link.text}`);
      console.log(`   URL: ${link.href}`);
      console.log(`   Parent: ${link.parent} (${link.parentClass})\n`);
    });

    const linksFile = path.join(DEBUG_DIR, 'profile-links.json');
    fs.writeFileSync(linksFile, JSON.stringify(links, null, 2));
    console.log(`💾 Links saved to: ${linksFile}\n`);

    // Save full page source for inspection
    const pageSource = await page.content();
    const sourceFile = path.join(DEBUG_DIR, 'page-source.html');
    fs.writeFileSync(sourceFile, pageSource);
    console.log(`📄 Full page source saved: ${sourceFile}\n`);

    console.log('✅ Debug inspection complete!\n');
    console.log('📂 Debug files saved to:', DEBUG_DIR);
    console.log('  - page-screenshot.png: Visual representation');
    console.log('  - sample-post.html: First post HTML');
    console.log('  - profile-links.json: All profile links found');
    console.log('  - page-source.html: Full page HTML\n');

    await browser.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

debugLinkedIn();
