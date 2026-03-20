import 'dotenv/config';
import { parentPort, workerData } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import { gotScraping } from 'got-scraping';
import logger from '../src/utils/logger.js';
import { buildAirbnbUrl } from '../src/utils/url-builder.js';
import { extractPriceFromResponse, airbnbResponseSchema } from '../src/schemas/airbnb-response.js';

const SESSION_ID = 'airbnb_main';

let isShuttingDown = false;

async function main() {
  const prisma = new PrismaClient();
  
  try {
    if (isShuttingDown) {
      logger.info('Worker cancelled before start');
      return;
    }
    const session = await prisma.session.findUnique({
      where: { id: SESSION_ID },
    });

    if (!session) {
      logger.error({ sessionId: SESSION_ID }, 'Session not found in database');
      return;
    }

    const listings = await prisma.listing.findMany({
      where: { isActive: true },
    });

    if (listings.length === 0) {
      logger.warn('No active listings found');
      return;
    }

    for (const listing of listings) {
      if (isShuttingDown) {
        logger.info('Worker cancelled during iteration');
        break;
      }

      const listingId = workerData?.listingId || listing.id;
      const checkIn = workerData?.checkIn || process.env.CHECK_IN || '2026-04-15';
      const checkOut = workerData?.checkOut || process.env.CHECK_OUT || '2026-04-20';

      const url = buildAirbnbUrl(listingId, checkIn, checkOut, {
        locale: 'en',
        currency: 'EUR',
      });

      const headers = {
        'cookie': session.cookie,
        'x-airbnb-api-key': session.xAirbnbApiKey,
        'user-agent': session.userAgent,
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        'sec-ch-ua-platform': '"Windows"',
        'x-airbnb-graphql-platform': 'web',
      };

      logger.info({ url, listingId, checkIn, checkOut }, 'Fetching price from Airbnb');

      logger.info({ url: url.toString() }, 'Final Request URL');

      const response = await gotScraping.get(url, { headers });
      logger.info({ body: response.body }, 'Raw API Response');

      const data = JSON.parse(response.body);

      const parseResult = airbnbResponseSchema.safeParse(data);
      if (!parseResult.success) {
        logger.error({ error: parseResult.error.format() }, 'Response validation failed');
        continue;
      }

      const priceResult = extractPriceFromResponse(data);

      if (priceResult.error) {
        logger.error({ error: priceResult.error.format() }, 'Failed to parse response');
        continue;
      }

      if (priceResult.price === null) {
        logger.warn({ listingId }, 'Price not found in response');
        continue;
      }

      await prisma.priceLog.create({
        data: {
          listingId,
          price: priceResult.price,
          currency: priceResult.currency || 'EUR',
        },
      });

      logger.info({ listingId, price: priceResult.price, currency: priceResult.currency }, 'Price saved to database');

      if (parentPort) {
        parentPort.postMessage({ status: 'completed', listingId, price: priceResult.price });
      }
    }

  } catch (error) {
    logger.error({ error: error.message }, 'Parser execution failed');
    if (parentPort) {
      parentPort.postMessage({ status: 'error', error: error.message });
    }
  } finally {
    logger.info('Prisma disconnecting...');
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
  }
}

if (parentPort) {
  parentPort.on('message', (message) => {
    if (message === 'cancel' || message?.command === 'cancel') {
      logger.info('Received cancel signal');
      isShuttingDown = true;
    }
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM');
    isShuttingDown = true;
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT');
    isShuttingDown = true;
  });
}

main();