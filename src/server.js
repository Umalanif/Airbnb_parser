import express from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { ListingBatchInputSchema } from './schemas/listing-input.js';
import { PriceLogInputSchema, calculateDelta, hasAvailabilityChanged } from './schemas/price-log.js';
import logger from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Middleware to protect write endpoints with API key authentication
 * Checks for x-api-key header and validates against process.env.API_KEY
 */
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing x-api-key header',
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  next();
}

/**
 * POST /api/listings
 * Accepts array of Airbnb URLs, validates them, and upserts into Listing table
 * Body: { listings: [{ url: 'https://airbnb.com/rooms/123?check_in=...&check_out=...' }, ...] }
 * Protected by API key authentication
 */
app.post('/api/listings', requireApiKey, async (req, res) => {
  try {
    const { listings } = req.body;

    if (!Array.isArray(listings)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Expected { listings: [{ url: string }, ...] }',
      });
    }

    // Validate all URLs and extract IDs/dates using Zod
    // The schema transforms each url string into { id, checkIn, checkOut }
    const validatedListings = ListingBatchInputSchema.parse(
      listings.map((item) => ({ url: item.url }))
    );

    // Upsert each listing into the database
    const upsertResults = [];
    for (const item of validatedListings) {
      // After transformation, item.url contains { id, checkIn, checkOut }
      const { id, checkIn, checkOut } = item.url;

      // Reconstruct URL for storage (normalized form)
      const normalizedUrl = `https://www.airbnb.com/rooms/${id}?check_in=${checkIn}&check_out=${checkOut}`;

      // Check if listing with this ID already exists
      const existingListing = await prisma.listing.findUnique({
        where: { id }
      });

      let result;
      if (existingListing) {
        // Update existing listing with new dates and URL
        result = await prisma.listing.update({
          where: { id },
          data: {
            url: normalizedUrl,
            checkIn,
            checkOut,
            isActive: true,
          }
        });
      } else {
        // Create new listing
        result = await prisma.listing.create({
          data: {
            id,
            url: normalizedUrl,
            title: `Listing ${id}`,
            checkIn,
            checkOut,
            isActive: true,
          }
        });
      }

      upsertResults.push(result);
      logger.info({ listingId: id, checkIn, checkOut }, 'Listing upserted');
    }

    res.status(200).json({
      success: true,
      count: upsertResults.length,
      listings: upsertResults.map((l) => ({
        id: l.id,
        url: l.url,
        checkIn: l.checkIn,
        checkOut: l.checkOut,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error;
      logger.warn({ errors: zodError.issues }, 'Validation error on /api/listings');
      return res.status(400).json({
        error: 'Validation error',
        details: zodError.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    logger.error({ error: error.message }, 'Error on /api/listings');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/compare
 * Returns aggregated data: latest PriceLog for each active Listing
 * Query params (optional):
 *   - limit: max listings to return (default: 50)
 */
app.get('/api/compare', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;

    // Get all active listings with their latest price log
    const listings = await prisma.listing.findMany({
      where: { isActive: true },
      take: limit,
      include: {
        priceLogs: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Transform to aggregated response
    const compareData = listings.map((listing) => {
      const latestLog = listing.priceLogs[0];

      return {
        id: listing.id,
        url: listing.url,
        title: listing.title,
        checkIn: listing.checkIn,
        checkOut: listing.checkOut,
        currentPrice: latestLog?.price ?? null,
        currency: latestLog?.currency ?? 'EUR',
        isAvailable: latestLog?.isAvailable ?? true,
        delta: latestLog?.delta ?? 0,
        capturedAt: latestLog?.capturedAt ?? null,
      };
    });

    res.status(200).json({
      success: true,
      count: compareData.length,
      listings: compareData,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error on /api/compare');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * Create Express server instance
 * @param {number} port - Port to listen on
 * @returns {import('express').Express} Configured Express app
 */
export function createServer(port = 3000) {
  return { app, port };
}

export default app;
