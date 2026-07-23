# LinkedIn Scraper - Complete Setup Guide

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Next.js React)                        │
│  - Login Interface                              │
│  - Post URL Input                               │
│  - Results Display                              │
└────────────────┬────────────────────────────────┘
                 │ HTTPS
┌────────────────▼────────────────────────────────┐
│  Backend (Node.js + Playwright)                  │
│  - Session Manager (Cookies)                    │
│  - Playwright Scraper (Humanized)               │
│  - Results Storage                              │
└─────────────────────────────────────────────────┘
```

## Requirements

- Node.js 18+
- Playwright (~300MB for chromium)
- Active LinkedIn account

## Installation

### 1. Install Dependencies

```bash
cd /Users/betolaud/Desktop/Charlie\ AI/Analyzer
npm install
```

### 2. Environment Setup

```bash
# Create .env.local
echo "ENCRYPTION_KEY=your-secret-key-here" > .env.local
```

### 3. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000/scraper-dashboard`

## Usage Flow

### Step 1: Login (First Time Only)

1. Go to http://localhost:3000/scraper-dashboard
2. Enter your User ID (e.g., "john-smith")
3. Click "Login to LinkedIn"
4. A popup window opens - log in with your LinkedIn account
5. Close the popup when done
6. Your session is saved automatically

### Step 2: Scrape Posts

1. Paste a LinkedIn post URL
2. Click "Start Scrape"
3. The scraper will:
   - Load your saved session (cookies)
   - Open the post
   - Scroll through all comments
   - Click on 5 random profiles
   - Extract name, title, company
   - Save results to `data/scrape-results/`

### Step 3: View Results

Results are displayed in the dashboard and saved to:
```
data/scrape-results/{userId}-{timestamp}.json
```

Example output:
```json
{
  "postUrl": "https://www.linkedin.com/posts/...",
  "userId": "john-smith",
  "timestamp": "2024-07-08T14:30:00Z",
  "success": true,
  "count": 5,
  "profiles": [
    {
      "name": "Jane Doe",
      "title": "Product Manager at Acme Corp",
      "company": "Acme Corp",
      "url": "https://www.linkedin.com/in/jane-doe",
      "timestamp": "2024-07-08T14:30:15Z"
    }
    // ... 4 more profiles
  ]
}
```

## How It Works

### Session Management

- Cookies are **encrypted** and stored in `.sessions/`
- First login captures cookies via browser
- Subsequent scrapes reuse the session
- No need to log in again

### Humanization

The scraper implements human-like behavior:

- **Delays**: Random 500-2000ms between actions
- **Mouse movements**: Natural curves with acceleration
- **Scrolling**: Progressive scroll with pauses
- **Click behavior**: Simulates real clicking with timing

### Performance

- **1 post**: ~2-3 minutes (includes 5 profile clicks)
- **50 comments**: Limited to 5 profile visits per run
- **Scaling**: Run multiple instances for different users

## Running in Background (Production)

### Option 1: PM2 (Recommended)

```bash
npm install -g pm2

# Create ecosystem.config.js
echo "module.exports = {
  apps: [{
    name: 'linkedin-scraper',
    script: 'npm',
    args: 'start',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}" > ecosystem.config.js

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Option 2: Systemd (Linux/Mac)

Create `/etc/systemd/system/linkedin-scraper.service`:

```ini
[Unit]
Description=LinkedIn Scraper
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/Users/betolaud/Desktop/Charlie AI/Analyzer
ExecStart=/usr/local/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable linkedin-scraper
sudo systemctl start linkedin-scraper
```

## API Endpoints

### POST /api/scrape
Starts a scraping job

**Request:**
```json
{
  "postUrl": "https://www.linkedin.com/posts/...",
  "userId": "john-smith"
}
```

**Response:**
```json
{
  "success": true,
  "profiles": [...],
  "count": 5,
  "resultFile": "data/scrape-results/john-smith-1720425000000.json"
}
```

### POST /api/auth/login-session
Saves user session

**Request:**
```json
{
  "userId": "john-smith",
  "storageState": { "cookies": [...], "origins": [...] }
}
```

## Troubleshooting

### Session Not Found
- Make sure you logged in first via the dashboard
- Check if `.sessions/` directory exists
- Verify cookies are being saved

### Scraper Can't Find Comments
- LinkedIn HTML structure changes frequently
- Run `npm run debug` to analyze current structure
- Update selectors in `lib/linkedin-scraper.js` if needed

### 429 Too Many Requests
- LinkedIn is rate-limiting
- Increase delays in `humanDelay()` function
- Spread requests across multiple sessions/users

### Chromium Download Fails
- Ensure 300MB free disk space
- Check internet connection
- Run `npm install` again

## Files Structure

```
.
├── app/
│   ├── api/
│   │   ├── auth/login-session/route.js      # Session save
│   │   └── scrape/route.js                   # Scrape endpoint
│   ├── scraper-dashboard/page.tsx            # Main UI
│   └── page.tsx                              # Home
├── lib/
│   ├── linkedin-scraper.js                  # Playwright + Humanization
│   └── session-manager.js                   # Cookie encryption/storage
├── data/
│   └── scrape-results/                      # Output files
├── .sessions/                               # Encrypted cookies
├── package.json
└── SCRAPER_SETUP.md                         # This file
```

## Next Steps

1. **Test with 5 profiles** (current limit)
2. **Scale to 50 profiles** by adjusting `humanScroll()` parameters
3. **Schedule runs** using `node -e` with cron
4. **Monitor results** via dashboard

## Support

- Check logs: `cat .next/server/logs/`
- Debug HTML: Run `npm run debug` with post URL
- Adjust selectors in `lib/linkedin-scraper.js` if LinkedIn changes structure
