# 🚀 LinkedIn Scraper - Start Here

## ✅ Setup Complete!

Your LinkedIn scraper is ready to use. Follow these 3 steps:

---

## Step 1️⃣: Start the App

```bash
cd "/Users/betolaud/Desktop/Charlie AI/Analyzer"
npm run dev
```

**Expected output:**
```
> next dev

  ▲ Next.js 15.0.0
  - Local:        http://localhost:3000
```

---

## Step 2️⃣: Open Dashboard

In your browser, go to:

**🔗 http://localhost:3000/scraper-dashboard**

---

## Step 3️⃣: Use It

### First Time (Login)
1. Enter any **User ID** (e.g., `myaccount`)
2. Click **"Login to LinkedIn"**
3. A popup opens → sign in with your LinkedIn account
4. Close popup when done ✓

### Scrape a Post
1. Paste a **LinkedIn post URL**
   - Example: `https://www.linkedin.com/posts/123456789/`
2. Click **"Start Scrape"**
3. Wait **2-3 minutes**
4. See results on dashboard!

---

## 📊 What You Get

Each scrape extracts **5 profiles** with:
- ✓ Name
- ✓ Job Title
- ✓ Company
- ✓ LinkedIn URL
- ✓ Timestamp

Results saved to: `data/scrape-results/`

---

## 📂 Result Files

After scraping, check:

```
data/scrape-results/myaccount-1720425000000.json
```

Contains:
```json
{
  "count": 5,
  "profiles": [
    {
      "name": "Jane Doe",
      "title": "Product Manager at TechCorp",
      "company": "TechCorp",
      "url": "https://www.linkedin.com/in/jane-doe/"
    }
    // ... 4 more
  ]
}
```

---

## ⚡ Performance

| Metric | Time |
|--------|------|
| Login | 1-2 minutes (once) |
| Scrape 1 post | 2-3 minutes |
| Profiles per post | 5 (default) |
| Session reuse | 30+ days |

**Target:** 50 profiles = ~10 posts × 3min = ~30 minutes

---

## 🔧 Common Issues

### "No session found"
→ Make sure you logged in from Step 1

### "Cannot find Chrome"
→ Run: `npm install` (downloads Playwright)

### Hangs or timeout
→ LinkedIn rate-limiting
→ Wait 30 minutes and retry
→ Try different post

---

## 📖 Learn More

- **Full Setup:** Read `LINKEDIN_SCRAPER_README.md`
- **Advanced Config:** Read `SCRAPER_SETUP.md`
- **Quick Tips:** Read `QUICK_START.md`

---

## 🎯 Next Step

**Run this command now:**

```bash
npm run dev
```

Then open: http://localhost:3000/scraper-dashboard

**Happy scraping! 🎉**
