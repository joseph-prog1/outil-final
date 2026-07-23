const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PROFILE_URL = 'https://www.linkedin.com/in/thomas-higadere/recent-activity/all/';
const OUTPUT_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'comments.json');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scrapeLinkedInComments() {
  console.log('🚀 Starting LinkedIn Comments Scraper (v2)\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('📱 Opening LinkedIn profile...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    const loginCheck = await page.evaluate(() => {
      return !window.location.href.includes('login') && document.body.innerText.length > 1000;
    });

    if (!loginCheck) {
      console.log('\n⏳ PLEASE LOG IN TO LINKEDIN VIA GOOGLE SSO IN THE BROWSER WINDOW\n');
      console.log('⏳ Waiting for login to complete (max 2 minutes)...\n');

      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });
      } catch (e) {
        // Navigation timeout is okay
      }

      await sleep(3000);
      console.log('✅ Login completed!\n');
    } else {
      console.log('✅ Already logged in!\n');
    }

    await page.goto(PROFILE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2000);

    console.log('📜 Scrolling to load all posts...\n');

    let previousHeight = 0;
    let scrollCount = 0;
    const maxScrolls = 15;

    while (scrollCount < maxScrolls) {
      const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);

      if (currentHeight === previousHeight) {
        console.log('✅ Reached end of feed');
        break;
      }

      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(1500);

      scrollCount++;
      console.log(`  Scroll ${scrollCount}/${maxScrolls}... (Height: ${currentHeight}px)`);
    }

    console.log('\n🔍 Extracting posts and comments...\n');

    const allComments = await page.evaluate(() => {
      const commenters = {};
      const posts = document.querySelectorAll('[data-id^="urn:li:activity:"], article, [role="article"]');

      console.log(`Found ${posts.length} potential posts`);

      posts.forEach((post, idx) => {
        try {
          const postText = post.innerText?.substring(0, 300) || '';
          let commentSection = post.querySelector('[role="region"]');
          if (!commentSection) commentSection = post.querySelector('.comments-section');
          if (!commentSection) commentSection = post;

          const profileLinks = post.querySelectorAll('a[href*="/in/"]');

          for (let i = 1; i < profileLinks.length; i++) {
            const link = profileLinks[i];
            const href = link.href;

            if (!href.includes('/in/') || href.includes('edit') || href.includes('settings')) continue;

            const name = link.innerText?.trim() || '';
            if (!name || name.length < 2) continue;

            const parent = link.closest('[data-test-id*="comment"], .comment, li, article');
            const jobTitle = parent?.querySelector('[data-test-id*="subtitle"], .subtitle, .job-title')?.innerText || '';

            const key = href;

            if (!commenters[key]) {
              commenters[key] = {
                name: name,
                profileUrl: href,
                jobTitle: jobTitle,
                commentCount: 0,
                lastCommentDate: new Date().toISOString(),
                posts: []
              };
            }

            commenters[key].commentCount += 1;
            if (!commenters[key].posts.includes(postText.substring(0, 100))) {
              commenters[key].posts.push(postText.substring(0, 100));
            }
          }
        } catch (e) {
          console.log(`Error processing post ${idx}:`, e.message);
        }
      });

      return commenters;
    });

    const commentersArray = Object.values(allComments);
    const validCommenters = commentersArray.filter(c => c.profileUrl && c.name);

    console.log(`✅ Found ${validCommenters.length} unique commenters\n`);

    const uniqueCommenters = [];
    const seenUrls = new Set();

    validCommenters
      .sort((a, b) => b.commentCount - a.commentCount)
      .forEach(commenter => {
        if (!seenUrls.has(commenter.profileUrl)) {
          seenUrls.add(commenter.profileUrl);
          uniqueCommenters.push(commenter);
        }
      });

    console.log(`📊 Summary:`);
    console.log(`  - Unique commenters found: ${uniqueCommenters.length}`);
    console.log(`  - Top 5 commenters:`);

    uniqueCommenters.slice(0, 5).forEach((c, idx) => {
      console.log(`    ${idx + 1}. ${c.name} (${c.commentCount} comments)`);
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueCommenters, null, 2));
    console.log(`\n💾 Full data saved to: ${OUTPUT_FILE}\n`);

    await browser.close();
    console.log('✅ Done!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

scrapeLinkedInComments();
