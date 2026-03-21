/**
 * Smoke Test: Phase 9 - Delta Detection and Persistence
 * 
 * Tests:
 * 1. Zod validation for PriceLog data
 * 2. Delta calculation logic
 * 3. Availability change detection
 * 4. Database write with delta field
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PriceLogInputSchema, calculateDelta, hasAvailabilityChanged } from '../src/schemas/price-log.js';
import logger from '../src/utils/logger.js';

const prisma = new PrismaClient();

async function testZodValidation() {
  logger.info('=== Test 1: Zod Validation ===');
  
  // Valid data
  const validData = {
    listingId: 'test-123',
    price: 150.50,
    currency: 'EUR',
    isAvailable: true,
    delta: 10.00,
  };
  
  const validResult = PriceLogInputSchema.safeParse(validData);
  if (!validResult.success) {
    logger.error({ error: validResult.error.format() }, 'Valid data failed validation');
    return false;
  }
  logger.info('✓ Valid data passed validation');
  
  // Invalid data (negative price)
  const invalidData = {
    listingId: 'test-123',
    price: -50,
    currency: 'EUR',
    isAvailable: true,
    delta: 0,
  };
  
  const invalidResult = PriceLogInputSchema.safeParse(invalidData);
  if (invalidResult.success) {
    logger.error('Invalid data (negative price) should have failed validation');
    return false;
  }
  logger.info('✓ Invalid data correctly rejected');
  
  return true;
}

async function testDeltaCalculation() {
  logger.info('=== Test 2: Delta Calculation ===');
  
  // Price increase
  const delta1 = calculateDelta(150, 100);
  if (delta1 !== 50) {
    logger.error({ delta1 }, 'Delta calculation failed for price increase');
    return false;
  }
  logger.info('✓ Price increase delta correct: +50');
  
  // Price decrease
  const delta2 = calculateDelta(80, 100);
  if (delta2 !== -20) {
    logger.error({ delta2 }, 'Delta calculation failed for price decrease');
    return false;
  }
  logger.info('✓ Price decrease delta correct: -20');
  
  // No previous price
  const delta3 = calculateDelta(100, null);
  if (delta3 !== 0) {
    logger.error({ delta3 }, 'Delta should be 0 for null previous price');
    return false;
  }
  logger.info('✓ Null previous price delta correct: 0');
  
  return true;
}

async function testAvailabilityChange() {
  logger.info('=== Test 3: Availability Change Detection ===');
  
  // Available -> Sold Out
  const changed1 = hasAvailabilityChanged(false, true);
  if (!changed1) {
    logger.error('Should detect available -> sold out change');
    return false;
  }
  logger.info('✓ Detected available -> sold out change');
  
  // Sold Out -> Available
  const changed2 = hasAvailabilityChanged(true, false);
  if (!changed2) {
    logger.error('Should detect sold out -> available change');
    return false;
  }
  logger.info('✓ Detected sold out -> available change');
  
  // No change
  const changed3 = hasAvailabilityChanged(true, true);
  if (changed3) {
    logger.error('Should not detect change when status is same');
    return false;
  }
  logger.info('✓ No change detected for same status');
  
  // Null previous
  const changed4 = hasAvailabilityChanged(true, null);
  if (changed4) {
    logger.error('Should not detect change for null previous');
    return false;
  }
  logger.info('✓ No change detected for null previous');
  
  return true;
}

async function testDatabasePersistence() {
  logger.info('=== Test 4: Database Persistence ===');
  
  const testListingId = 'smoke-test-listing';
  
  try {
    // Create test listing if not exists
    await prisma.listing.upsert({
      where: { id: testListingId },
      update: {},
      create: {
        id: testListingId,
        url: `https://www.airbnb.com/rooms/${testListingId}`,
        title: 'Smoke Test Listing',
        isActive: true,
      },
    });
    logger.info('✓ Test listing created/updated');
    
    // Get previous price
    const previousLogs = await prisma.priceLog.findMany({
      where: { listingId: testListingId },
      orderBy: { capturedAt: 'desc' },
      take: 1,
    });
    
    const previousPrice = previousLogs.length > 0 ? previousLogs[0].price : null;
    const currentPrice = previousPrice ? previousPrice + 25 : 100;
    const delta = calculateDelta(currentPrice, previousPrice);
    
    // Create PriceLog with delta
    const priceLogData = {
      listingId: testListingId,
      price: currentPrice,
      currency: 'EUR',
      isAvailable: true,
      delta,
    };
    
    const validationResult = PriceLogInputSchema.safeParse(priceLogData);
    if (!validationResult.success) {
      logger.error({ error: validationResult.error.format() }, 'Validation failed');
      return false;
    }
    
    await prisma.priceLog.create({
      data: validationResult.data,
    });
    
    logger.info({ price: currentPrice, delta, isAvailable: true }, '✓ PriceLog saved to database');
    
    // Verify the record was saved correctly
    const savedLog = await prisma.priceLog.findFirst({
      where: { listingId: testListingId },
      orderBy: { capturedAt: 'desc' },
    });
    
    if (!savedLog) {
      logger.error('Failed to retrieve saved PriceLog');
      return false;
    }
    
    if (savedLog.price !== currentPrice) {
      logger.error({ savedLog, expected: currentPrice }, 'Price mismatch');
      return false;
    }
    
    if (savedLog.delta !== delta) {
      logger.error({ savedLog, expected: delta }, 'Delta mismatch');
      return false;
    }
    
    if (savedLog.isAvailable !== true) {
      logger.error({ savedLog }, 'isAvailable mismatch');
      return false;
    }
    
    logger.info({ savedLog }, '✓ Database record verified');
    
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Database test failed');
    return false;
  }
}

async function runSmokeTests() {
  logger.info('=================================');
  logger.info('Phase 9 Smoke Test: Delta Detection & Persistence');
  logger.info('=================================');
  
  const results = [];
  
  results.push(await testZodValidation());
  results.push(await testDeltaCalculation());
  results.push(await testAvailabilityChange());
  results.push(await testDatabasePersistence());
  
  await prisma.$disconnect();
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  logger.info('=================================');
  logger.info(`Results: ${passed}/${total} tests passed`);
  logger.info('=================================');
  
  if (passed === total) {
    logger.info('✅ All smoke tests passed!');
    process.exit(0);
  } else {
    logger.error('❌ Some tests failed');
    process.exit(1);
  }
}

runSmokeTests().catch((error) => {
  logger.error({ error: error.message }, 'Smoke test crashed');
  prisma.$disconnect();
  process.exit(1);
});
