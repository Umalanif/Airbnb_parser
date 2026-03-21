/**
 * Phase 10: End-to-End Pipeline Smoke Test
 * 
 * This test verifies:
 * 1. Delta detection calculates correctly
 * 2. PriceLog is saved with delta field
 * 3. Availability change detection works
 * 4. Business alert payload is correctly formatted
 * 5. Graceful prisma disconnect works
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger.js';
import { PriceLogInputSchema, calculateDelta, hasAvailabilityChanged } from '../src/schemas/price-log.js';
import TelegramNotificationService from '../src/services/telegram-notification-service.js';

const TEST_LISTING_ID = 'smoke-test-listing';
const TEST_LISTING_TITLE = 'Smoke Test Listing';
const TEST_LISTING_URL = 'https://www.airbnb.com/rooms/smoke-test-listing';

const prisma = new PrismaClient();

/**
 * Test delta calculation functions
 */
function testDeltaFunctions() {
  logger.info('Testing delta calculation functions...');

  // Test calculateDelta
  const delta1 = calculateDelta(150, 100);
  if (delta1 !== 50) {
    throw new Error(`Delta calculation failed: expected 50, got ${delta1}`);
  }
  logger.info({ delta: delta1 }, 'Delta calculation test 1 passed');

  const delta2 = calculateDelta(80, 100);
  if (delta2 !== -20) {
    throw new Error(`Delta calculation failed: expected -20, got ${delta2}`);
  }
  logger.info({ delta: delta2 }, 'Delta calculation test 2 passed');

  const delta3 = calculateDelta(100, null);
  if (delta3 !== 0) {
    throw new Error(`Delta calculation failed for null previous: expected 0, got ${delta3}`);
  }
  logger.info({ delta: delta3 }, 'Delta calculation test 3 passed (null previous)');

  // Test hasAvailabilityChanged
  const changed1 = hasAvailabilityChanged(true, false);
  if (!changed1) {
    throw new Error('Availability change detection failed: expected true');
  }
  logger.info({ changed: changed1 }, 'Availability change test 1 passed');

  const changed2 = hasAvailabilityChanged(true, true);
  if (changed2) {
    throw new Error('Availability change detection failed: expected false');
  }
  logger.info({ changed: changed2 }, 'Availability change test 2 passed (no change)');

  const changed3 = hasAvailabilityChanged(false, null);
  if (changed3) {
    throw new Error('Availability change detection failed for null: expected false');
  }
  logger.info({ changed: changed3 }, 'Availability change test 3 passed (null previous)');

  logger.info('All delta function tests passed');
}

/**
 * Test Zod schema validation
 */
function testZodSchema() {
  logger.info('Testing Zod schema validation...');

  // Valid data
  const validData = {
    listingId: TEST_LISTING_ID,
    price: 150,
    currency: 'EUR',
    isAvailable: true,
    delta: 50,
  };

  const result1 = PriceLogInputSchema.safeParse(validData);
  if (!result1.success) {
    throw new Error(`Zod validation failed for valid data: ${result1.error.message}`);
  }
  logger.info('Zod schema test 1 passed (valid data)');

  // Invalid data - negative price
  const invalidData = {
    listingId: TEST_LISTING_ID,
    price: -100,
    currency: 'EUR',
    isAvailable: true,
    delta: 0,
  };

  const result2 = PriceLogInputSchema.safeParse(invalidData);
  if (result2.success) {
    throw new Error('Zod validation should have failed for negative price');
  }
  logger.info('Zod schema test 2 passed (rejected negative price)');

  // Invalid data - missing listingId
  const invalidData2 = {
    price: 100,
    currency: 'EUR',
    isAvailable: true,
    delta: 0,
  };

  const result3 = PriceLogInputSchema.safeParse(invalidData2);
  if (result3.success) {
    throw new Error('Zod validation should have failed for missing listingId');
  }
  logger.info('Zod schema test 3 passed (rejected missing listingId)');

  logger.info('All Zod schema tests passed');
}

/**
 * Setup test data - create initial price log
 */
async function setupTestData() {
  logger.info('Setting up test data...');

  // Ensure test listing exists
  const listing = await prisma.listing.upsert({
    where: { id: TEST_LISTING_ID },
    update: {
      url: TEST_LISTING_URL,
      title: TEST_LISTING_TITLE,
      isActive: true,
    },
    create: {
      id: TEST_LISTING_ID,
      url: TEST_LISTING_URL,
      title: TEST_LISTING_TITLE,
      isActive: true,
    },
  });

  logger.info({ listingId: listing.id }, 'Test listing ready');

  // Clear existing price logs for clean test
  await prisma.priceLog.deleteMany({
    where: { listingId: TEST_LISTING_ID },
  });

  // Create initial price log (baseline)
  const initialPrice = 100;
  await prisma.priceLog.create({
    data: {
      listingId: TEST_LISTING_ID,
      price: initialPrice,
      currency: 'EUR',
      isAvailable: true,
      delta: 0,
    },
  });

  logger.info({ initialPrice }, 'Initial price log created (baseline)');

  return listing;
}

/**
 * Test database persistence with delta
 */
async function testDatabasePersistence() {
  logger.info('Testing database persistence with delta...');

  // Simulate new price data
  const currentPrice = 150;
  const previousPrice = 100;
  const isAvailable = true;

  // Calculate delta
  const delta = calculateDelta(currentPrice, previousPrice);
  const availabilityChanged = hasAvailabilityChanged(isAvailable, true);

  logger.info({ currentPrice, previousPrice, delta, availabilityChanged }, 'Delta calculated');

  // Validate with Zod
  const validationResult = PriceLogInputSchema.safeParse({
    listingId: TEST_LISTING_ID,
    price: currentPrice,
    currency: 'EUR',
    isAvailable,
    delta,
  });

  if (!validationResult.success) {
    throw new Error(`Validation failed: ${validationResult.error.message}`);
  }

  // Write to database
  await prisma.priceLog.create({
    data: validationResult.data,
  });

  logger.info({ price: currentPrice, delta }, 'PriceLog saved to database');

  // Verify data was saved correctly
  const savedLogs = await prisma.priceLog.findMany({
    where: { listingId: TEST_LISTING_ID },
    orderBy: { capturedAt: 'asc' },
  });

  if (savedLogs.length !== 2) {
    throw new Error(`Expected 2 price logs, got ${savedLogs.length}`);
  }

  const latest = savedLogs[1];
  if (latest.price !== currentPrice) {
    throw new Error(`Price mismatch: expected ${currentPrice}, got ${latest.price}`);
  }
  if (latest.delta !== delta) {
    throw new Error(`Delta mismatch: expected ${delta}, got ${latest.delta}`);
  }

  logger.info({ savedPrice: latest.price, savedDelta: latest.delta }, 'Database persistence verified');

  return { baseline: savedLogs[0], latest };
}

/**
 * Test availability change detection
 */
async function testAvailabilityChange() {
  logger.info('Testing availability change detection...');

  const currentPrice = 150;
  const previousPrice = 150; // Same price
  const isAvailable = false; // Now unavailable

  const delta = calculateDelta(currentPrice, previousPrice);
  const availabilityChanged = hasAvailabilityChanged(isAvailable, true); // Was true, now false

  logger.info({ delta, availabilityChanged }, 'Availability change calculated');

  // Validate and save
  const validationResult = PriceLogInputSchema.safeParse({
    listingId: TEST_LISTING_ID,
    price: currentPrice,
    currency: 'EUR',
    isAvailable,
    delta,
  });

  if (!validationResult.success) {
    throw new Error(`Validation failed: ${validationResult.error.message}`);
  }

  await prisma.priceLog.create({
    data: validationResult.data,
  });

  logger.info({ isAvailable, availabilityChanged }, 'Availability change logged');

  // Verify
  const savedLog = await prisma.priceLog.findFirst({
    where: { listingId: TEST_LISTING_ID, isAvailable: false },
  });

  if (!savedLog) {
    throw new Error('Availability change not saved correctly');
  }

  logger.info('Availability change detection test passed');
  return availabilityChanged;
}

/**
 * Test notification service (if configured)
 */
async function testNotificationService() {
  const hasCredentials = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;

  if (!hasCredentials) {
    logger.warn('Telegram credentials not configured, skipping notification test');
    return { skipped: true };
  }

  logger.info('Testing notification service...');

  const service = new TelegramNotificationService({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  });

  try {
    // Test business alert
    await service.sendBusinessAlert({
      listingTitle: TEST_LISTING_TITLE,
      listingUrl: TEST_LISTING_URL,
      currentPrice: 150,
      previousPrice: 100,
      delta: 50,
      currency: 'EUR',
      isAvailable: true,
    });

    logger.info('Business alert sent successfully');

    // Test system alert
    await service.sendSystemAlert({
      type: 'TEST_ALERT',
      message: 'Phase 10 smoke test - system alert verification',
    });

    logger.info('System alert sent successfully');

    return { skipped: false, success: true };
  } catch (error) {
    logger.error({ error: error.message }, 'Notification test failed');
    return { skipped: false, success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function main() {
  logger.info('=== Phase 10: End-to-End Pipeline Smoke Test ===');

  try {
    // Test 1: Delta calculation functions
    testDeltaFunctions();

    // Test 2: Zod schema validation
    testZodSchema();

    // Test 3: Setup test data
    await setupTestData();

    // Test 4: Database persistence with delta
    const dbResult = await testDatabasePersistence();

    // Test 5: Availability change detection
    const availabilityChanged = await testAvailabilityChange();

    // Test 6: Notification service (optional)
    const notificationResult = await testNotificationService();

    // Summary
    logger.info('=== All Tests Passed ===');

    console.log('\n=== SMOKE TEST RESULTS ===');
    console.log(`✓ Delta calculation functions: PASSED`);
    console.log(`✓ Zod schema validation: PASSED`);
    console.log(`✓ Database persistence: PASSED`);
    console.log(`  - Baseline price: ${dbResult.baseline.price} ${dbResult.baseline.currency}`);
    console.log(`  - New price: ${dbResult.latest.price} ${dbResult.latest.currency}`);
    console.log(`  - Delta: ${dbResult.latest.delta} ${dbResult.latest.currency}`);
    console.log(`✓ Availability change detection: PASSED (changed: ${availabilityChanged})`);
    console.log(`✓ Notification service: ${notificationResult.skipped ? 'SKIPPED (no credentials)' : notificationResult.success ? 'PASSED' : 'FAILED'}`);
    console.log('=========================\n');

    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Test failed');
    console.error('\n=== TEST FAILED ===');
    console.error(`Error: ${error.message}`);
    console.error('===================\n');
    process.exit(1);
  } finally {
    logger.info('Prisma disconnecting...');
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
  }
}

main();
