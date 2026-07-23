#!/usr/bin/env node

/**
 * Background Scraper Script
 * Runs scraper jobs from a queue file
 * Usage: node scripts/background-scraper.js
 */

const fs = require('fs');
const path = require('path');
const { scrapeComments } = require('../lib/linkedin-scraper');
const { loadSession } = require('../lib/session-manager');

const QUEUE_FILE = path.join(process.cwd(), '.scrape-queue.json');
const RESULTS_DIR = path.join(process.cwd(), 'data/scrape-results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

async function processQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    console.log('[QUEUE] No queue file found. Waiting...');
    return;
  }

  try {
    const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));

    if (!queue.jobs || queue.jobs.length === 0) {
      console.log('[QUEUE] Queue is empty');
      return;
    }

    const job = queue.jobs[0];
    console.log(`[QUEUE] Processing job: ${job.id}`);
    console.log(`[QUEUE] Post URL: ${job.postUrl}`);
    console.log(`[QUEUE] User: ${job.userId}`);

    // Load session
    const storageState = loadSession(job.userId);
    if (!storageState) {
      console.error(`[QUEUE] No session found for user ${job.userId}`);
      // Remove job from queue
      queue.jobs.shift();
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
      return;
    }

    // Save to temp file
    const tempCookieFile = path.join(process.cwd(), `.temp-cookies-${job.userId}.json`);
    fs.writeFileSync(tempCookieFile, JSON.stringify(storageState));

    // Run scraper
    const result = await scrapeComments(job.postUrl, tempCookieFile);

    // Save results
    const resultFile = path.join(
      RESULTS_DIR,
      `${job.userId}-${Date.now()}.json`
    );

    fs.writeFileSync(resultFile, JSON.stringify({
      jobId: job.id,
      postUrl: job.postUrl,
      userId: job.userId,
      timestamp: new Date().toISOString(),
      ...result,
    }, null, 2));

    console.log(`[QUEUE] ✓ Job completed. Results: ${resultFile}`);
    console.log(`[QUEUE] Found ${result.count} profiles`);

    // Clean up temp file
    fs.unlinkSync(tempCookieFile);

    // Remove job from queue
    queue.jobs.shift();
    if (queue.jobs.length === 0) {
      fs.unlinkSync(QUEUE_FILE);
      console.log('[QUEUE] Queue empty. Shutting down.');
    } else {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
      console.log(`[QUEUE] Remaining jobs: ${queue.jobs.length}`);
    }

  } catch (error) {
    console.error('[QUEUE] Error processing queue:', error);
    process.exit(1);
  }
}

// Run once then exit
processQueue().then(() => {
  setTimeout(() => process.exit(0), 1000);
});
