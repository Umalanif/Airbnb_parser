import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';

// Logger: only status, no token values in STDOUT
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Prisma instance
const prisma = new PrismaClient();

// Timeout: 30 seconds for entire process
const TIMEOUT_MS = 30000;
const timeoutId = setTimeout(() => {
  logger.warn('Worker timeout exceeded (30s)');
}, TIMEOUT_MS);

// Graceful shutdown flag
let isCancelled = false;

// Listen for cancel message from parent (only if in worker thread)
if (!isMainThread && parentPort) {
  parentPort.on('message', (msg) => {
    if (msg === 'cancel') {
      logger.info('Received cancel signal from parent');
      isCancelled = true;
    }
  });
}

// Target listing URL from blueprint (ID: 858637964586872469)
const LISTING_URL = 'https://www.airbnb.com/rooms/858637964586872469';

/**
 * Extract session tokens using Playwright browser automation
 * @returns {Promise<{cookie: string, xAirbnbApiKey: string, userAgent: string} | null>}
 */
async function extractSessionTokens() {
  let browser = null;
  let page = null;
  
  try {
    logger.info({ url: LISTING_URL }, 'Navigating to listing page');
    
    // Launch browser directly with Playwright
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    });
    
    page = await context.newPage();
    
    // Set up request interception before navigation
    let capturedApiKey = null;
    
    page.on('request', (request) => {
      const url = request.url();
      
      // Look for Airbnb API v3 requests
      if (url.includes('/api/v3/')) {
        const headers = request.headers();
        
        // Extract x-airbnb-api-key
        const apiKey = headers['x-airbnb-api-key'];
        if (apiKey && !capturedApiKey) {
          logger.info({ hasApiKey: true }, 'Captured x-airbnb-api-key');
          capturedApiKey = apiKey;
        }
      }
    });
    
    // Navigate to the listing with shorter timeout and less strict wait condition
    await page.goto(LISTING_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for page to stabilize and API calls to fire
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get cookies
    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    if (cookieString) {
      logger.info({ cookieLength: cookieString.length }, 'Captured cookies');
    }
    
    // Get user agent from context
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
    
    if (capturedApiKey && cookieString) {
      logger.info({ 
        hasCookie: !!cookieString,
        hasApiKey: !!capturedApiKey,
        hasUserAgent: !!userAgent 
      }, 'Session extraction complete');
      
      return {
        cookie: cookieString,
        xAirbnbApiKey: capturedApiKey,
        userAgent: userAgent
      };
    } else {
      logger.warn({ 
        hasCookie: !!cookieString, 
        hasApiKey: !!capturedApiKey 
      }, 'Incomplete session extraction');
      
      return null;
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Session extraction failed');
    return null;
  } finally {
    // Cleanup browser resources
    if (browser) {
      await browser.close();
    }
  }
}

// Main execution
async function main() {
  try {
    logger.info('Worker started');

    // Check if cancelled before starting
    if (isCancelled) {
      logger.info('Worker cancelled before start');
      return;
    }

    // Step 5: Browser automation and data extraction
    logger.info('Starting browser automation for session extraction');
    const sessionData = await extractSessionTokens();

    if (!sessionData) {
      logger.warn('Failed to extract session tokens');
      return;
    }

    logger.info('Session extraction completed successfully');

    // Step 7: Transform tokens and write to DB
    logger.info({ sessionId: 'airbnb_main' }, 'Upserting session to database');

    await prisma.session.upsert({
      where: { id: 'airbnb_main' },
      update: {
        cookie: sessionData.cookie,
        xAirbnbApiKey: sessionData.xAirbnbApiKey,
        userAgent: sessionData.userAgent
      },
      create: {
        id: 'airbnb_main',
        cookie: sessionData.cookie,
        xAirbnbApiKey: sessionData.xAirbnbApiKey,
        userAgent: sessionData.userAgent
      }
    });

    logger.info('Session upserted successfully');

  } catch (error) {
    logger.error({ error: error.message }, 'Worker execution failed');
    throw error;
  } finally {
    // Guaranteed cleanup
    clearTimeout(timeoutId);
    logger.info('Cleaning up resources');
    await prisma.$disconnect();
    logger.info('Worker shutdown complete');
    process.exit(0);
  }
}

main().catch((error) => {
  logger.error({ error: error.message }, 'Unhandled worker error');
  process.exit(1);
});
