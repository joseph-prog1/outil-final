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
  console.log('🚀 Initializing LinkedIn scraper...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('📱 Opening LinkedIn...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    const isLoggedIn = await page.$('[data-test-id="profile-card"]');
    if (!isLoggedIn) {
      console.log('⏳ Please log in to LinkedIn using the browser window...');
      console.log('⏳ Waiting for you to complete Google Sign-In...');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});

      console.log('✅ Login detected! Continuing...');
    } else {
      console.log('✅ Already logged in!');
    }

    await page.goto(PROFILE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2000);

    console.log('📜 Scrolling to load all posts...');

    let lastHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    let scrollCount = 0;
    const maxScrolls = 10;

    while (scrollCount < maxScrolls) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(1000);

      const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (newHeight === lastHeight) break;

      lastHeight = newHeight;
      scrollCount++;
      console.log(`  Scroll ${scrollCount}/${maxScrolls}...`);
    }

    console.log('🔍 Extracting posts and comments...');

    const postsData = await page.evaluate(() => {
      const posts = [];
      const feedItems = document.querySelectorAll('[data-id^="urn:li:activity:"]');

      feedItems.forEach(item => {
        try {
          const postElement = item.getAttribute('data-id');
          const postText = item.querySelector('[data-test-id="post-text"]')?.innerText || '';
          const commentsContainer = item.querySelector('[data-test-id="comments-section"]');
          if (!commentsContainer) return;

          const comments = [];
          const commentElements = commentsContainer.querySelectorAll('[data-test-id="comment-item"]');

          commentElements.forEach(commentEl => {
            try {
              const nameLink = commentEl.querySelector('a[href*="/in/"]');
              const commenterName = nameLink?.innerText.trim() || 'Unknown';
              const profileUrl = nameLink?.href || '';
              const commentText = commentEl.querySelector('[data-test-id="comment-text"]')?.innerText || '';
              const jobTitle = commentEl.querySelector('[data-test-id="comment-subtitle"]')?.innerText || '';

              if (commenterName && profileUrl) {
                comments.push({
                  commenterName,
                  profileUrl,
                  jobTitle,
                  commentText,
                  timestamp: new Date().toISOString()
                });
              }
            } catch (e) {
              console.error('Error parsing comment:', e.message);
            }
          });

          if (comments.length > 0) {
            posts.push({
              postId: postElement,
              postText: postText.substring(0, 200),
              commentCount: comments.length,
              comments
            });
          }
        } catch (e) {
          console.error('Error parsing post:', e.message);
        }
      });

      return posts;
    });

    console.log(`✅ Found ${postsData.length} posts with comments`);

    const allComments = [];
    const seenProfiles = new Set();

    postsData.forEach(post => {
      post.comments.forEach(comment => {
        const profileId = comment.profileUrl;

        if (!seenProfiles.has(profileId)) {
          seenProfiles.add(profileId);
          allComments.push({
            ...comment,
            postsCommented: [post.postId],
            commentCount: 1
          });
        } else {
          const existing = allComments.find(c => c.profileUrl === profileId);
          if (existing) {
            if (!existing.postsCommented.includes(post.postId)) {
              existing.postsCommented.push(post.postId);
            }
            existing.commentCount += 1;
          }
        }
      });
    });

    console.log(`📊 Total unique commenters: ${allComments.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allComments, null, 2));
    console.log(`💾 Data saved to: ${OUTPUT_FILE}`);

    console.log('\n📈 Summary:');
    console.log(`  - Total posts scraped: ${postsData.length}`);
    console.log(`  - Total unique commenters: ${allComments.length}`);
    console.log(`  - Output file: ${OUTPUT_FILE}`);

    await browser.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

scrapeLinkedInComments();
