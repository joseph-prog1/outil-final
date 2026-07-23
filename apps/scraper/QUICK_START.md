# 🚀 LinkedIn Scraper - Quick Start

## Installation (5 minutes)

```bash
cd "/Users/betolaud/Desktop/Charlie AI/Analyzer"
npm install
```

## Start the App

```bash
npm run dev
```

Open: **http://localhost:3000/scraper-dashboard**

---

## Workflow (Step by Step)

### 1️⃣ Login (First Time Only)

1. Enter any **User ID** (e.g., "myaccount")
2. Click **"Login to LinkedIn"**
3. A popup opens → log in with your credentials
4. Close the popup when done
5. ✓ Session is saved automatically

### 2️⃣ Scrape a Post

1. Paste a **LinkedIn post URL**
   - Example: `https://www.linkedin.com/posts/123456789/`
2. Click **"Start Scrape"**
3. Scraper will:
   - Load saved session (cookies)
   - Scroll through comments
   - Click 5 random profiles
   - Extract: Name, Title, Company
4. Results appear on dashboard

### 3️⃣ View Results

- **On Dashboard:** See all extracted profiles
- **In Files:** `data/scrape-results/{userId}-{timestamp}.json`

---

## Example Output

```json
{
  "postUrl": "https://www.linkedin.com/posts/...",
  "userId": "myaccount",
  "timestamp": "2024-07-08T14:30:00Z",
  "success": true,
  "count": 5,
  "profiles": [
    {
      "name": "Jane Doe",
      "title": "Product Manager at TechCorp",
      "company": "TechCorp",
      "url": "https://www.linkedin.com/in/jane-doe/",
      "timestamp": "2024-07-08T14:30:15Z"
    }
    // ... 4 more profiles
  ]
}
```

---

## Performance Targets ✅

- **1 post:** 2-3 minutes
- **5 profiles per post:** Default (can modify)
- **Session reuse:** No re-login needed
- **Run multiple times:** Just paste new URLs

---

## Troubleshooting

### ❌ "No session found"
→ Make sure you logged in first at step 1

### ❌ "Post not found"
→ Check the URL is correct and public

### ❌ "Chrome not downloaded"
→ Run: `npm install` again (downloads Playwright)

### ❌ Script hangs
→ LinkedIn might be blocking requests
→ Try again in a few minutes
→ Increase delays in `lib/linkedin-scraper-cjs.js`

---

## Running in Background (Optional)

### Using PM2 (Recommended)

```bash
npm install -g pm2

# Start server
pm2 start "npm run dev" --name "linkedin-scraper"

# View logs
pm2 logs linkedin-scraper

# Stop
pm2 stop linkedin-scraper
```

### Using Cron (Linux/Mac)

Add to crontab (`crontab -e`):

```bash
# Run scraper every hour
0 * * * * cd /Users/betolaud/Desktop/Charlie\ AI/Analyzer && npm run dev > /tmp/scraper.log 2>&1
```

---

## Next Steps

1. ✅ Start server: `npm run dev`
2. ✅ Visit: http://localhost:3000/scraper-dashboard
3. ✅ Login once
4. ✅ Paste LinkedIn post URL
5. ✅ View results!

Need help? Check `SCRAPER_SETUP.md` for advanced config.
