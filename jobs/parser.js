import 'dotenv/config';
import { parentPort, workerData } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import { gotScraping } from 'got-scraping';
import logger from '../src/utils/logger.js';
import { buildAirbnbApiUrl } from '../src/utils/url-builder.js';
import { extractPriceFromResponse } from '../src/schemas/airbnb-response.js';

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

    const listingId = workerData?.listingId || process.env.LISTING_ID || '12345678';
    const checkIn = workerData?.checkIn || process.env.CHECK_IN || '2026-04-01';
    const checkOut = workerData?.checkOut || process.env.CHECK_OUT || '2026-04-07';

    const url = buildAirbnbApiUrl(listingId, checkIn, checkOut, {
      locale: 'en',
      currency: 'EUR',
    });

    const headers = {
      'cookie': session.cookie,
      'x-airbnb-api-key': session.xAirbnbApiKey,
      'user-agent': session.userAgent,
      'sec-ch-ua': '"Chromium";v="146", "Not:A-Brand";v="24"',
      'sec-ch-ua-platform': '"Windows"',
      'x-airbnb-graphql-platform': 'web',
    };

    logger.info({ url, listingId, checkIn, checkOut }, 'Fetching price from Airbnb');

    const response = await gotScraping.get(url, { headers });
    const data = JSON.parse(response.body);

    const priceResult = extractPriceFromResponse(data);

    if (priceResult.error) {
      logger.error({ error: priceResult.error.format() }, 'Failed to parse response');
      return;
    }

    if (priceResult.price === null) {
      logger.warn({ listingId }, 'Price not found in response');
      return;
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