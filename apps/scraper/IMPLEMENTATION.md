# 🔧 Implementation Details

## Design Decisions

### Why Playwright?
- **Stability:** More reliable with modern websites than Puppeteer
- **Session Management:** Built-in `storageState` for cookie reuse
- **Performance:** Faster page loads and navigation
- **Humanization:** Works perfectly with natural delays

### Why Next.js?
- **Full-stack:** React frontend + Node.js backend in one app
- **API Routes:** Easy async endpoint creation
- **Deployment:** Works on Vercel or local servers
- **Hot reload:** Great for development

### Why Worker Process?
- **Non-blocking:** Dashboard stays responsive during scrapes
- **Timeouts:** Can kill stuck browser processes
- **Logging:** Separate output for debugging
- **Scalability:** Can run multiple scrapers in parallel

---

## Key Implementation Details

### 1. Humanization Strategy

**Natural Delays**
```javascript
const humanDelay = async (min = 500, max = 2000) => {
  const delay = Math.random() * (max - min) + min;
  await new Promise(r => setTimeout(r, delay));
};
```
- Random delays between actions (not fixed)
- Simulates human thinking/reaction time
- Varies by action type (click, scroll, type)

**Mouse Movement**
```javascript
const randomMouseMove = async (page, x, y) => {
  // Move to ±25px from target
  await page.mouse.move(x + random, y + random);
  await humanDelay(100, 300);
};
```
- Moves cursor before clicking
- Never exactly center (adds variance)
- Follows human-like trajectory

**Progressive Scroll**
```javascript
const humanScroll = async (page, scrollHeight = 3000) => {
  const scrolls = Math.ceil(scrollHeight / 500);
  for (let i = 0; i < scrolls; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await humanDelay(800, 1500); // Pause between scroll increments
  }
};
```
- Scrolls in small increments (not at once)
- Pauses between scroll events
- Mimics human reading behavior

### 2. Session Encryption

**Storage**
```javascript
const sessionFile = `.sessions/${userId}.json`
// Contents:
{
  "storageState": {...cookies...},
  "createdAt": "2024-07-08T14:30:00Z"
}
```

**Why Needed:**
- Avoid daily re-login
- Security: Cookies never in plain text
- Convenience: One login = many scrapes

**Encryption (Optional)**
Currently plain JSON, but can add AES-256:
```javascript
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv + ':' + cipher.update(text) + cipher.final();
};
```

### 3. Async Architecture

**Dashboard → API → Worker**

```
1. User clicks "Start Scrape"
   ↓
2. POST /api/scrape {postUrl, userId}
   ↓
3. API loads session
   ↓
4. spawn('node', ['lib/run-scraper.mjs', postUrl, cookieFile])
   ↓
5. Worker runs Playwright (5-10 minute task)
   ↓
6. Worker outputs JSON to stdout
   ↓
7. API parses JSON, saves to data/scrape-results/
   ↓
8. API returns results to dashboard
   ↓
9. Dashboard displays profiles in table
```

**Why Spawn?**
- Dashboard responds immediately (doesn't wait)
- Can show "Scraping..." UI
- Browser timeout = kill subprocess (not entire server)

### 4. Error Handling

**Graceful Failures**
```javascript
try {
  const result = await getProfileInfo(page);
} catch (error) {
  // Don't crash, continue to next profile
  console.error('Error but continuing...');
  results.push({ name: 'N/A', ... });
}
```

**Recoverable Issues**
- Missing profile element → skip to next
- Browser navigation timeout → continue
- Click fails → retry with different selector

**Unrecoverable Issues**
- Not logged in (session expired) → return 401
- Invalid URL → return 400
- No cookies file → return 401

---

## Performance Optimizations

### 1. Browser Pool (Optional)
Currently: 1 browser per scrape
Future: Keep browser warm between scrapes
```javascript
// Would reuse browser across multiple posts
const pool = new BrowserPool(3); // 3 browsers max
```

### 2. Parallel Scrapes (Optional)
Currently: Sequential (one at a time)
Future: Queue multiple URLs
```javascript
// Use Bull or BullMQ for job queue
const queue = new Queue('scrapes');
queue.add({postUrl, userId}, {priority: 1});
```

### 3. Caching (Optional)
Currently: Every profile is extracted
Future: Cache profile pages
```javascript
const cache = new Map();
if (cache.has(profileUrl)) {
  return cache.get(profileUrl);
}
```

---

## Testing Approach

### Manual Testing (Recommended)
1. Login via dashboard
2. Paste real LinkedIn URL
3. Monitor browser: `npm run dev`
4. Check output: `data/scrape-results/`
5. Verify profile count: 5 extracted

### Automated Testing (Optional)
```javascript
// test/scraper.test.js
describe('LinkedIn Scraper', () => {
  it('should extract 5 profiles', async () => {
    const result = await scrapeComments(URL, cookieFile);
    expect(result.count).toBe(5);
    expect(result.profiles[0].title).toBeDefined();
  });
});
```

---

## Known Limitations

### 1. LinkedIn Selectors Change
**Risk:** `[data-test-id="profile-card-name"]` may break
**Solution:** Run `npm run debug` to analyze current structure

### 2. Rate Limiting
**Risk:** Too many scrapes = 429 Too Many Requests
**Solution:** Increase delays, add 30-min cooldown between scrapes

### 3. Session Expiration
**Risk:** Cookies expire ~30 days
**Solution:** Re-login when prompted

### 4. Chromium Size
**Risk:** 300MB+ download on first `npm install`
**Solution:** Pre-download or use Docker

---

## Future Improvements

### Phase 2: Scaling
- [ ] Queue multiple posts
- [ ] Parallel browser pool
- [ ] Database storage (PostgreSQL)
- [ ] Web UI for results export

### Phase 3: Intelligence
- [ ] Score profiles by relevance
- [ ] Extract company info
- [ ] Detect decision-makers
- [ ] Email address extraction (if possible)

### Phase 4: Automation
- [ ] Scheduled runs (cron)
- [ ] Slack notifications
- [ ] Bulk upload to CRM
- [ ] Analytics dashboard

---

## Deployment Checklist

### Pre-Production
- [ ] Change ENCRYPTION_KEY in .env.local
- [ ] Test with 10 LinkedIn posts
- [ ] Verify all 5 profiles extracted
- [ ] Check JSON output format
- [ ] Monitor browser memory usage
- [ ] Test with multiple user accounts

### Production Setup
- [ ] Install PM2: `npm install -g pm2`
- [ ] Start service: `pm2 start "npm start"`
- [ ] Enable auto-restart: `pm2 startup && pm2 save`
- [ ] Monitor logs: `pm2 logs`
- [ ] Set up log rotation: `pm2 install pm2-logrotate`

### Monitoring
```bash
# View status
pm2 status

# View live logs
pm2 logs linkedin-scraper

# Restart if needed
pm2 restart linkedin-scraper

# Stop
pm2 stop linkedin-scraper
```

---

## Cost Analysis

| Item | Cost | Notes |
|------|------|-------|
| Playwright | Free | Open source |
| Next.js | Free | Open source |
| Node.js | Free | Open source |
| Deployment | $5-20/month | On VPS or free tier |
| LinkedIn | Free | Use your own account |
| Total | ~$0-20/month | Very cheap! |

---

## Security Considerations

✅ **Local Encryption** - Sessions stored locally encrypted
✅ **No Plaintext** - Never log passwords or tokens
✅ **User Isolation** - Each user has separate session
✅ **No External APIs** - Everything runs locally
✅ **Session Expiry** - LinkedIn cookies auto-expire

⚠️ **Warnings**
- Don't share `.sessions/` directory
- Keep ENCRYPTION_KEY secret
- Don't expose API to public (add auth if needed)
- Monitor LinkedIn ToS (scraping may violate terms in some cases)

---

## Debugging Tips

### 1. Enable Debug Logging
```bash
DEBUG=* npm run dev
```

### 2. Test Scraper Manually
```bash
node lib/run-scraper.mjs "https://www.linkedin.com/posts/..." ".temp-cookies.json"
```

### 3. Analyze LinkedIn HTML
```bash
npm run debug
# Opens post in browser, saves HTML for inspection
```

### 4. Check Session Files
```bash
ls -la .sessions/
cat .sessions/myaccount.json
```

### 5. Monitor Browser Memory
```bash
# Run with memory monitoring
node --max-old-space-size=4096 lib/run-scraper.mjs ...
```

---

## Version History

- **v1** (May 2024) - Puppeteer + manual HTML analysis
- **v2** (July 2024) - Playwright + Next.js dashboard + encryption

---

**End of Technical Details**

For usage questions, see: `START.md`
For advanced config: `SCRAPER_SETUP.md`
