import 'dotenv/config';
import { parentPort, workerData } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import { CheerioCrawler, RequestQueue, ProxyConfiguration } from 'crawlee';
import Bottleneck from 'bottleneck';
import logger from '../src/utils/logger.js';
import { buildAirbnbUrl } from '../src/utils/url-builder.js';
import { extractPriceFromResponse, airbnbResponseSchema } from '../src/schemas/airbnb-response.js';
import { PriceLogInputSchema, calculateDelta, hasAvailabilityChanged } from '../src/schemas/price-log.js';
import TelegramNotificationService from '../src/services/telegram-notification-service.js';

const SESSION_ID = 'airbnb_main';
const FORTY_THREE_THRESHOLD = parseInt(process.env.FORTY_THREE_THRESHOLD || '5', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const JITTER_MIN_MS = parseInt(process.env.JITTER_MIN_MS || '2000', 10);
const JITTER_MAX_MS = parseInt(process.env.JITTER_MAX_MS || '5000', 10);

let isShuttingDown = false;
let consecutive403Count = 0;

/**
 * Calculate default check-in date (today + offset days)
 * @param {number} offsetDays - Number of days to add to today
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function getDefaultCheckInDate(offsetDays = 7) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
}

/**
 * Calculate default check-out date (check-in + stay duration)
 * @param {string} checkInDate - Check-in date in YYYY-MM-DD format
 * @param {number} stayDuration - Number of nights
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function getDefaultCheckOutDate(checkInDate, stayDuration = 5) {
  const date = new Date(checkInDate);
  date.setDate(date.getDate() + stayDuration);
  return date.toISOString().split('T')[0];
}

// Get dates from workerData or compute defaults
const defaultCheckIn = workerData?.checkIn || getDefaultCheckInDate(7);
const defaultCheckOut = workerData?.checkOut || getDefaultCheckOutDate(defaultCheckIn, 5);

/**
 * Send message to parent (Bree orchestrator)
 * @param {Object} data - Message data
 */
function sendMessage(data) {
  if (parentPort) {
    parentPort.postMessage(data);
  }
}

/**
 * Setup cancellation handlers
 */
function setupCancellationHandlers() {
  if (parentPort) {
    parentPort.on('message', (message) => {
      if (message === 'cancel' || message?.command === 'cancel') {
        logger.info('Received cancel signal');
        isShuttingDown = true;
      }
    });
  }

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM');
    isShuttingDown = true;
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT');
    isShuttingDown = true;
  });
}

/**
 * Write sold-out/unavailable listing to database
 * @param {Object} params - Parameters
 * @param {string} params.listingId - Listing ID
 * @param {string} params.listingTitle - Listing title
 * @param {Object} params.prisma - Prisma client instance
 * @param {Object} params.notificationService - Telegram notification service (optional)
 * @param {number|null} params.price - Price (null if sold out)
 * @param {string} params.currency - Currency code
 * @returns {Promise<boolean>} True if successful
 */
async function writeSoldOutListing({ listingId, listingTitle, prisma, notificationService, price = null, currency = 'EUR' }) {
  const isAvailable = false;

  // Delta Detection: Fetch previous price BEFORE writing new log
  const previousLogs = await prisma.priceLog.findMany({
    where: { listingId },
    orderBy: { capturedAt: 'desc' },
    take: 1,
  });

  const previousLog = previousLogs.length > 0 ? previousLogs[0] : null;
  const previousPrice = previousLog ? previousLog.price : null;
  const previousIsAvailable = previousLog ? previousLog.isAvailable : null;

  // Calculate delta
  const delta = calculateDelta(price, previousPrice);
  const availabilityChanged = hasAvailabilityChanged(isAvailable, previousIsAvailable);

  // Validate data with Zod schema before writing to database
  const validationResult = PriceLogInputSchema.safeParse({
    listingId,
    price,
    currency,
    isAvailable,
    delta,
  });

  if (!validationResult.success) {
    logger.error({ error: validationResult.error.format(), listingId }, 'PriceLog validation failed');
    return false;
  }

  // Write to database with delta
  await prisma.priceLog.create({
    data: validationResult.data,
  });

  logger.info(
    { listingId, price, currency, delta, isAvailable },
    'PriceLog saved (unavailable listing)'
  );

  // Send business alert if availability changed
  if (notificationService && availabilityChanged) {
    notificationService
      .sendBusinessAlert({
        listingTitle,
        listingUrl: `https://www.airbnb.com/rooms/${listingId}`,
        currentPrice: price,
        previousPrice: previousPrice !== null ? previousPrice : undefined,
        delta,
        currency,
        isAvailable,
      })
      .catch((alertError) => {
        logger.error({ error: alertError.message, listingId }, 'Failed to send business alert');
      });
  }

  sendMessage({ status: 'completed', listingId, price, delta });
  return true;
}

async function main() {
  const prisma = new PrismaClient();
  
  // Initialize notification service
  const notificationService = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? new TelegramNotificationService({
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      })
    : null;

  try {
    if (isShuttingDown) {
      logger.info('Worker cancelled before start');
      sendMessage({ status: 'cancelled', reason: 'shutdown_before_start' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { id: SESSION_ID },
    });

    if (!session) {
      logger.error({ sessionId: SESSION_ID }, 'Session not found in database');
      sendMessage({ status: 'error', error: 'Session not found' });
      return;
    }

    // Fetch listings in batches using individual checkIn/checkOut from DB
    const listings = await prisma.listing.findMany({
      where: { isActive: true },
      take: BATCH_SIZE,
    });

    if (listings.length === 0) {
      logger.warn('No active listings found');
      sendMessage({ status: 'completed', reason: 'no_listings' });
      return;
    }

    logger.info({ count: listings.length, batchSize: BATCH_SIZE }, 'Processing listing batch');

    // Create request queue
    const requestQueue = await RequestQueue.open('airbnb-queue');
    await requestQueue.drop(); // Clear queue for fresh start
    const freshQueue = await RequestQueue.open('airbnb-queue');

    // Create bottleneck limiter for jitter (2-5 seconds between requests)
    const limiter = new Bottleneck({
      minTime: JITTER_MIN_MS,
      maxConcurrent: 1,
    });

    // Enqueue all listing URLs with individual dates from DB
    for (const listing of listings) {
      // Use individual checkIn/checkOut from each listing record
      // Fall back to computed defaults if not set
      const checkIn = listing.checkIn || defaultCheckIn;
      const checkOut = listing.checkOut || defaultCheckOut;

      const url = buildAirbnbUrl(listing.id, checkIn, checkOut, {
        locale: 'en',
        currency: 'EUR',
      });

      await freshQueue.addRequest({
        url,
        uniqueKey: listing.id,
        userData: {
          listingId: listing.id,
          listingTitle: listing.title,
          checkIn,
          checkOut,
        },
      });
    }

    let processedCount = 0;
    let errorCount = 0;

    // Create proxy configuration (only if proxy URLs are provided)
    const proxyConfiguration = process.env.PROXY_URLS
      ? new ProxyConfiguration({
          proxyUrls: process.env.PROXY_URLS.split(',').filter(Boolean),
        })
      : undefined;

    // Create CheerioCrawler
    const crawler = new CheerioCrawler({
      requestQueue: freshQueue,
      maxRequestsPerCrawl: listings.length,
      maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
      requestHandlerTimeoutSecs: 60,
      ...(proxyConfiguration && { proxyConfiguration }),
      requestHandler: async ({ request, sendRequest, crawler: crawlerContext }) => {
        if (isShuttingDown) {
          logger.info('Worker cancelled during crawl');
          await crawlerContext.teardown();
          return;
        }

        const { listingId, listingTitle, checkIn, checkOut } = request.userData;

        // Apply jitter delay using bottleneck
        await limiter.schedule(() => {
          const jitterTime = Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1)) + JITTER_MIN_MS;
          logger.debug({ listingId, jitterTime }, 'Applying jitter delay');
          return new Promise(resolve => setTimeout(resolve, jitterTime));
        });

        // Make request with custom headers using sendRequest
        let response;
        let body;
        let statusCode;

        try {
          const result = await sendRequest({
            headers: {
              'cookie': session.cookie,
              'x-airbnb-api-key': session.xAirbnbApiKey,
              'user-agent': session.userAgent,
              'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
              'sec-ch-ua-platform': '"Windows"',
              'x-airbnb-graphql-platform': 'web',
            },
            responseType: 'text',
          });

          response = result;
          body = result.body;
          statusCode = result.statusCode;
        } catch (fetchError) {
          // Handle network errors
          const errorStatus = fetchError.response?.statusCode || fetchError.code;
          
          if (errorStatus === 403) {
            consecutive403Count++;
            logger.warn({ listingId, consecutive403Count }, 'Received 403 Forbidden');

            if (consecutive403Count >= FORTY_THREE_THRESHOLD) {
              logger.error({ consecutive403Count, threshold: FORTY_THREE_THRESHOLD }, '403 threshold exceeded');

              if (notificationService) {
                await notificationService.sendSystemAlert({
                  type: '403_THRESHOLD_EXCEEDED',
                  message: `Crawler received ${consecutive403Count} consecutive 403 errors. Initiating teardown.`,
                  errorCount: consecutive403Count,
                });
              }

              await crawlerContext.teardown();
              sendMessage({
                status: 'error',
                error: '403 threshold exceeded',
                consecutive403Count,
              });
              return;
            }
            return;
          }

          if (errorStatus === 429) {
            logger.warn({ listingId }, 'Received 429 Too Many Requests - backing off');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return;
          }

          logger.error({ error: fetchError.message, listingId }, 'Request failed');
          errorCount++;
          return;
        }

        // Reset 403 counter on successful request
        if (statusCode >= 200 && statusCode < 400) {
          consecutive403Count = 0;
        }

        try {
          // Parse JSON response (Airbnb API returns JSON)
          const data = JSON.parse(body?.toString() || '{}');

          // Handle case when API returns null data (invalid listing, auth issue, etc.)
          if (!data?.data) {
            if (data?.errors?.length > 0) {
              logger.warn({ listingId, errors: data.errors }, 'API returned errors');
            } else {
              logger.warn({ listingId }, 'API returned null data - listing may be unavailable');
            }
            // Treat as sold out: write to DB with price: null, isAvailable: false
            const success = await writeSoldOutListing({
              listingId,
              listingTitle,
              prisma,
              notificationService,
              price: null,
              currency: 'EUR',
            });

            if (success) {
              processedCount++;
            } else {
              errorCount++;
            }
            return;
          }

          const parseResult = airbnbResponseSchema.safeParse(data);
          if (!parseResult.success) {
            logger.error({ error: parseResult.error.format(), listingId }, 'Response validation failed');
            errorCount++;
            return;
          }

          const priceResult = extractPriceFromResponse(data);

          if (priceResult.error) {
            logger.error({ error: 'Failed to extract price', listingId }, 'Price extraction failed');
            errorCount++;
            return;
          }

          // Handle sold out / unavailable listings
          if (priceResult.price === null) {
            logger.warn({ listingId }, 'Price not found - marking listing as unavailable (sold out)');
            const success = await writeSoldOutListing({
              listingId,
              listingTitle,
              prisma,
              notificationService,
              price: null,
              currency: priceResult.currency || 'EUR',
            });

            if (success) {
              processedCount++;
            } else {
              errorCount++;
            }
            return;
          }

          // Listing is available with a valid price
          const isAvailable = true;
          const priceToWrite = priceResult.price;

          // Delta Detection: Fetch previous price BEFORE writing new log
          const previousLogs = await prisma.priceLog.findMany({
            where: { listingId },
            orderBy: { capturedAt: 'desc' },
            take: 1,
          });

          const previousLog = previousLogs.length > 0 ? previousLogs[0] : null;
          const previousPrice = previousLog ? previousLog.price : null;
          const previousIsAvailable = previousLog ? previousLog.isAvailable : null;

          // Calculate delta
          const delta = calculateDelta(priceToWrite, previousPrice);
          const availabilityChanged = hasAvailabilityChanged(isAvailable, previousIsAvailable);

          // Validate data with Zod schema before writing to database
          const validationResult = PriceLogInputSchema.safeParse({
            listingId,
            price: priceToWrite,
            currency: priceResult.currency || 'EUR',
            isAvailable,
            delta,
          });

          if (!validationResult.success) {
            logger.error({ error: validationResult.error.format(), listingId }, 'PriceLog validation failed');
            errorCount++;
            return;
          }

          // Write to database with delta
          await prisma.priceLog.create({
            data: validationResult.data,
          });

          logger.info(
            { listingId, price: priceToWrite, currency: priceResult.currency, delta, isAvailable },
            'PriceLog saved to database'
          );
          processedCount++;

          // Send business alert if delta or availability changed
          if (notificationService && (delta !== 0 || availabilityChanged)) {
            // Fire-and-forget: don't block on notification sending
            notificationService
              .sendBusinessAlert({
                listingTitle,
                listingUrl: `https://www.airbnb.com/rooms/${listingId}`,
                currentPrice: priceToWrite,
                previousPrice: previousPrice !== null ? previousPrice : undefined,
                delta,
                currency: priceResult.currency || 'EUR',
                isAvailable,
              })
              .catch((alertError) => {
                logger.error({ error: alertError.message, listingId }, 'Failed to send business alert');
              });
          }

          sendMessage({ status: 'completed', listingId, price: priceToWrite, delta });
        } catch (parseError) {
          logger.error({ error: parseError.message, listingId }, 'Failed to parse response');
          errorCount++;
        }
      },
      failedRequestHandler: async ({ request, error }) => {
        const { listingId } = request.userData;
        logger.error({ error: error.message, listingId }, 'Request failed');
        errorCount++;
      },
    });

    // Run the crawler
    logger.info('Starting Airbnb crawler');
    await crawler.run();

    if (!isShuttingDown) {
      sendMessage({
        status: 'completed',
        reason: 'all_done',
        processed: processedCount,
        errors: errorCount,
      });
    }

  } catch (error) {
    logger.error({ error: error.message }, 'Parser execution failed');
    sendMessage({ status: 'error', error: error.message });
  } finally {
    logger.info('Prisma disconnecting...');
    await prisma.$disconnect();
    logger.info('Prisma disconnected');

    // Signal that we're ready to terminate
    if (parentPort) {
      parentPort.postMessage('cancelled');
    }
  }
}

setupCancellationHandlers();
main();
